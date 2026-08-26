import { BATTLE_EVENT, BATTLE_VISIBILITY } from "../../battle-events.js";

export function addWorldsBeyondGeneratedCard(session, playerIndex, card, { reason = "ability" } = {}) {
  if (!card || typeof card !== "object") return { added: false, burned: false, instance: null, reason: "missing-card" };
  const player = session.getPlayer(playerIndex);
  const instance = createGeneratedInstance(session, playerIndex, card);

  if (player.hand.length >= session.ruleset.maxHandSize) {
    player.cemetery.push(instance);
    session.emit(BATTLE_EVENT.CARD_BURNED, {
      actor: playerIndex,
      visibility: BATTLE_VISIBILITY.OWNER,
      payload: { card: session.cardView(instance), reason }
    });
    return { added: false, burned: true, instance, reason: "hand-full" };
  }

  player.hand.push(instance);
  return { added: true, burned: false, instance, reason: null };
}

function createGeneratedInstance(session, playerIndex, card) {
  const cardId = card.id ?? card.cardId ?? card.sourceCardId ?? card.name ?? "generated";
  const base = `generated:${playerIndex}:${session.eventSequence}:${String(cardId)}`;
  let suffix = 0;
  let instanceId = base;
  while (hasInstanceId(session, instanceId)) {
    suffix += 1;
    instanceId = `${base}:${suffix}`;
  }
  return {
    instanceId,
    owner: playerIndex,
    cardId: card.id ?? card.cardId ?? card.sourceCardId ?? null,
    card,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0
  };
}

function hasInstanceId(session, instanceId) {
  return session.players.some(player => [player.deck, player.hand, player.board, player.cemetery, player.banished]
    .some(zone => (zone ?? []).some(item => item?.instanceId === instanceId)));
}
