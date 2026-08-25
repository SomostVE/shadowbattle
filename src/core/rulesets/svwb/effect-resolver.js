import { BATTLE_EVENT } from "../../battle-events.js";
import { banishBoardCard, returnBoardCardToHand } from "../../zone-actions.js";
import { evaluateWorldsBeyondClassCondition } from "./class-conditions.js";
import { getWorldsBeyondEngageInfo } from "./engage.js";
import { preprocessWorldsBeyondFuseText } from "./fuse.js";
import { baseText, section } from "./v5/battle-engine-v5-text.js";
import { targetEffectSpec } from "./v5/battle-engine-v5-targeting.js";

const SUPPORTED_TARGET_KINDS = new Set(["damage", "destroy", "banish", "return"]);

export function getWorldsBeyondTargetRequirement(source, trigger = "play", mode = null, player = null) {
  if (!source?.card) return null;
  const originalText = preprocessWorldsBeyondFuseText(source, triggerText(source, trigger, mode));
  if (!originalText) return null;
  const conditional = player ? evaluateWorldsBeyondClassCondition(originalText, player, source.card) : { text: originalText, active: true };
  if (!conditional.active || !conditional.text) return null;
  const spec = targetEffectSpec({ mode: { text: conditional.text }, instance: source });
  return spec ? { ...spec, text: conditional.text } : null;
}

export function getWorldsBeyondTargetOptions(session, { trigger = "play", playerIndex, source, mode = null } = {}) {
  const player = session.getPlayer(playerIndex);
  const requirement = getWorldsBeyondTargetRequirement(source, trigger, mode, player);
  if (!requirement) return [];
  return targetableEnemyFollowers(session.getPlayer(1 - playerIndex).board);
}

export function resolveWorldsBeyondTrigger(session, { trigger, playerIndex, source, targetInstanceId = null, mode = null }) {
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
  const targetSpec = targetEffectSpec({ mode: { text }, instance: source });
  const targetOptions = targetSpec ? targetableEnemyFollowers(session.getPlayer(1 - playerIndex).board) : [];
  let target = null;
  let targetMissing = false;
  let invalidTarget = false;

  if (targetSpec && targetOptions.length) {
    target = targetOptions.find(unit => unit.instanceId === targetInstanceId) ?? null;
    targetMissing = !targetInstanceId;
    invalidTarget = Boolean(targetInstanceId && !target);
  }

  const unsupportedTarget = Boolean(targetSpec && !SUPPORTED_TARGET_KINDS.has(targetSpec.kind));
  const unresolved = targetMissing || invalidTarget || unsupportedTarget || hasUnsupportedChoiceOrCondition(text, { targetSpec });

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
      conditionNotes: conditional.notes,
      classMechanic: conditional.mechanic
    }
  });

  if (unresolved) return { applied: false, unresolved: true, text, targetSpec, target, notes: conditional.notes };
  return executeSimpleEffects(session, { text, playerIndex, source, targetSpec, target, notes: conditional.notes });
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

function hasUnsupportedChoiceOrCondition(text, { targetSpec = null } = {}) {
  let inspect = String(text ?? "");
  if (targetSpec) {
    inspect = inspect
      .replace(/\bselect an enemy follower(?: on the field)? and\s*/gi, "")
      .replace(/\bdeal\s+\d+\s+damage to (?:an|a|the) enemy follower\b/gi, "")
      .replace(/\bdestroy (?:an|a|the) enemy follower\b/gi, "")
      .replace(/\bbanish (?:an|a|the) enemy follower\b/gi, "")
      .replace(/\breturn (?:an|a|the) enemy follower to (?:its owner'?s|their) hand\b/gi, "");
  }
  return /\b(?:select|choose)\b|\bif\b|\bunless\b|\bfor each\b|\bwhenever\b|\bwhen(?:ever)?\b|\brandomly select\b|\bX\b|\b(?:Earth Rite|Engage|Fuse|Transmute|Crest|Faith|Reanimate)\b/i.test(inspect);
}

function executeSimpleEffects(session, { text, playerIndex, source, targetSpec = null, target = null, notes = [] }) {
  const enemyIndex = 1 - playerIndex;
  let applied = false;

  if (targetSpec && target) {
    if (targetSpec.kind === "damage") {
      const damage = session.damageFollower(enemyIndex, target.instanceId, targetSpec.amount, { actor: playerIndex, source, reason: "ability", resolveDeath: false });
      if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
      applied ||= damage > 0;
    } else if (targetSpec.kind === "destroy") {
      applied ||= Boolean(destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true }));
    } else if (targetSpec.kind === "banish") {
      applied ||= Boolean(banishBoardCard(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability" }));
    } else if (targetSpec.kind === "return") {
      applied ||= Boolean(returnBoardCardToHand(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability" }));
    }
  }

  for (const match of text.matchAll(/\bdraw\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+cards?\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) {
      session.draw(playerIndex, amount, { reason: "ability" });
      applied = true;
    }
  }

  for (const match of text.matchAll(/\b(?:restore|recover)\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+defense to your leader\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) {
      healLeader(session, playerIndex, amount, source);
      applied = true;
    }
  }

  for (const match of text.matchAll(/\bdeal\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage to (?:the )?enemy leader\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) {
      session.damageLeader(enemyIndex, amount, { actor: playerIndex, source, reason: "ability" });
      applied = true;
    }
  }

  for (const match of text.matchAll(/\bdeal\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage to (?:all|each) enemy followers?\b/gi)) {
    const amount = numberWord(match[1]);
    const targets = [...session.players[enemyIndex].board].filter(unit => cardType(unit) === "follower");
    for (const unit of targets) {
      session.damageFollower(enemyIndex, unit.instanceId, amount, { actor: playerIndex, source, reason: "ability", resolveDeath: false });
      if (Number(unit.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, unit.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
    }
    applied ||= targets.length > 0;
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

  return { applied, unresolved: false, text, targetSpec, target, notes };
}

function targetableEnemyFollowers(board) {
  return board.filter(unit => cardType(unit) === "follower" && !unit.aura && !unit.ambush);
}

function healLeader(session, playerIndex, amount, source) {
  const player = session.getPlayer(playerIndex);
  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + Math.max(0, Number(amount) || 0));
  const healed = player.hp - before;
  session.emit(BATTLE_EVENT.HEAL, {
    actor: playerIndex,
    payload: { targetPlayer: playerIndex, amount: healed, hp: player.hp, source: source ? session.cardView(source) : null, reason: "ability" }
  });
  return healed;
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
