import { BATTLE_EVENT } from "../../battle-events.js";
import { getWorldsBeyondCrests } from "./crests.js";
import { destroyWorldsBeyondFollower } from "./effect-resolver.js";

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

  if (triggered) {
    session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
      actor: playerIndex,
      payload: { action: "turn-end", crest: crestView(crest), ...detail }
    });
  }
  return triggered;
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
  if (healed > 0) {
    session.emit(BATTLE_EVENT.HEAL, {
      actor: playerIndex,
      payload: { targetPlayer: playerIndex, amount: healed, hp: player.hp, source: null, reason: "crest", crest: crestView(crest) }
    });
  }
  return healed;
}

function crestView(crest) {
  return {
    id: crest?.id ?? null,
    name: crest?.name ?? null,
    cardId: crest?.cardId ?? null,
    countdown: Number.isFinite(Number(crest?.countdown)) ? Number(crest.countdown) : null
  };
}

function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
