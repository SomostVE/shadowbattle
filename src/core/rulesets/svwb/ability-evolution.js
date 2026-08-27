import { BATTLE_EVENT } from "../../battle-events.js";
import { resolveWorldsBeyondTrigger } from "./effect-resolver.js";

export function evolveWorldsBeyondFollowerByAbility(session, playerIndex, source) {
  if (!session || (playerIndex !== 0 && playerIndex !== 1) || !source?.instanceId) return false;
  const follower = session.findBoardCard(playerIndex, source.instanceId);
  if (!follower || cardType(follower) !== "follower" || follower.evolved) return false;

  const bonus = 2;
  follower.attack = currentAttack(follower) + bonus;
  follower.maxDefense = currentMaxDefense(follower) + bonus;
  follower.defense = currentDefense(follower) + bonus;
  follower.evolved = true;
  follower.superEvolved = false;
  follower.imageOverride = follower.card?.evolved?.image ?? follower.imageOverride ?? null;
  if (Number(follower.attacksRemaining ?? 0) > 0) follower.canAttackFollowers = true;

  const player = session.getPlayer(playerIndex);
  session.emit(BATTLE_EVENT.EVOLVE, {
    actor: playerIndex,
    payload: {
      card: session.cardView(follower),
      pointsRemaining: Number(player.resources?.evolutionPoints ?? 0),
      statBonus: bonus,
      byAbility: true
    }
  });

  resolveWorldsBeyondTrigger(session, {
    trigger: "evolve",
    playerIndex,
    source: follower
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
