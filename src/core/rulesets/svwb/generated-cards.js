import { BATTLE_EVENT, BATTLE_VISIBILITY } from "../../battle-events.js";

export function addWorldsBeyondGeneratedCard(session, playerIndex, card, { reason = "ability" } = {}) {
  if (!card || typeof card !== "object") return { added: false, burned: false, instance: null, reason: "missing-card" };
  const player = session.getPlayer(playerIndex);
  const instance = createWorldsBeyondGeneratedInstance(session, playerIndex, card);

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

export function createWorldsBeyondGeneratedInstance(session, playerIndex, card) {
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

export function createWorldsBeyondExactCopyInstance(session, playerIndex, source) {
  if (!source?.card) return null;
  const copy = createWorldsBeyondGeneratedInstance(session, playerIndex, source.card);
  copy.cardId = source.cardId ?? source.card?.id ?? copy.cardId;
  copy.costDelta = Number(source.costDelta ?? 0);
  copy.attackBonus = Number(source.attackBonus ?? 0);
  copy.defenseBonus = Number(source.defenseBonus ?? 0);
  copy.spellboost = Number(source.spellboost ?? 0);
  if (Number.isFinite(Number(source.x))) copy.x = Number(source.x);
  if (Array.isArray(source.grantedKeywords)) copy.grantedKeywords = [...source.grantedKeywords];
  if (Array.isArray(source.fusedCards)) copy.fusedCards = source.fusedCards.map(item => ({ ...item }));
  if (Array.isArray(source.fusedNames)) copy.fusedNames = [...source.fusedNames];
  return copy;
}

function hasInstanceId(session, instanceId) {
  return session.players.some(player => [player.deck, player.hand, player.board, player.cemetery, player.banished]
    .some(zone => (zone ?? []).some(item => item?.instanceId === instanceId)));
}
