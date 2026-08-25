import { BATTLE_EVENT } from "../../battle-events.js";
import { getWorldsBeyondCrests } from "./crests.js";
import { destroyWorldsBeyondFollower } from "./effect-resolver.js";

export function resolveWorldsBeyondCrestTurnEnd(session, playerIndex, crest) {
  if (!crest || session.phase !== "main") return false;
  const player = session.getPlayer(playerIndex);
  const enemyIndex = 1 - playerIndex;
  const name = normalize(crest.name);
  let applied = false;

  if (name === "grimnir, heavenly gale") {
    const active = player.board.some(unit => cardType(unit) === "follower" && unit.superEvolved);
    if (active) {
      for (const target of [...session.getPlayer(enemyIndex).board].filter(unit => cardType(unit) === "follower")) {
        session.damageFollower(enemyIndex, target.instanceId, 2, { actor: playerIndex, source: null, reason: "crest", resolveDeath: false });
        if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, reason: "crest", byAbility: true });
        if (session.phase === "ended") break;
      }
      applied = true;
    }
  }

  if (name === "marwynn, despair manifest" && !player.followersAttackedThisTurn) {
    const amount = getWorldsBeyondCrests(player).length;
    splitDamageBetweenAllEnemies(session, playerIndex, amount);
    applied = amount > 0;
  }

  if (name === "supplicant of repose" && !player.followersAttackedThisTurn) {
    applied = healLeader(session, playerIndex, 1, crest) > 0 || applied;
  }

  if (name === "sandalphon, primarch successor") {
    let healed = healLeader(session, playerIndex, 1, crest);
    for (const unit of player.board.filter(card => cardType(card) === "follower")) {
      const before = Number(unit.defense ?? 0);
      const maximum = Number(unit.maxDefense ?? before);
      unit.defense = Math.min(maximum, before + 1);
      healed += Math.max(0, unit.defense - before);
    }
    applied = healed > 0 || applied;
  }

  if (applied) {
    session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
      actor: playerIndex,
      payload: { action: "turn-end", crest: crestView(crest) }
    });
  }
  return applied;
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
