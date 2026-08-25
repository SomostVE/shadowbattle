import { BATTLE_EVENT } from "../../battle-events.js";
import { baseText, section } from "./v5/battle-engine-v5-text.js";

export function resolveWorldsBeyondTrigger(session, { trigger, playerIndex, source }) {
  if (!source?.card) return { applied: false, unresolved: false, text: "" };
  const text = triggerText(source.card, trigger);
  if (!text) return { applied: false, unresolved: false, text: "" };
  const unresolved = hasUnsupportedChoiceOrCondition(text);
  session.emit(BATTLE_EVENT.ABILITY_TRIGGER, {
    actor: playerIndex,
    payload: { trigger, card: session.cardView(source), text, resolved: !unresolved }
  });
  if (unresolved) return { applied: false, unresolved: true, text };
  return executeSimpleEffects(session, { text, playerIndex, source });
}

export function destroyWorldsBeyondFollower(session, playerIndex, instanceId, options = {}) {
  const destroyed = session.destroyFollower(playerIndex, instanceId, options);
  if (destroyed) resolveWorldsBeyondTrigger(session, { trigger: "last-words", playerIndex, source: destroyed });
  return destroyed;
}

function triggerText(card, trigger) {
  const text = String(card?.text ?? "");
  if (trigger === "play") return baseText(text);
  if (trigger === "evolve") return section(text, "evolve") || naturalLifecycle(text, /when this follower evolves,\s*/i);
  if (trigger === "super-evolve") return section(text, "super-evolve");
  if (trigger === "last-words") return section(text, "last words");
  return "";
}

function naturalLifecycle(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return "";
  const tail = text.slice(match.index + match[0].length);
  const next = tail.search(/\b(?:Fanfare|Last Words|Strike|Clash|Evolve|Super-Evolve|Enhance|Accelerate|Crystallize|Engage|On Spellboost|At the start of your turn|At the end of your turn)\s*\(?\s*\d*\s*\)?\s*:/i);
  return (next < 0 ? tail : tail.slice(0, next)).trim();
}

function hasUnsupportedChoiceOrCondition(text) {
  return /\b(?:select|choose)\b|\bif\b|\bunless\b|\bfor each\b|\bwhenever\b|\bwhen(?:ever)?\b|\brandomly select\b|\bX\b|\b(?:Necromancy|Combo|Overflow|Earth Rite|Engage|Fuse|Transmute|Crest|Faith|Reanimate)\b/i.test(text);
}

function executeSimpleEffects(session, { text, playerIndex, source }) {
  const enemyIndex = 1 - playerIndex;
  let applied = false;

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
    const targets = [...session.players[enemyIndex].board].filter(unit => String(unit.card?.type ?? "").toLowerCase() === "follower");
    for (const target of targets) {
      session.damageFollower(enemyIndex, target.instanceId, amount, { actor: playerIndex, source, reason: "ability", resolveDeath: false });
      if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
    }
    applied ||= targets.length > 0;
  }

  for (const match of text.matchAll(/\bdeal\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage to (?:a random|random) enemy follower\b/gi)) {
    const target = randomEnemyFollower(session, enemyIndex);
    if (target) {
      session.damageFollower(enemyIndex, target.instanceId, numberWord(match[1]), { actor: playerIndex, source, reason: "ability", resolveDeath: false });
      if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
      applied = true;
    }
  }

  if (/\bdestroy (?:a random|random) enemy follower\b/i.test(text)) {
    const target = randomEnemyFollower(session, enemyIndex);
    if (target) {
      destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
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

  return { applied, unresolved: false, text };
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
  const targets = session.players[playerIndex].board.filter(unit => String(unit.card?.type ?? "").toLowerCase() === "follower");
  if (!targets.length) return null;
  return targets[Math.floor(session.rng() * targets.length)] ?? targets[0];
}

function numberWord(value) {
  if (/^\d+$/.test(String(value))) return Number(value);
  return ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[String(value).toLowerCase()] ?? 0;
}
