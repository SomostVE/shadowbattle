import { BATTLE_EVENT } from "../../battle-events.js";
import { resolveEffectCommands } from "../../effect-commands.js";
import { banishBoardCard, destroyBoardAmulet, restoreOriginalCardForm, returnBoardCardToHand } from "../../zone-actions.js";
import { evaluateWorldsBeyondClassCondition } from "./class-conditions.js";
import { spellboostWorldsBeyondHand, worldsBeyondCardX } from "./spellboost.js";
import { getWorldsBeyondEngageInfo } from "./engage.js";
import { preprocessWorldsBeyondFuseText } from "./fuse.js";
import {
  resolveWorldsBeyondGenericEffects,
  stripWorldsBeyondGenericEffectText
} from "./generic-effects.js";
import { baseText, section } from "./v5/battle-engine-v5-text.js";
import { targetEffectSpec } from "./v5/battle-engine-v5-targeting.js";
import {
  compileWorldsBeyondPostTargetCommands,
  compileWorldsBeyondPreTargetCommands,
  compileWorldsBeyondTrailingFilteredDrawCommands
} from "./v6/effect-commands.js";

const SUPPORTED_TARGET_KINDS = new Set(["damage", "destroy", "banish", "return", "set-defense", "stat-debuff"]);
const HAND_DISCARD_SELECTION = /\bselect (?:a|an|one) (?:[a-z]+craft )?card in your hand and discard it\b/i;
const DAMAGE_NUMBER = "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)";
const TRAILING_TYPED_DRAW = /\bdraw\s+(?:a|an|one)\s+[a-z]+craft\s+follower\s*\.?\s*$/i;
const TRAILING_NAMED_DRAW = /\bdraw\s+(?:a|an|one)\s+[A-Z][A-Za-z0-9'’&,:\- ]+?\s*\.?\s*$/;
const ADD_TO_HAND_SINGLE = /^\s*Add\s+(?:a|an|one)\s+.+?\s+to your hand\s*\.?\s*$/i;
const SUMMON_COPIES = /\bSummon\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+copies of\s+[^.]+/gi;
const SUMMON_SINGLE = /\bSummon\s+(?:a|an|one)\s+[^.]+/gi;

export function getWorldsBeyondTargetRequirement(source, trigger = "play", mode = null, player = null) {
  if (!source?.card) return null;
  const originalText = preprocessWorldsBeyondFuseText(source, triggerText(source, trigger, mode));
  if (!originalText) return null;
  const evaluationPlayer = prospectiveTargetPlayer(player, source, trigger);
  const conditional = evaluationPlayer ? evaluateWorldsBeyondClassCondition(originalText, evaluationPlayer, source.card) : { text: originalText, active: true };
  if (!conditional.active || !conditional.text) return null;
  const resolvedText = resolveWorldsBeyondVariables(conditional.text, source);
  const spec = worldsBeyondTargetEffectSpec(resolvedText, source);
  return spec ? { ...spec, text: resolvedText } : null;
}

export function requiresWorldsBeyondHandDiscard(source, trigger = "play", mode = null, player = null) {
  if (!source?.card) return false;
  const originalText = preprocessWorldsBeyondFuseText(source, triggerText(source, trigger, mode));
  if (!originalText) return false;
  const evaluationPlayer = prospectiveTargetPlayer(player, source, trigger);
  const conditional = evaluationPlayer ? evaluateWorldsBeyondClassCondition(originalText, evaluationPlayer, source.card) : { text: originalText, active: true };
  return Boolean(conditional.active && HAND_DISCARD_SELECTION.test(conditional.text));
}

export function canSkipWorldsBeyondHandDiscard(source, trigger = "play", mode = null, player = null) {
  if (trigger !== "engage" || !source?.card || !player) return false;
  const originalText = preprocessWorldsBeyondFuseText(source, triggerText(source, trigger, mode));
  if (!originalText) return false;
  const conditional = evaluateWorldsBeyondClassCondition(originalText, player, source.card);
  if (!conditional.active || !conditional.text) return false;
  const match = HAND_DISCARD_SELECTION.exec(conditional.text);
  if (!match || match.index <= 0) return false;
  const options = (player.hand ?? []).filter(item => item.instanceId !== source.instanceId);
  if (options.length) return false;
  const prefix = conditional.text.slice(0, match.index).trim();
  if (!prefix) return false;
  const prefixTarget = worldsBeyondTargetEffectSpec(prefix, source);
  return !unsupportedResidualText(prefix, { targetSpec: prefixTarget, discardRequired: false });
}

export function getWorldsBeyondTriggerSupport(source, trigger = "play", mode = null, player = null) {
  if (!source?.card) return { supported: false, text: "", residual: "missing source card", targetSpec: null, discardRequired: false };
  const originalText = preprocessWorldsBeyondFuseText(source, triggerText(source, trigger, mode));
  if (!originalText) return { supported: true, text: "", residual: "", targetSpec: null, discardRequired: false, conditionInactive: false };

  const evaluationPlayer = prospectiveTargetPlayer(player, source, trigger);
  const conditional = evaluationPlayer
    ? evaluateWorldsBeyondClassCondition(originalText, evaluationPlayer, source.card)
    : { text: originalText, active: true, notes: [], mechanic: null };
  if (!conditional.active || !conditional.text) {
    return {
      supported: true,
      text: conditional.text ?? "",
      residual: "",
      targetSpec: null,
      discardRequired: false,
      conditionInactive: true,
      notes: conditional.notes ?? [],
      mechanic: conditional.mechanic ?? null
    };
  }

  const text = resolveWorldsBeyondVariables(conditional.text, source);
  const targetSpec = worldsBeyondTargetEffectSpec(text, source);
  const discardRequired = HAND_DISCARD_SELECTION.test(text);
  const unsupportedTarget = Boolean(targetSpec && !SUPPORTED_TARGET_KINDS.has(targetSpec.kind));
  const unsupportedChoice = hasUnsupportedChoiceOrCondition(text, { targetSpec, discardRequired });
  const residual = unsupportedResidualText(text, { targetSpec, discardRequired });
  return {
    supported: !unsupportedTarget && !unsupportedChoice && !residual,
    text,
    residual,
    targetSpec,
    discardRequired,
    conditionInactive: false,
    notes: conditional.notes ?? [],
    mechanic: conditional.mechanic ?? null
  };
}

export function getWorldsBeyondTargetOptions(session, { trigger = "play", playerIndex, source, mode = null } = {}) {
  const player = session.getPlayer(playerIndex);
  const requirement = getWorldsBeyondTargetRequirement(source, trigger, mode, player);
  if (!requirement) return [];
  return targetOptionsForSpec(session, playerIndex, requirement);
}

export function resolveWorldsBeyondTrigger(session, { trigger, playerIndex, source, targetInstanceId = null, discardInstanceId = null, mode = null }) {
  if (!source?.card) return { applied: false, unresolved: false, text: "" };
  const originalText = preprocessWorldsBeyondFuseText(source, triggerText(source, trigger, mode));
  if (!originalText) return { applied: false, unresolved: false, text: "" };

  const player = session.getPlayer(playerIndex);
  const preview = evaluateWorldsBeyondClassCondition(originalText, player, source.card);
  if (!preview.active || !preview.text) {
    session.emit(BATTLE_EVENT.ABILITY_TRIGGER, {
      actor: playerIndex,
      payload: {
        trigger,
        mode: mode?.kind ?? null,
        card: session.cardView(source),
        text: originalText,
        resolved: true,
        applied: false,
        conditionInactive: true,
        conditionNotes: preview.notes,
        classMechanic: preview.mechanic
      }
    });
    return { applied: false, unresolved: false, text: originalText, conditionInactive: true, notes: preview.notes };
  }

  const text = resolveWorldsBeyondVariables(preview.text, source);
  const targetSpec = worldsBeyondTargetEffectSpec(text, source);
  const targetOptions = targetSpec ? targetOptionsForSpec(session, playerIndex, targetSpec) : [];
  const targetPlayer = targetSpec ? targetPlayerForSpec(playerIndex, targetSpec) : null;
  const discardRequired = HAND_DISCARD_SELECTION.test(text);
  const discardOptions = discardRequired ? player.hand.filter(item => item.instanceId !== source.instanceId) : [];
  const discardCanSkip = discardRequired && canSkipWorldsBeyondHandDiscard(source, trigger, mode, player);
  let target = null;
  let targetMissing = false;
  let invalidTarget = false;
  let discard = null;
  let discardMissing = false;
  let invalidDiscard = false;

  if (targetSpec && targetOptions.length) {
    target = targetOptions.find(unit => unit.instanceId === targetInstanceId) ?? null;
    targetMissing = !targetInstanceId;
    invalidTarget = Boolean(targetInstanceId && !target);
  }
  if (discardRequired) {
    discard = discardOptions.find(item => item.instanceId === discardInstanceId) ?? null;
    discardMissing = !discardInstanceId && !discardCanSkip;
    invalidDiscard = Boolean(discardInstanceId && !discard);
  }

  const unsupportedTarget = Boolean(targetSpec && !SUPPORTED_TARGET_KINDS.has(targetSpec.kind));
  const unsupportedChoice = hasUnsupportedChoiceOrCondition(text, { targetSpec, discardRequired });
  const unsupportedResidual = unsupportedResidualText(text, { targetSpec, discardRequired });
  const supportBlocked = unsupportedTarget || unsupportedChoice || Boolean(unsupportedResidual);
  const unresolved = targetMissing || invalidTarget || discardMissing || invalidDiscard || supportBlocked;

  const conditional = unresolved
    ? preview
    : evaluateWorldsBeyondClassCondition(originalText, player, source.card, { consume: true });
  const resolvedText = resolveWorldsBeyondVariables(conditional.text || text, source);

  session.emit(BATTLE_EVENT.ABILITY_TRIGGER, {
    actor: playerIndex,
    payload: {
      trigger,
      mode: mode?.kind ?? null,
      card: session.cardView(source),
      text: resolvedText,
      originalText,
      resolved: !unresolved,
      target: target ? session.cardView(target) : null,
      targetKind: targetSpec?.kind ?? null,
      targetSide: targetSpec?.targetSide ?? "enemy",
      targetPlayer,
      targetRequired: Boolean(targetSpec && targetOptions.length),
      targetAvailable: targetOptions.length > 0,
      discard: discard ? session.cardView(discard) : null,
      discardRequired,
      discardAvailable: discardOptions.length > 0,
      discardSkipped: discardCanSkip && !discard,
      unsupportedResidual: unsupportedResidual || null,
      supportBlocked,
      conditionNotes: conditional.notes,
      classMechanic: conditional.mechanic
    }
  });

  if (unresolved) {
    return {
      applied: false,
      unresolved: true,
      text: resolvedText,
      targetSpec,
      target,
      discard,
      residual: unsupportedResidual,
      notes: conditional.notes
    };
  }
  return executeSimpleEffects(session, { text: resolvedText, playerIndex, source, targetSpec, target, discard, notes: conditional.notes });
}

export function gainWorldsBeyondShadows(session, playerIndex, amount = 1) {
  const player = session.getPlayer(playerIndex);
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return Number(player.resources?.shadows ?? 0);
  player.resources.shadows = Math.max(0, Number(player.resources?.shadows ?? 0)) + value;
  return player.resources.shadows;
}

export function gainWorldsBeyondEarthSigils(session, playerIndex, amount = 1) {
  const player = session.getPlayer(playerIndex);
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return Number(player.resources?.earthSigils ?? 0);
  player.resources.earthSigils = Math.max(0, Number(player.resources?.earthSigils ?? 0)) + value;
  return player.resources.earthSigils;
}

export function destroyWorldsBeyondFollower(session, playerIndex, instanceId, options = {}) {
  const target = session.findBoardCard(playerIndex, instanceId);
  if (options.abilityDestroy && hasWorldsBeyondAbilityDestructionImmunity(target)) return null;
  const destroyed = session.destroyFollower(playerIndex, instanceId, options);
  if (destroyed) {
    gainWorldsBeyondShadows(session, playerIndex, 1);
    resolveWorldsBeyondTrigger(session, { trigger: "last-words", playerIndex, source: destroyed });
  }
  return destroyed;
}

function destroyWorldsBeyondTargetCard(session, playerIndex, target, options = {}) {
  if (options.abilityDestroy && hasWorldsBeyondAbilityDestructionImmunity(target)) return null;
  if (cardType(target) === "follower") return destroyWorldsBeyondFollower(session, playerIndex, target.instanceId, options);
  if (cardType(target) !== "amulet") return null;

  const destroyed = destroyBoardAmulet(session, playerIndex, target.instanceId, options);
  if (!destroyed) return null;
  gainWorldsBeyondShadows(session, playerIndex, 1);
  resolveWorldsBeyondTrigger(session, { trigger: "last-words", playerIndex, source: destroyed });
  restoreOriginalCardForm(destroyed);
  return destroyed;
}

function hasWorldsBeyondAbilityDestructionImmunity(target) {
  return /\bcan['’]?t be destroyed by abilities\b/i.test(String(target?.card?.text ?? target?.text ?? ""));
}

function prospectiveTargetPlayer(player, source, trigger) {
  if (!player || trigger !== "play" || !source?.instanceId) return player;
  const sourceStillInHand = (player.hand ?? []).some(item => item?.instanceId === source.instanceId);
  if (!sourceStillInHand) return player;
  return {
    ...player,
    cardsPlayedThisTurn: Number(player.cardsPlayedThisTurn ?? 0) + 1
  };
}

function triggerText(source, trigger, mode) {
  const text = String(source?.activeText ?? source?.card?.text ?? "");
  if (trigger === "play") return baseText(mode?.text ?? text);
  if (trigger === "engage") return getWorldsBeyondEngageInfo(source)?.text ?? "";
  if (trigger === "strike") return section(text, "strike");
  if (trigger === "evolve") return replicateFanfareIfRequested(text, section(text, "evolve") || naturalLifecycle(text, /(?<!["“])when this follower evolves,\s*/i));
  if (trigger === "super-evolve") return replicateFanfareIfRequested(text, section(text, "super-evolve"));
  if (trigger === "last-words") return section(text, "last words");
  if (trigger === "turn-start") return section(text, "at the start of your turn") || naturalLifecycle(text, /(?<!["“])at the start of your turn,\s*/i);
  if (trigger === "turn-end") return section(text, "at the end of your turn") || naturalLifecycle(text, /(?<!["“])at the end of your turn,\s*/i);
  return "";
}

function replicateFanfareIfRequested(fullText, triggerSection) {
  if (!/replicate the effects? of this card'?s fanfare ability/i.test(String(triggerSection ?? ""))) return triggerSection;
  return baseText(fullText);
}

function resolveWorldsBeyondVariables(textValue, source) {
  let text = String(textValue ?? "");
  if (!/\bX\b/.test(text)) return text;

  if (/\bX is this follower'?s attack\b/i.test(text)) {
    const x = currentSourceAttack(source);
    text = text.replace(/\s*X is this follower'?s attack\s*\.?/gi, " ");
    return text
      .replace(/\bX\b/g, String(x))
      .replace(/\s+/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .trim();
  }

  const hasExplicitX = Number.isFinite(Number(source?.x)) || /\bX starts at\s+\d+\b/i.test(String(source?.card?.text ?? ""));
  if (!hasExplicitX) return text;
  const x = Math.max(0, Number(worldsBeyondCardX(source)) || 0);
  return text.replace(/\bX\b/g, String(x));
}

function currentSourceAttack(source) {
  if (Number.isFinite(Number(source?.attack))) return Math.max(0, Number(source.attack));
  return Math.max(0, Number(source?.card?.attack ?? 0) + Number(source?.attackBonus ?? 0));
}

function naturalLifecycle(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return "";
  const tail = text.slice(match.index + match[0].length);
  const next = tail.search(/\b(?:Fanfare|Last Words|Strike|Clash|Evolve|Super-Evolve|Enhance|Accelerate|Crystallize|Engage|On Spellboost|At the start of your turn|At the end of your turn)\s*\(?\s*\d*\s*\)?\s*:/i);
  return (next < 0 ? tail : tail.slice(0, next)).trim();
}

function worldsBeyondTargetEffectSpec(text, source) {
  const value = String(text ?? "");
  let match = value.match(/select an allied card on the field and destroy it/i);
  if (match) return { kind: "destroy", selectedGrammar: true, targetSide: "allied", targetScope: "card" };

  match = value.match(/select an enemy card on the field and banish it/i);
  if (match) return { kind: "banish", selectedGrammar: true, targetSide: "enemy", targetScope: "card" };

  const legacy = targetEffectSpec({ mode: { text }, instance: source });
  if (legacy) return { ...legacy, targetSide: "enemy" };

  match = value.match(/select an allied follower(?: on the field)? and deal it\s+(\d+)\s+damage/i);
  if (match) return { kind: "damage", amount: Number(match[1]) || 0, selectedGrammar: true, targetSide: "allied" };

  match = value.match(/select an enemy follower(?: on the field)? and give it\s+-(\d+)\s*\/\s*-(\d+)/i);
  if (match) {
    return {
      kind: "stat-debuff",
      attack: Number(match[1]) || 0,
      defense: Number(match[2]) || 0,
      selectedGrammar: true,
      targetSide: "enemy"
    };
  }

  match = value.match(/select an enemy follower(?: on the field)? and set its defense to\s+(\d+)/i);
  if (match) return { kind: "set-defense", amount: Number(match[1]) || 0, selectedGrammar: true, targetSide: "enemy" };

  match = value.match(/set (?:an|a|the) enemy follower(?:'s|’s) defense to\s+(\d+)/i);
  if (match) return { kind: "set-defense", amount: Number(match[1]) || 0, targetSide: "enemy" };
  return null;
}

function targetOptionsForSpec(session, playerIndex, targetSpec) {
  if (targetSpec?.targetScope === "card") {
    const board = session.getPlayer(targetSpec.targetSide === "allied" ? playerIndex : 1 - playerIndex).board;
    return targetSpec.targetSide === "allied" ? [...board] : targetableEnemyCards(board);
  }
  if (targetSpec?.targetSide === "allied") {
    return session.getPlayer(playerIndex).board.filter(unit => cardType(unit) === "follower");
  }
  return targetableEnemyFollowers(session.getPlayer(1 - playerIndex).board);
}

function targetPlayerForSpec(playerIndex, targetSpec) {
  return targetSpec?.targetSide === "allied" ? playerIndex : 1 - playerIndex;
}

function hasUnsupportedChoiceOrCondition(text, { targetSpec = null, discardRequired = false } = {}) {
  let inspect = String(text ?? "");
  if (discardRequired) inspect = inspect.replace(/\bselect (?:a|an|one) (?:[a-z]+craft )?card in your hand and discard it\.?/gi, "");
  if (targetSpec) inspect = stripSupportedTargetText(inspect);
  inspect = inspect.replace(/\bGain Crest\s*:\s*[^.;\n]+[.;]?/gi, "");
  return /\b(?:select|choose)\b|\bif\b|\bunless\b|\bfor each\b|\bwhenever\b|\bwhen(?:ever)?\b|\brandomly select\b|\bX\b|\b(?:Earth Rite|Engage|Fuse|Transmute|Crest|Faith|Reanimate)\b/i.test(inspect);
}

function unsupportedResidualText(text, { targetSpec = null, discardRequired = false } = {}) {
  let inspect = String(text ?? "");
  if (discardRequired) inspect = inspect.replace(new RegExp(HAND_DISCARD_SELECTION.source, "gi"), " ");
  if (targetSpec) inspect = stripSupportedTargetText(inspect);

  const patterns = [
    /\bGain Crest\s*:\s*[^.;\n]+/gi,
    new RegExp(ADD_TO_HAND_SINGLE.source, "gi"),
    /\bdraw\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+cards?\b/gi,
    new RegExp(TRAILING_TYPED_DRAW.source, "gi"),
    new RegExp(TRAILING_NAMED_DRAW.source, "g"),
    /\b(?:restore|recover)\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+defense to your leader\b/gi,
    /\bdeal\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage to (?:the )?enemy leader\b/gi,
    new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) followers? with the highest defense\\b`, "gi"),
    new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) leaders? with the highest defense\\b`, "gi"),
    new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) enemy followers?\\b(?!\\s+with\\b)`, "gi"),
    new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) followers?\\b(?!\\s+with\\b)`, "gi"),
    /\bdeal\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage to (?:a random|random) enemy follower\b/gi,
    /\bdestroy (?:a random|random) enemy follower with the highest attack\b/gi,
    /\bdestroy (?:a random|random) enemy follower\b/gi,
    /\bbanish this card\b/gi,
    /\bgive this follower\s+(?:Storm|Rush|Ward|Bane|Drain)(?:\s+and\s+(?:Storm|Rush|Ward|Bane|Drain))?\b/gi,
    /\bgive this follower\s+\+\d+\s*\/\s*\+\d+\b/gi,
    /\bgain\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+earth sigils?\b/gi,
    /\bspellboost your hand(?:\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+times?)?\b/gi,
    /\bincrease your combo by\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi
  ];
  if (!targetSpec) patterns.push(new RegExp(SUMMON_COPIES.source, "gi"), new RegExp(SUMMON_SINGLE.source, "gi"));
  for (const pattern of patterns) inspect = inspect.replace(pattern, " ");
  inspect = stripWorldsBeyondGenericEffectText(inspect);

  return inspect
    .replace(/[.;,:!?()[\]{}"“”]/g, " ")
    .replace(/\b(?:and|then)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSupportedTargetText(text) {
  let inspect = String(text ?? "");
  const patterns = [
    /\bselect an allied card on the field and destroy it\b/gi,
    /\bselect an enemy card on the field and banish it\b/gi,
    /\bselect an allied follower(?: on the field)? and deal it \d+ damage\b/gi,
    /\bselect an enemy follower(?: on the field)? and deal it \d+ damage\b/gi,
    /\bselect an enemy follower(?: on the field)? and destroy it\b/gi,
    /\bselect an enemy follower(?: on the field)? and banish it\b/gi,
    /\bselect an enemy follower(?: on the field)? and return it to (?:its owner'?s|their) hand\b/gi,
    /\bselect an enemy follower(?: on the field)? and give it\s+-\d+\s*\/\s*-\d+\b/gi,
    /\bselect an enemy follower(?: on the field)? and set its defense to \d+\b/gi,
    /\bdeal\s+\d+\s+damage to (?:an|a|the) enemy follower\b/gi,
    /\bdestroy (?:an|a|the) enemy follower\b/gi,
    /\bbanish (?:an|a|the) enemy follower\b/gi,
    /\breturn (?:an|a|the) enemy follower to (?:its owner'?s|their) hand\b/gi,
    /\bset (?:an|a|the) enemy follower(?:'s|’s) defense to\s+\d+\b/gi
  ];
  for (const pattern of patterns) inspect = inspect.replace(pattern, " ");
  return inspect;
}

function executeSimpleEffects(session, { text, playerIndex, source, targetSpec = null, target = null, discard = null, notes = [] }) {
  const enemyIndex = 1 - playerIndex;
  const targetPlayer = targetSpec ? targetPlayerForSpec(playerIndex, targetSpec) : enemyIndex;
  let applied = false;

  const preApplied = commandsApplied(resolveEffectCommands(
    session,
    compileWorldsBeyondPreTargetCommands(text, { playerIndex, source })
  ));
  applied = preApplied || applied;

  if (discard) {
    const player = session.getPlayer(playerIndex);
    const index = player.hand.findIndex(item => item.instanceId === discard.instanceId);
    if (index >= 0) {
      const [discarded] = player.hand.splice(index, 1);
      player.cemetery.push(discarded);
      gainWorldsBeyondShadows(session, playerIndex, 1);
      session.emit(BATTLE_EVENT.CARD_DISCARDED, {
        actor: playerIndex,
        payload: {
          owner: playerIndex,
          card: session.cardView(discarded),
          source: source ? session.cardView(source) : null,
          reason: "ability"
        }
      });
      applied = true;
    }
  }

  if (targetSpec && target) {
    if (targetSpec.kind === "damage") {
      const damage = session.damageFollower(targetPlayer, target.instanceId, targetSpec.amount, { actor: playerIndex, source, reason: "ability", resolveDeath: false });
      if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, targetPlayer, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
      applied = damage > 0 || applied;
    } else if (targetSpec.kind === "destroy") {
      const destroyed = targetSpec.targetScope === "card"
        ? Boolean(destroyWorldsBeyondTargetCard(session, targetPlayer, target, { actor: playerIndex, source, reason: "ability", byAbility: true, abilityDestroy: true }))
        : Boolean(destroyWorldsBeyondFollower(session, targetPlayer, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true, abilityDestroy: true }));
      applied = destroyed || applied;
    } else if (targetSpec.kind === "banish") {
      const banished = Boolean(banishBoardCard(session, targetPlayer, target.instanceId, { actor: playerIndex, source, reason: "ability" }));
      applied = banished || applied;
    } else if (targetSpec.kind === "return") {
      const returned = Boolean(returnBoardCardToHand(session, targetPlayer, target.instanceId, { actor: playerIndex, source, reason: "ability" }));
      applied = returned || applied;
    } else if (targetSpec.kind === "set-defense") {
      const before = Number(target.defense ?? target.card?.defense ?? 0);
      const amount = Math.max(0, Number(targetSpec.amount) || 0);
      target.maxDefense = amount;
      target.defense = amount;
      session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
        actor: playerIndex,
        payload: {
          card: session.cardView(target),
          attack: 0,
          defense: amount - before,
          setDefense: amount,
          reason: "ability",
          source: session.cardView(source)
        }
      });
      if (amount <= 0) destroyWorldsBeyondFollower(session, targetPlayer, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
      applied = true;
    } else if (targetSpec.kind === "stat-debuff") {
      const beforeAttack = Number(target.attack ?? target.card?.attack ?? 0);
      const beforeDefense = Number(target.defense ?? target.card?.defense ?? 0);
      const beforeMaxDefense = Number(target.maxDefense ?? target.card?.defense ?? beforeDefense);
      const attack = Math.max(0, Number(targetSpec.attack) || 0);
      const defense = Math.max(0, Number(targetSpec.defense) || 0);
      target.attack = Math.max(0, beforeAttack - attack);
      target.defense = Math.max(0, beforeDefense - defense);
      target.maxDefense = Math.max(0, beforeMaxDefense - defense);
      session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
        actor: playerIndex,
        payload: {
          card: session.cardView(target),
          attack: target.attack - beforeAttack,
          defense: target.defense - beforeDefense,
          reason: "ability",
          source: session.cardView(source)
        }
      });
      if (target.defense <= 0) {
        destroyWorldsBeyondFollower(session, targetPlayer, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
      }
      applied = true;
    }
  }

  const postApplied = commandsApplied(resolveEffectCommands(
    session,
    compileWorldsBeyondPostTargetCommands(text, { playerIndex, source })
  ));
  applied = postApplied || applied;

  for (const match of text.matchAll(/\bdestroy (?:a random|random) enemy follower with the highest attack\b/gi)) {
    const followers = session.players[enemyIndex].board.filter(unit => cardType(unit) === "follower");
    const highest = maxValue(followers, unit => Number(unit.attack ?? unit.card?.attack ?? 0));
    const candidates = highest == null
      ? []
      : followers.filter(unit => Number(unit.attack ?? unit.card?.attack ?? 0) === highest);
    const targetUnit = candidates.length
      ? candidates[Math.floor(session.rng() * candidates.length)] ?? candidates[0]
      : null;
    if (targetUnit) {
      destroyWorldsBeyondFollower(session, enemyIndex, targetUnit.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true, abilityDestroy: true });
      applied = true;
    }
  }

  for (const match of text.matchAll(new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) followers? with the highest defense\\b`, "gi"))) {
    const amount = numberWord(match[1]);
    const allFollowers = session.players.flatMap((player, owner) => player.board
      .filter(unit => cardType(unit) === "follower")
      .map(unit => ({ owner, unit })));
    const highest = maxValue(allFollowers, item => Number(item.unit.defense ?? item.unit.card?.defense ?? 0));
    const targets = highest == null
      ? []
      : allFollowers.filter(item => Number(item.unit.defense ?? item.unit.card?.defense ?? 0) === highest);
    applied = resolveFollowerAreaDamage(session, targets, amount, { actor: playerIndex, source }) || applied;
  }

  for (const match of text.matchAll(new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) leaders? with the highest defense\\b`, "gi"))) {
    const amount = numberWord(match[1]);
    const highest = Math.max(...session.players.map(player => Number(player.hp ?? 0)));
    const targets = session.players
      .map((player, owner) => ({ owner, hp: Number(player.hp ?? 0) }))
      .filter(item => item.hp === highest)
      .map(item => item.owner);
    applied = resolveLeaderAreaDamage(session, targets, amount, { actor: playerIndex, source }) || applied;
  }

  for (const match of text.matchAll(new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) enemy followers?\\b(?!\\s+with\\b)`, "gi"))) {
    const amount = numberWord(match[1]);
    const targets = session.players[enemyIndex].board
      .filter(unit => cardType(unit) === "follower")
      .map(unit => ({ owner: enemyIndex, unit }));
    applied = resolveFollowerAreaDamage(session, targets, amount, { actor: playerIndex, source }) || applied;
  }

  for (const match of text.matchAll(new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) followers?\\b(?!\\s+with\\b)`, "gi"))) {
    const amount = numberWord(match[1]);
    const targets = session.players.flatMap((player, owner) => player.board
      .filter(unit => cardType(unit) === "follower")
      .map(unit => ({ owner, unit })));
    applied = resolveFollowerAreaDamage(session, targets, amount, { actor: playerIndex, source }) || applied;
  }

  for (const match of text.matchAll(/\bdeal\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage to (?:a random|random) enemy follower\b/gi)) {
    const unit = randomEnemyFollower(session, enemyIndex);
    if (unit) {
      session.damageFollower(enemyIndex, unit.instanceId, numberWord(match[1]), { actor: playerIndex, source, reason: "ability", resolveDeath: false });
      if (Number(unit.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, unit.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
      applied = true;
    }
  }

  if (/\bdestroy (?:a random|random) enemy follower\b(?!\s+with the highest attack)/i.test(text)) {
    const unit = randomEnemyFollower(session, enemyIndex);
    if (unit) {
      destroyWorldsBeyondFollower(session, enemyIndex, unit.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true, abilityDestroy: true });
      applied = true;
    }
  }

  for (const match of text.matchAll(/\bgive this follower\s+\+(\d+)\s*\/\s*\+(\d+)\b/gi)) {
    if (!session.findBoardCard(playerIndex, source.instanceId)) continue;
    const attack = Number(match[1]) || 0;
    const defense = Number(match[2]) || 0;
    source.attack = Number(source.attack ?? source.card?.attack ?? 0) + attack;
    source.maxDefense = Number(source.maxDefense ?? source.card?.defense ?? 0) + defense;
    source.defense = Number(source.defense ?? source.card?.defense ?? 0) + defense;
    session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
      actor: playerIndex,
      payload: { card: session.cardView(source), attack, defense, reason: "ability" }
    });
    applied = true;
  }

  for (const match of text.matchAll(/\bgain\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+earth sigils?\b/gi)) {
    gainWorldsBeyondEarthSigils(session, playerIndex, numberWord(match[1]));
    applied = true;
  }

  for (const match of text.matchAll(/\bspellboost your hand(?:\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+times?)?\b/gi)) {
    const amount = match[1] ? numberWord(match[1]) : 1;
    spellboostWorldsBeyondHand(session, playerIndex, amount, { source, reason: "ability" });
    applied = true;
  }

  for (const match of text.matchAll(/\bincrease your combo by\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi)) {
    const amount = numberWord(match[1]);
    const player = session.getPlayer(playerIndex);
    player.cardsPlayedThisTurn = Math.max(0, Number(player.cardsPlayedThisTurn ?? 0)) + amount;
    player.resources.combo = player.cardsPlayedThisTurn;
    applied = true;
  }

  if (/\bbanish this card\b/i.test(text)) {
    applied = Boolean(banishBoardCard(session, playerIndex, source.instanceId, {
      actor: playerIndex,
      source,
      reason: "ability"
    })) || applied;
  }

  applied = resolveWorldsBeyondGenericEffects(session, {
    text,
    playerIndex,
    source,
    destroyFollower: destroyWorldsBeyondFollower,
    gainShadows: gainWorldsBeyondShadows
  }) || applied;

  const trailingApplied = commandsApplied(resolveEffectCommands(
    session,
    compileWorldsBeyondTrailingFilteredDrawCommands(text, { playerIndex, source })
  ));
  applied = trailingApplied || applied;

  return { applied, unresolved: false, text, targetSpec, target, discard, notes };
}

function resolveFollowerAreaDamage(session, targets, amount, { actor, source } = {}) {
  if (!targets.length) return false;

  for (const { owner, unit } of targets) {
    if (!session.findBoardCard(owner, unit.instanceId)) continue;
    session.damageFollower(owner, unit.instanceId, amount, { actor, source, reason: "ability", resolveDeath: false });
  }

  for (const { owner, unit } of targets) {
    const live = session.findBoardCard(owner, unit.instanceId);
    if (!live || Number(live.defense ?? 0) > 0) continue;
    destroyWorldsBeyondFollower(session, owner, live.instanceId, { actor, source, reason: "ability", byAbility: true });
  }
  return true;
}

function resolveLeaderAreaDamage(session, targetPlayerIndexes, amount, { actor, source } = {}) {
  const targets = [...new Set(targetPlayerIndexes)].filter(index => index === 0 || index === 1);
  const damage = Math.max(0, Number(amount) || 0);
  if (!targets.length || !damage || session.phase === "ended") return false;

  const lethal = [];
  for (const targetPlayer of targets) {
    const player = session.getPlayer(targetPlayer);
    player.hp = Math.max(0, Number(player.hp ?? 0) - damage);
    session.emit(BATTLE_EVENT.LEADER_DAMAGE, {
      actor,
      payload: {
        targetPlayer,
        amount: damage,
        hp: player.hp,
        source: source ? session.cardView(source) : null,
        reason: "ability"
      }
    });
    if (player.hp <= 0) lethal.push(targetPlayer);
  }

  if (lethal.length) {
    const loser = lethal.length > 1 ? session.activePlayer : lethal[0];
    session.finishMatch(1 - loser, "leader-defense-zero", {
      loser,
      losers: lethal,
      simultaneous: lethal.length > 1
    });
  }
  return true;
}

function maxValue(items, select) {
  if (!items.length) return null;
  return Math.max(...items.map(select));
}

function commandsApplied(results) {
  return results.some(result => Boolean(result?.applied));
}

function targetableEnemyCards(board) {
  return board.filter(unit => cardType(unit) === "amulet" || (cardType(unit) === "follower" && !unit.aura && !unit.ambush));
}

function targetableEnemyFollowers(board) {
  return board.filter(unit => cardType(unit) === "follower" && !unit.aura && !unit.ambush);
}

function randomEnemyFollower(session, playerIndex) {
  const targets = session.players[playerIndex].board.filter(unit => cardType(unit) === "follower");
  if (!targets.length) return null;
  return targets[Math.floor(session.rng() * targets.length)] ?? targets[0];
}

function cardType(instance) {
  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}

function numberWord(value) {
  if (/^\d+$/.test(String(value))) return Number(value);
  return ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[String(value).toLowerCase()] ?? 0;
}
