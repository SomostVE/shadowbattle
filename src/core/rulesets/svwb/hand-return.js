import { BATTLE_EVENT } from "../../battle-events.js";

export const HAND_RETURN_TO_DECK_SELECTION = /\bselect\s+(?:a|an|one)\s+card in your hand and return it to (?:your\s+)?deck\b/i;

export function hasWorldsBeyondHandReturnSelection(text) {
  return HAND_RETURN_TO_DECK_SELECTION.test(String(text ?? ""));
}

export function stripWorldsBeyondHandReturnSelection(text) {
  return String(text ?? "").replace(new RegExp(HAND_RETURN_TO_DECK_SELECTION.source, "gi"), " ");
}

export function getWorldsBeyondHandReturnOptions(player, source = null) {
  return (player?.hand ?? []).filter(item => item?.instanceId !== source?.instanceId);
}

export function returnWorldsBeyondHandCardToDeck(session, playerIndex, instanceId, { source = null, reason = "ability" } = {}) {
  const player = session.getPlayer(playerIndex);
  const index = player.hand.findIndex(item => item?.instanceId === instanceId && item?.instanceId !== source?.instanceId);
  if (index < 0) return null;

  const [returned] = player.hand.splice(index, 1);
  const insertionIndex = Math.min(
    player.deck.length,
    Math.floor(session.rng() * (player.deck.length + 1))
  );
  player.deck.splice(insertionIndex, 0, returned);
  session.emit(BATTLE_EVENT.CARD_RETURNED, {
    actor: playerIndex,
    payload: {
      owner: playerIndex,
      card: session.cardView(returned),
      source: source ? session.cardView(source) : null,
      sourceZone: "hand",
      destination: "deck",
      deckIndex: insertionIndex,
      reason
    }
  });
  return returned;
}
