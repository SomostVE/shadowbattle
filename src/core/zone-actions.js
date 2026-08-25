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
  return card;
}

export function returnBoardCardToHand(session, playerIndex, instanceId, { actor = null, source = null, reason = "return" } = {}) {
  const player = session.getPlayer(playerIndex);
  const index = player.board.findIndex(card => card.instanceId === instanceId);
  if (index < 0) return null;
  const card = player.board[index];
  player.board.splice(index, 1);
  resetReturnedCard(card);

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

function resetReturnedCard(card) {
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
}
