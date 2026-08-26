import { BATTLE_EVENT } from "../../battle-events.js";
import { resolveEffectCommands } from "../../effect-commands.js";
import { banishBoardCard, returnBoardCardToHand } from "../../zone-actions.js";
import { evaluateWorldsBeyondClassCondition } from "./class-conditions.js";
import { getWorldsBeyondEngageInfo } from "./engage.js";
import { preprocessWorldsBeyondFuseText } from "./fuse.js";
import { baseText, section } from "./v5/battle-engine-v5-text.js";
import { targetEffectSpec } from "./v5/battle-engine-v5-targeting.js";
import {
  compileWorldsBeyondPostTargetCommands,
  compileWorldsBeyondPreTargetCommands
} from "./v6/effect-commands.js";

const SUPPORTED_TARGET_KINDS = new Set(["damage", "destroy", "banish", "return", "set-defense"]);
const HAND_DISCARD_SELECTION = /\bselect (?:a|an|one) (?:[a-z]+craft )?card in your hand and discard it\b/i;
const DAMAGE_NUMBER = "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)";

export function getWorldsBeyondTargetRequirement(source, trigger = "play", mode = null, player = null) {
  if (!source?.card) return null;
  const originalText = preprocessWorldsBeyondFuseText(source, triggerText(source, trigger, mode));
  if (!originalText) return null;
  const evaluationPlayer = prospectiveTargetPlayer(player, source, trigger);
  const conditional = evaluationPlayer ? evaluateWorldsBeyondClassCondition(originalText, evaluationPlayer, source.card) : { text: originalText, active: true };
  if (!conditional.active || !conditional.text) return null;
  const spec = worldsBeyondTargetEffectSpec(conditional.text, source);
  return spec ? { ...spec, text: conditional.text } : null;
}

export function requiresWorldsBeyondHandDiscard(source, trigger = "play", mode = null, player = null) {
  if (!source?.card) return false;
  const originalText = preprocessWorldsBeyondFuseText(source, triggerText(source, trigger, mode));
  if (!originalText) return false;
  const evaluationPlayer = prospectiveTargetPlayer(player, source, trigger);
  const conditional = evaluationPlayer ? evaluateWorldsBeyondClassCondition(originalText, evaluationPlayer, source.card) : { text: originalText, active: true };
  return Boolean(conditional.active && HAND_DISCARD_SELECTION.test(conditional.text));
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

  const text = conditional.text;
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
  return targetableEnemyFollowers(session.getPlayer(1 - playerIndex).board);
}

export function resolveWorldsBeyondTrigger(session, { trigger, playerIndex, source, targetInstanceId = null, discardInstanceId = null, mode = null }) {
  if (!source?.card) return { applied: false, unresolved: false, text: "" };
  const originalText = preprocessWorldsBeyondFuseText(source, triggerText(source, trigger, mode));
  if (!originalText) return { applied: false, unresolved: false, text: "" };

  const player = session.getPlayer(playerIndex);
  const conditional = evaluateWorldsBeyondClassCondition(originalText, player, source.card, { consume: true });
  if (!conditional.active || !conditional.text) {
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
        conditionNotes: conditional.notes,
        classMechanic: conditional.mechanic
      }
    });
    return { applied: false, unresolved: false, text: originalText, conditionInactive: true, notes: conditional.notes };
  }

  const text = conditional.text;
  const targetSpec = worldsBeyondTargetEffectSpec(text, source);
  const targetOptions = targetSpec ? targetableEnemyFollowers(session.getPlayer(1 - playerIndex).board) : [];
  const discardRequired = HAND_DISCARD_SELECTION.test(text);
  const discardOptions = discardRequired ? player.hand.filter(item => item.instanceId !== source.instanceId) : [];
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
    discardMissing = !discardInstanceId;
    invalidDiscard = Boolean(discardInstanceId && !discard);
  }

  const unsupportedTarget = Boolean(targetSpec && !SUPPORTED_TARGET_KINDS.has(targetSpec.kind));
  const unresolved = targetMissing || invalidTarget || discardMissing || invalidDiscard || unsupportedTarget || hasUnsupportedChoiceOrCondition(text, { targetSpec, discardRequired });

  session.emit(BATTLE_EVENT.ABILITY_TRIGGER, {
    actor: playerIndex,
    payload: {
      trigger,
      mode: mode?.kind ?? null,
      card: session.cardView(source),
      text,
      originalText,
      resolved: !unresolved,
      target: target ? session.cardView(target) : null,
      targetKind: targetSpec?.kind ?? null,
      targetRequired: Boolean(targetSpec && targetOptions.length),
      targetAvailable: targetOptions.length > 0,
      discard: discard ? session.cardView(discard) : null,
      discardRequired,
      discardAvailable: discardOptions.length > 0,
      conditionNotes: conditional.notes,
      classMechanic: conditional.mechanic
    }
  });

  if (unresolved) return { applied: false, unresolved: true, text, targetSpec, target, discard, notes: conditional.notes };
  return executeSimpleEffects(session, { text, playerIndex, source, targetSpec, target, discard, notes: conditional.notes });
}

export function gainWorldsBeyondShadows(session, playerIndex, amount = 1) {
  const player = session.getPlayer(playerIndex);
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return Number(player.resources?.shadows ?? 0);
  player.resources.shadows = Math.max(0, Number(player.resources?.shadows ?? 0)) + value;
  return player.resources.shadows;
}

export function destroyWorldsBeyondFollower(session, playerIndex, instanceId, options = {}) {
  const destroyed = session.destroyFollower(playerIndex, instanceId, options);
  if (destroyed) {
    gainWorldsBeyondShadows(session, playerIndex, 1);
    resolveWorldsBeyondTrigger(session, { trigger: "last-words", playerIndex, source: destroyed });
  }
  return destroyed;
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
  if (trigger === "evolve") return section(text, "evolve") || naturalLifecycle(text, /when this follower evolves,\s*/i);
  if (trigger === "super-evolve") return section(text, "super-evolve");
  if (trigger === "last-words") return section(text, "last words");
  if (trigger === "turn-start") return section(text, "at the start of your turn") || naturalLifecycle(text, /at the start of your turn,\s*/i);
  if (trigger === "turn-end") return section(text, "at the end of your turn") || naturalLifecycle(text, /at the end of your turn,\s*/i);
  return "";
}

function naturalLifecycle(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return "";
  const tail = text.slice(match.index + match[0].length);
  const next = tail.search(/\b(?:Fanfare|Last Words|Strike|Clash|Evolve|Super-Evolve|Enhance|Accelerate|Crystallize|Engage|On Spellboost|At the start of your turn|At the end of your turn)\s*\(?\s*\d*\s*\)?\s*:/i);
  return (next < 0 ? tail : tail.slice(0, next)).trim();
}

function worldsBeyondTargetEffectSpec(text, source) {
  const legacy = targetEffectSpec({ mode: { text }, instance: source });
  if (legacy) return legacy;

  let match = String(text ?? "").match(/select an enemy follower(?: on the field)? and set its defense to\s+(\d+)/i);
  if (match) return { kind: "set-defense", amount: Number(match[1]) || 0, selectedGrammar: true };

  match = String(text ?? "").match(/set (?:an|a|the) enemy follower(?:'s|’s) defense to\s+(\d+)/i);
  if (match) return { kind: "set-defense", amount: Number(match[1]) || 0 };
  return null;
}

function hasUnsupportedChoiceOrCondition(text, { targetSpec = null, discardRequired = false } = {}) {
  let inspect = String(text ?? "");
  if (discardRequired) inspect = inspect.replace(/\bselect (?:a|an|one) (?:[a-z]+craft )?card in your hand and discard it\.?/gi, "");
  if (targetSpec) {
    inspect = inspect
      .replace(/\bselect an enemy follower(?: on the field)? and\s*/gi, "")
      .replace(/\bdeal\s+\d+\s+damage to (?:an|a|the) enemy follower\b/gi, "")
      .replace(/\bdestroy (?:an|a|the) enemy follower\b/gi, "")
      .replace(/\bbanish (?:an|a|the) enemy follower\b/gi, "")
      .replace(/\breturn (?:an|a|the) enemy follower to (?:its owner'?s|their) hand\b/gi, "")
      .replace(/\bset (?:an|a|the) enemy follower(?:'s|’s) defense to\s+\d+\b/gi, "")
      .replace(/\bset its defense to\s+\d+\b/gi, "");
  }
  inspect = inspect.replace(/\bGain Crest\s*:\s*[^.;\n]+[.;]?/gi, "");
  return /\b(?:select|choose)\b|\bif\b|\bunless\b|\bfor each\b|\bwhenever\b|\bwhen(?:ever)?\b|\brandomly select\b|\bX\b|\b(?:Earth Rite|Engage|Fuse|Transmute|Crest|Faith|Reanimate)\b/i.test(inspect);
}

function unsupportedResidualText(text, { targetSpec = null, discardRequired = false } = {}) {
  let inspect = String(text ?? "");
  if (discardRequired) inspect = inspect.replace(new RegExp(HAND_DISCARD_SELECTION.source, "gi"), " ");
  if (targetSpec) inspect = stripSupportedTargetText(inspect);

  const patterns = [
    /\bGain Crest\s*:\s*[^.;\n]+/gi,
    /\bdraw\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+cards?\b/gi,
    /\b(?:restore|recover)\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+defense to your leader\b/gi,
    /\bdeal\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage to (?:the )?enemy leader\b/gi,
    new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) followers? with the highest defense\\b`, "gi"),
    new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) leaders? with the highest defense\\b`, "gi"),
    new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) enemy followers?\\b(?!\\s+with\\b)`, "gi"),
    new RegExp(`\\bdeal\\s+${DAMAGE_NUMBER}\\s+damage to (?:all|each) followers?\\b(?!\\s+with\\b)`, "gi"),
    /\bdeal\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage to (?:a random|random) enemy follower\b/gi,
    /\bdestroy (?:a random|random) enemy follower\b/gi,
    /\bgive this follower\s+\+\d+\s*\/\s*\+\d+\b/gi
  ];
  for (const pattern of patterns) inspect = inspect.replace(pattern, " ");

  return inspect
    .replace(/[.;,:!?()[\]{}"“”]/g, " ")
    .replace(/\b(?:and|then)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSupportedTargetText(text) {
  let inspect = String(text ?? "");
  const patterns = [
    /\bselect an enemy follower(?: on the field)? and deal it \d+ damage\b/gi,
    /\bselect an enemy follower(?: on the field)? and destroy it\b/gi,
    /\bselect an enemy follower(?: on the field)? and banish it\b/gi,
    /\bselect an enemy follower(?: on the field)? and return it to (?:its owner'?s|their) hand\b/gi,
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
      const damage = session.damageFollower(enemyIndex, target.instanceId, targetSpec.amount, { actor: playerIndex, source, reason: "ability", resolveDeath: false });
      if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
      applied = damage > 0 || applied;
    } else if (targetSpec.kind === "destroy") {
      const destroyed = Boolean(destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true }));
      applied = destroyed || applied;
    } else if (targetSpec.kind === "banish") {
      const banished = Boolean(banishBoardCard(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability" }));
      applied = banished || applied;
    } else if (targetSpec.kind === "return") {
      const returned = Boolean(returnBoardCardToHand(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability" }));
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
      if (amount <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
      applied = true;
    }
  }

  const postApplied = commandsApplied(resolveEffectCommands(
    session,
    compileWorldsBeyondPostTargetCommands(text, { playerIndex, source })
  ));
  applied = postApplied || applied;

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

  if (/\bdestroy (?:a random|random) enemy follower\b/i.test(text)) {
    const unit = randomEnemyFollower(session, enemyIndex);
    if (unit) {
      destroyWorldsBeyondFollower(session, enemyIndex, unit.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
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
