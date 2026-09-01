import { BATTLE_EVENT } from "../../battle-events.js";
import { destroyBoardAmulet, restoreOriginalCardForm } from "../../zone-actions.js";
import { gainWorldsBeyondShadows, resolveWorldsBeyondTrigger } from "./effect-resolver.js";

export function advanceWorldsBeyondAmuletCountdown(session, playerIndex, instanceId, amount = 1, {
  actor = playerIndex,
  source = null,
  reason = "ability"
} = {}) {
  const amulet = session.findBoardCard(playerIndex, instanceId);
  const value = Math.max(0, Number(amount) || 0);
  if (!amulet || cardType(amulet) !== "amulet" || !value || !hasFiniteCountdown(amulet)) {
    return { applied: false, destroyed: false, countdown: amulet?.countdown ?? null };
  }

  amulet.countdown = Math.max(0, Number(amulet.countdown) - value);
  session.emit(BATTLE_EVENT.COUNTDOWN_TICK, {
    actor,
    payload: {
      card: session.cardView(amulet),
      countdown: amulet.countdown,
      amount: value,
      source: source ? session.cardView(source) : null,
      reason,
      advanced: reason !== "turn-start"
    }
  });

  if (amulet.countdown > 0) return { applied: true, destroyed: false, countdown: amulet.countdown };
  const destroyed = destroyWorldsBeyondAmulet(session, playerIndex, amulet.instanceId, { actor, source, reason });
  return { applied: true, destroyed: Boolean(destroyed), countdown: 0 };
}

export function delayWorldsBeyondAmuletCountdown(session, playerIndex, instanceId, amount = 1, {
  actor = playerIndex,
  source = null,
  reason = "ability"
} = {}) {
  const amulet = session.findBoardCard(playerIndex, instanceId);
  const value = Math.max(0, Number(amount) || 0);
  if (!amulet || cardType(amulet) !== "amulet" || !value || !hasFiniteCountdown(amulet)) {
    return { applied: false, countdown: amulet?.countdown ?? null };
  }

  amulet.countdown = Number(amulet.countdown) + value;
  session.emit(BATTLE_EVENT.COUNTDOWN_TICK, {
    actor,
    payload: {
      card: session.cardView(amulet),
      countdown: amulet.countdown,
      amount: value,
      source: source ? session.cardView(source) : null,
      reason,
      advanced: false,
      delayed: true
    }
  });
  return { applied: true, countdown: amulet.countdown };
}

export function destroyWorldsBeyondAmulet(session, playerIndex, instanceId, {
  actor = playerIndex,
  source = null,
  reason = "ability"
} = {}) {
  const destroyed = destroyBoardAmulet(session, playerIndex, instanceId, { actor, source, reason });
  if (!destroyed) return null;

  gainWorldsBeyondShadows(session, playerIndex, 1);
  resolveWorldsBeyondTrigger(session, { trigger: "last-words", playerIndex, source: destroyed });
  restoreOriginalCardForm(destroyed);
  return destroyed;
}

function hasFiniteCountdown(instance) {
  return instance?.countdown != null && Number.isFinite(Number(instance.countdown));
}

function cardType(instance) {
  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}
