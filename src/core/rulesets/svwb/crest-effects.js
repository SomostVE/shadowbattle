import { BATTLE_EVENT } from "../../battle-events.js";
import { crestView, getWorldsBeyondCrests } from "./crests.js";
import { destroyWorldsBeyondFollower } from "./effect-resolver.js";

export function resolveWorldsBeyondCrestTurnStart(session, playerIndex, crest) {
  if (!crest || session.phase !== "main") return false;
  const name = normalize(crest.name);
  let selfDamage = 0;

  if (name === "burnite, anathema of ash") selfDamage = 2;
  if (name === "burnite, anathema of flame") selfDamage = 1;
  if (!selfDamage) return false;

  emitCrestActivation(session, playerIndex, crest, "turn-start", { selfDamage });
  session.damageLeader(playerIndex, selfDamage, { actor: playerIndex, reason: "crest-turn-start" });
  return true;
}

export function resolveWorldsBeyondCrestTurnEnd(session, playerIndex, crest) {
  if (!crest || session.phase !== "main") return false;
  const player = session.getPlayer(playerIndex);
  const enemyIndex = 1 - playerIndex;
  const name = normalize(crest.name);
  const followersAttackedThisTurn = didFollowerAttackThisTurn(session, playerIndex);
  let triggered = false;
  let detail = {};

  if (name === "grimnir, heavenly gale") {
    const active = player.board.some(unit => cardType(unit) === "follower" && unit.superEvolved);
    const targets = active ? [...session.getPlayer(enemyIndex).board].filter(unit => cardType(unit) === "follower") : [];
    if (targets.length) {
      for (const target of targets) {
        session.damageFollower(enemyIndex, target.instanceId, 2, { actor: playerIndex, source: null, reason: "crest", resolveDeath: false });
        if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, reason: "crest", byAbility: true });
        if (session.phase === "ended") break;
      }
      triggered = true;
      detail = { damage: 2, targetCount: targets.length };
    }
  }

  if (name === "marwynn, despair manifest" && !followersAttackedThisTurn) {
    const amount = getWorldsBeyondCrests(player).length;
    splitDamageBetweenAllEnemies(session, playerIndex, amount);
    triggered = amount > 0;
    detail = { splitDamage: amount };
  }

  if (name === "supplicant of repose" && !followersAttackedThisTurn) {
    const healed = healLeader(session, playerIndex, 1, crest);
    triggered = true;
    detail = { leaderHealing: healed };
  }

  if (name === "sandalphon, primarch successor") {
    const leaderHealing = healLeader(session, playerIndex, 1, crest);
    let followerHealing = 0;
    for (const unit of player.board.filter(card => cardType(card) === "follower")) {
      const before = Number(unit.defense ?? 0);
      const maximum = Number(unit.maxDefense ?? before);
      unit.defense = Math.min(maximum, before + 1);
      followerHealing += Math.max(0, unit.defense - before);
    }
    triggered = true;
    detail = { leaderHealing, followerHealing };
  }

  if (triggered) emitCrestActivation(session, playerIndex, crest, "turn-end", detail);
  return triggered;
}

export function resolveWorldsBeyondCrestLastWords(session, playerIndex, crest) {
  if (!crest || session.phase !== "main") return false;
  const name = normalize(crest.name);

  if (name === "maddening benison") {
    emitCrestActivation(session, playerIndex, crest, "last-words", { selfDamage: 10 });
    session.damageLeader(playerIndex, 10, { actor: playerIndex, reason: "crest-last-words" });
    return true;
  }

  if (name === "zoe, dazzling hope") {
    const unit = summonCrestFollower(session, playerIndex, crest, { evolve: true });
    emitCrestActivation(session, playerIndex, crest, "last-words", { summoned: Boolean(unit), evolved: Boolean(unit?.evolved), fieldFull: !unit && session.getPlayer(playerIndex).board.length >= session.ruleset.maxBoardSize });
    return true;
  }

  if (name === "lapis, shining seraph") {
    const unit = summonCrestFollower(session, playerIndex, crest, { grantStorm: true });
    emitCrestActivation(session, playerIndex, crest, "last-words", { summoned: Boolean(unit), storm: Boolean(unit && hasKeyword(unit, "Storm")), fieldFull: !unit && session.getPlayer(playerIndex).board.length >= session.ruleset.maxBoardSize });
    return true;
  }

  return false;
}

function summonCrestFollower(session, playerIndex, crest, { evolve = false, grantStorm = false } = {}) {
  const player = session.getPlayer(playerIndex);
  if (player.board.length >= session.ruleset.maxBoardSize) return null;
  const card = crest.card ?? session.findCardDefinition({ id: crest.cardId, name: crest.name });
  if (!card) return null;
  const instance = {
    instanceId: `crest-summon:${playerIndex}:${session.eventSequence}:${String(card.id ?? card.cardId ?? crest.cardId ?? crest.name)}`,
    owner: playerIndex,
    cardId: card.id ?? card.cardId ?? crest.cardId ?? null,
    card,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0,
    attack: Number(card.attack ?? 0),
    defense: Number(card.defense ?? 0),
    maxDefense: Number(card.defense ?? 0),
    evolved: false,
    superEvolved: false,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: hasKeyword({ card }, "Rush") || hasKeyword({ card }, "Storm"),
    canAttackLeader: hasKeyword({ card }, "Storm")
  };
  if (grantStorm && !hasKeyword(instance, "Storm")) instance.grantedKeywords = ["Storm"];
  if (grantStorm) {
    instance.canAttackFollowers = true;
    instance.canAttackLeader = true;
  }
  player.board.push(instance);
  player.resources.rally = Math.max(0, Number(player.resources.rally ?? 0)) + 1;
  session.emit(BATTLE_EVENT.FOLLOWER_ENTER, { actor: playerIndex, payload: { card: session.cardView(instance), position: player.board.length - 1, reason: "crest-last-words" } });

  if (evolve) {
    instance.attack += 2;
    instance.defense += 2;
    instance.maxDefense += 2;
    instance.evolved = true;
    instance.imageOverride = card.evolved?.image ?? null;
    instance.canAttackFollowers = true;
    session.emit(BATTLE_EVENT.EVOLVE, { actor: playerIndex, payload: { card: session.cardView(instance), pointsRemaining: null, statBonus: 2, reason: "crest-last-words" } });
  }
  return instance;
}

function didFollowerAttackThisTurn(session, playerIndex) {
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const event = session.events[index];
    if (event.type === BATTLE_EVENT.TURN_START && event.actor === playerIndex) return false;
    if (event.type === BATTLE_EVENT.ATTACK_START && event.actor === playerIndex) return true;
  }
  return false;
}

function splitDamageBetweenAllEnemies(session, playerIndex, amount) {
  const enemyIndex = 1 - playerIndex;
  let remaining = Math.max(0, Number(amount) || 0);
  while (remaining > 0 && session.phase === "main") {
    const followers = session.getPlayer(enemyIndex).board.filter(unit => cardType(unit) === "follower");
    const pick = Math.floor(session.rng() * (followers.length + 1));
    if (pick >= followers.length) {
      session.damageLeader(enemyIndex, 1, { actor: playerIndex, reason: "crest" });
    } else {
      const target = followers[pick];
      session.damageFollower(enemyIndex, target.instanceId, 1, { actor: playerIndex, reason: "crest", resolveDeath: false });
      if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, reason: "crest", byAbility: true });
    }
    remaining -= 1;
  }
}

function healLeader(session, playerIndex, amount, crest) {
  const player = session.getPlayer(playerIndex);
  const before = Number(player.hp ?? 0);
  player.hp = Math.min(Number(player.maxHp ?? before), before + Math.max(0, Number(amount) || 0));
  const healed = player.hp - before;
  session.emit(BATTLE_EVENT.HEAL, {
    actor: playerIndex,
    payload: { targetPlayer: playerIndex, amount: healed, hp: player.hp, source: null, reason: "crest", crest: crestView(crest) }
  });
  return healed;
}

function emitCrestActivation(session, playerIndex, crest, action, detail = {}) {
  session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
    actor: playerIndex,
    payload: { action, crest: crestView(crest), ...detail }
  });
}

function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}

function hasKeyword(instance, keyword) {
  const wanted = normalize(keyword);
  if ((instance?.grantedKeywords ?? []).some(value => normalize(value) === wanted)) return true;
  if ((instance?.card?.keywords ?? []).some(value => normalize(value) === wanted)) return true;
  return new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i").test(String(instance?.card?.text ?? ""));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
