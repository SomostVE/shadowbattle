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

export function summonWorldsBeyondGeneratedFollower(session, playerIndex, card, {
  reason = "ability",
  source = null
} = {}) {
  if (!card || typeof card !== "object" || cardType(card) !== "follower") {
    return { summoned: false, instance: null, reason: "invalid-follower" };
  }
  const player = session.getPlayer(playerIndex);
  if (player.board.length >= session.ruleset.maxBoardSize) {
    return { summoned: false, instance: null, reason: "board-full" };
  }

  const instance = createWorldsBeyondGeneratedInstance(session, playerIndex, card);
  prepareGeneratedFollower(instance, session.turn);
  player.board.push(instance);
  session.emit(BATTLE_EVENT.FOLLOWER_ENTER, {
    actor: playerIndex,
    payload: {
      card: session.cardView(instance),
      position: player.board.length - 1,
      reason,
      source: source ? session.cardView(source) : null
    }
  });
  return { summoned: true, instance, reason: null };
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

function prepareGeneratedFollower(instance, turn) {
  const attack = Number(instance.card?.attack ?? 0) + Number(instance.attackBonus ?? 0);
  const defense = Number(instance.card?.defense ?? 0) + Number(instance.defenseBonus ?? 0);
  instance.attack = attack;
  instance.defense = defense;
  instance.maxDefense = defense;
  instance.playedTurn = turn;
  instance.evolved = false;
  instance.superEvolved = false;
  instance.attacksRemaining = 1;
  instance.hasAttacked = false;
  instance.canAttackFollowers = false;
  instance.canAttackLeader = false;
}

function cardType(card) {
  return String(card?.type ?? "").trim().toLowerCase();
}

function hasInstanceId(session, instanceId) {
  return session.players.some(player => [player.deck, player.hand, player.board, player.cemetery, player.banished]
    .some(zone => (zone ?? []).some(item => item?.instanceId === instanceId)));
}
