import { BATTLE_EVENT } from "../../battle-events.js";

export function evolveWorldsBeyondFollowerByAbility(session, playerIndex, source) {
  return evolveFollowerByAbility(session, playerIndex, source, false);
}

export function superEvolveWorldsBeyondFollowerByAbility(session, playerIndex, source) {
  return evolveFollowerByAbility(session, playerIndex, source, true);
}

function evolveFollowerByAbility(session, playerIndex, source, superEvolution) {
  if (!session || (playerIndex !== 0 && playerIndex !== 1) || !source?.instanceId) return false;
  const follower = session.findBoardCard(playerIndex, source.instanceId);
  if (!follower || cardType(follower) !== "follower" || follower.evolved) return false;

  const bonus = superEvolution ? 3 : 2;
  follower.attack = currentAttack(follower) + bonus;
  follower.maxDefense = currentMaxDefense(follower) + bonus;
  follower.defense = currentDefense(follower) + bonus;
  follower.evolved = true;
  follower.superEvolved = superEvolution;
  follower.imageOverride = follower.card?.evolved?.image ?? follower.imageOverride ?? null;
  if (!follower.permanentAttackLock && Number(follower.attacksRemaining ?? 0) > 0) follower.canAttackFollowers = true;

  const player = session.getPlayer(playerIndex);
  session.emit(superEvolution ? BATTLE_EVENT.SUPER_EVOLVE : BATTLE_EVENT.EVOLVE, {
    actor: playerIndex,
    payload: {
      card: session.cardView(follower),
      pointsRemaining: Number(player.resources?.[superEvolution ? "superEvolutionPoints" : "evolutionPoints"] ?? 0),
      statBonus: bonus,
      byAbility: true
    }
  });

  return true;
}

function currentAttack(instance) {
  return Number(instance?.attack ?? (Number(instance?.card?.attack ?? 0) + Number(instance?.attackBonus ?? 0)));
}

function currentDefense(instance) {
  return Number(instance?.defense ?? (Number(instance?.card?.defense ?? 0) + Number(instance?.defenseBonus ?? 0)));
}

function currentMaxDefense(instance) {
  return Number(instance?.maxDefense ?? currentDefense(instance));
}

function cardType(instance) {
  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}
