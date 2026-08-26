import { BATTLE_EVENT } from "./battle-events.js";

export function banishBoardCard(session, playerIndex, instanceId, { actor = null, source = null, reason = "banish" } = {}) {
  const player = session.getPlayer(playerIndex);
  const index = player.board.findIndex(card => card.instanceId === instanceId);
  if (index < 0) return null;
  const card = player.board[index];
  player.board.splice(index, 1);
  player.banished.push(card);
  session.emit(BATTLE_EVENT.CARD_BANISHED, {
    actor,
    payload: {
      owner: playerIndex,
      card: session.cardView(card),
      source: source ? session.cardView(source) : null,
      reason
    }
  });
  restoreOriginalCardForm(card);
  return card;
}

export function returnBoardCardToHand(session, playerIndex, instanceId, { actor = null, source = null, reason = "return" } = {}) {
  const player = session.getPlayer(playerIndex);
  const index = player.board.findIndex(card => card.instanceId === instanceId);
  if (index < 0) return null;
  const card = player.board[index];
  player.board.splice(index, 1);
  resetReturnedCard(session, card);

  const handFull = player.hand.length >= session.ruleset.maxHandSize;
  if (handFull) player.cemetery.push(card);
  else player.hand.push(card);

  session.emit(BATTLE_EVENT.CARD_RETURNED, {
    actor,
    payload: {
      owner: playerIndex,
      card: session.cardView(card),
      source: source ? session.cardView(source) : null,
      reason,
      handFull,
      destination: handFull ? "cemetery" : "hand"
    }
  });
  return card;
}

export function restoreOriginalCardForm(card) {
  if (card?.originalCard) card.card = card.originalCard;
  delete card.originalCard;
  delete card.activeText;
  delete card.alternativeMode;
}

function resetReturnedCard(session, card) {
  restoreOriginalCardForm(card);

  // Board effects may clone/mutate the instance's card definition (for
  // example a granted Ward). Restore the canonical definition registered by
  // GameSession so those temporary keywords cannot survive a bounce/replay.
  const canonical = session.findCardDefinition({
    id: card.cardId ?? card.card?.id ?? null,
    name: card.card?.name ?? null
  });
  if (canonical) card.card = canonical;

  card.costDelta = 0;
  card.attackBonus = 0;
  card.defenseBonus = 0;
  card.spellboost = Number(card.spellboost ?? 0);
  delete card.attack;
  delete card.defense;
  delete card.maxDefense;
  delete card.evolved;
  delete card.superEvolved;
  delete card.imageOverride;
  delete card.attacksRemaining;
  delete card.hasAttacked;
  delete card.canAttackFollowers;
  delete card.canAttackLeader;
  delete card.countdown;
  delete card.playedTurn;
  delete card.grantedKeywords;
  delete card.permanentAttackLock;
  delete card.himekaBanishAtOwnTurnEnd;
  delete card.himekaBanishActor;
  delete card.engagedThisTurn;
}
