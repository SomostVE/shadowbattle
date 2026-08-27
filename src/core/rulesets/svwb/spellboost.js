import { BATTLE_EVENT, BATTLE_VISIBILITY } from "../../battle-events.js";
import { canUseClassMechanic, isSpellboostRecipientCard } from "./v5/battle-class-mechanics.js";

export function spellboostWorldsBeyondHand(session, playerIndex, amount = 1, { source = null, reason = "spellboost" } = {}) {
  const player = session.getPlayer(playerIndex);
  const times = Math.max(0, Math.floor(Number(amount) || 0));
  if (!times || !canUseClassMechanic(player, "spellboost", source?.card ?? source)) return [];

  const boosted = [];
  for (const instance of player.hand) {
    if (!isSpellboostRecipientCard(instance?.card)) continue;
    const before = Math.max(0, Number(instance.spellboost) || 0);
    instance.spellboost = before + times;
    applySpellboostX(instance, times);
    applySpellboostStats(instance, times);
    session.emit(BATTLE_EVENT.CARD_SPELLBOOSTED, {
      actor: playerIndex,
      visibility: BATTLE_VISIBILITY.OWNER,
      payload: {
        owner: playerIndex,
        card: session.cardView(instance),
        amount: times,
        before,
        spellboost: instance.spellboost,
        reason,
        source: source ? session.cardView(source) : null
      }
    });
    boosted.push(instance);
  }
  return boosted;
}

export function worldsBeyondCardX(instance) {
  if (Number.isFinite(Number(instance?.x))) return Number(instance.x);
  const start = String(instance?.card?.text ?? "").match(/\bX starts at\s+(\d+)\b/i);
  return start ? Number(start[1]) : Math.max(0, Number(instance?.spellboost) || 0);
}

function applySpellboostX(instance, times) {
  const text = String(instance?.card?.text ?? "");
  const increase = text.match(/\bOn Spellboost\s*:\s*Increase X by\s+(\d+)\b/i);
  if (!increase) return;
  const current = worldsBeyondCardX(instance);
  instance.x = current + Math.max(0, Number(increase[1]) || 0) * times;
}

function applySpellboostStats(instance, times) {
  const text = String(instance?.card?.text ?? "");
  const match = text.match(/\bOn Spellboost\s*:\s*Give this follower\s+\+(\d+)\s*\/\s*\+(\d+)\b/i);
  if (!match) return;
  instance.attackBonus = Number(instance.attackBonus ?? 0) + (Number(match[1]) || 0) * times;
  instance.defenseBonus = Number(instance.defenseBonus ?? 0) + (Number(match[2]) || 0) * times;
}
