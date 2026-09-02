import { BATTLE_EVENT } from "../../battle-events.js";
import { destroyWorldsBeyondFollower, resolveWorldsBeyondTrigger } from "./effect-resolver.js";
import {
  assertWorldsBeyondCombatAction,
  getWorldsBeyondAttackCapabilities,
  getWorldsBeyondWardFollowers,
  hasWorldsBeyondKeyword,
  refreshWorldsBeyondAttackReadiness
} from "./combat-readiness.js";
import { cardType, currentAttack } from "./runtime-card-state.js";

const ATTACK_ACTION = "attack";

export function listWorldsBeyondCombatActions(session, playerIndex) {
  if (!session || session.phase !== "main" || session.activePlayer !== playerIndex || session.winner != null) return [];
  const player = session.getPlayer(playerIndex);
  const enemy = session.getPlayer(1 - playerIndex);
  const wards = getWorldsBeyondWardFollowers(enemy);
  const targets = wards.length ? wards : enemy.board.filter(unit => cardType(unit) === "follower");
  const actions = [];

  for (const unit of player.board) {
    const capabilities = getWorldsBeyondAttackCapabilities(session, playerIndex, unit);
    if (capabilities.followers) {
      for (const target of targets) {
        actions.push({
          type: ATTACK_ACTION,
          player: playerIndex,
          attackerInstanceId: unit.instanceId,
          targetInstanceId: target.instanceId
        });
      }
    }
    if (capabilities.leader && !wards.length) {
      actions.push({
        type: ATTACK_ACTION,
        player: playerIndex,
        attackerInstanceId: unit.instanceId,
        target: "leader"
      });
    }
  }

  return actions;
}

export function applyWorldsBeyondCombatAction(session, action) {
  assertWorldsBeyondCombatAction(session, action);
  const playerIndex = action.player;
  const enemyIndex = 1 - playerIndex;
  const player = session.getPlayer(playerIndex);
  const enemy = session.getPlayer(enemyIndex);
  const attacker = player.board.find(unit => unit.instanceId === action.attackerInstanceId);
  if (!attacker || cardType(attacker) !== "follower") throw new Error("Attacker is not an allied follower");

  const targetLeader = action.target === "leader" || !action.targetInstanceId;
  const target = targetLeader ? null : enemy.board.find(unit => unit.instanceId === action.targetInstanceId) ?? null;
  if (targetLeader) player.attackedLeaderThisTurn = true;

  attacker.attacksRemaining = Math.max(0, Number(attacker.attacksRemaining ?? 1) - 1);
  attacker.hasAttacked = true;
  refreshWorldsBeyondAttackReadiness(session, playerIndex, attacker);
  session.emit(BATTLE_EVENT.ATTACK_START, {
    actor: playerIndex,
    payload: {
      attacker: session.cardView(attacker),
      target: target ? session.cardView(target) : { leader: enemyIndex }
    }
  });

  resolveWorldsBeyondTrigger(session, {
    trigger: "strike",
    playerIndex,
    source: attacker,
    opposingFollowerInstanceId: target?.instanceId ?? null
  });
  if (session.phase === "ended") return session.getSnapshot(playerIndex);

  const liveAttacker = session.findBoardCard(playerIndex, attacker.instanceId);
  if (!liveAttacker) return session.getSnapshot(playerIndex);
  if (target && !session.findBoardCard(enemyIndex, target.instanceId)) return session.getSnapshot(playerIndex);

  if (!target) {
    const amount = currentAttack(liveAttacker);
    session.emit(BATTLE_EVENT.ATTACK_IMPACT, {
      actor: playerIndex,
      payload: { attacker: liveAttacker.instanceId, target: "leader", damage: amount }
    });
    const dealt = session.damageLeader(enemyIndex, amount, { actor: playerIndex, source: liveAttacker });
    if (dealt > 0 && hasWorldsBeyondKeyword(liveAttacker, "Drain")) healFromDrain(session, playerIndex, dealt, liveAttacker);
    return session.getSnapshot(playerIndex);
  }

  const liveTarget = session.findBoardCard(enemyIndex, target.instanceId);
  if (!liveTarget) return session.getSnapshot(playerIndex);
  const attackDamage = currentAttack(liveAttacker);
  const counterDamage = currentAttack(liveTarget);
  const dealtByAttacker = session.damageFollower(enemyIndex, liveTarget.instanceId, attackDamage, {
    actor: playerIndex,
    source: liveAttacker,
    resolveDeath: false
  });
  const dealtByTarget = session.damageFollower(playerIndex, liveAttacker.instanceId, counterDamage, {
    actor: enemyIndex,
    source: liveTarget,
    resolveDeath: false
  });
  session.emit(BATTLE_EVENT.ATTACK_IMPACT, {
    actor: playerIndex,
    payload: {
      attacker: liveAttacker.instanceId,
      target: liveTarget.instanceId,
      attackerDamage: attackDamage,
      counterDamage
    }
  });

  if (dealtByAttacker > 0 && hasWorldsBeyondKeyword(liveAttacker, "Drain")) healFromDrain(session, playerIndex, dealtByAttacker, liveAttacker);

  const attackerAbilityInvincible = Boolean(
    liveAttacker.superEvolved && session.activePlayer === playerIndex && session.phase === "main"
  );
  let targetDestroyed = Number(liveTarget.defense ?? 0) <= 0 || hasWorldsBeyondKeyword(liveAttacker, "Bane");
  const attackerDestroyed = Number(liveAttacker.defense ?? 0) <= 0
    || (!attackerAbilityInvincible && hasWorldsBeyondKeyword(liveTarget, "Bane"));

  if (targetDestroyed) {
    targetDestroyed = Boolean(destroyWorldsBeyondFollower(session, enemyIndex, liveTarget.instanceId, {
      actor: playerIndex,
      source: liveAttacker,
      reason: "combat"
    }));
  }
  if (attackerDestroyed) {
    destroyWorldsBeyondFollower(session, playerIndex, liveAttacker.instanceId, {
      actor: enemyIndex,
      source: liveTarget,
      reason: "combat"
    });
  }
  if (targetDestroyed && liveAttacker.superEvolved && session.phase !== "ended") {
    session.damageLeader(enemyIndex, 1, {
      actor: playerIndex,
      source: liveAttacker,
      reason: "super-evolution-combat"
    });
  }

  return session.getSnapshot(playerIndex);
}

function healFromDrain(session, playerIndex, amount, source) {
  const player = session.getPlayer(playerIndex);
  const before = Number(player.hp ?? 0);
  player.hp = Math.min(Number(player.maxHp ?? 20), before + Math.max(0, Number(amount) || 0));
  const healed = player.hp - before;
  session.emit(BATTLE_EVENT.HEAL, {
    actor: playerIndex,
    payload: {
      targetPlayer: playerIndex,
      amount: healed,
      hp: player.hp,
      source: session.cardView(source),
      reason: "drain"
    }
  });
}
