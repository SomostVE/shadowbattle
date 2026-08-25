const GAME_CONFIG = Object.freeze({
  "worlds-beyond": {
    namespace: "svwb",
    endpoint: "./api/v1/worlds-beyond/bot-decks.json"
  }
});

export async function loadReferenceDecks(gameId, { baseUrl = document?.baseURI ?? import.meta.url } = {}) {
  const config = GAME_CONFIG[gameId];
  if (!config) return [];

  const endpoint = new URL(config.endpoint, baseUrl);
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`Reference deck pool unavailable for ${gameId}: ${response.status}`);

  const payload = await response.json();
  return (payload.decks ?? []).map(deck => normalizeDeck(deck, gameId, config.namespace));
}

export function normalizeDeck(deck, gameId, namespace) {
  return {
    id: `${namespace}:${deck.id}`,
    sourceId: deck.id,
    gameId,
    namespace,
    name: deck.name,
    class: deck.class,
    format: deck.format,
    strategy: structuredClone(deck.strategy ?? {}),
    portalHash: deck.portalHash ?? "",
    cards: (deck.cards ?? []).map(card => ({
      ...card,
      qualifiedId: `${namespace}:${card.cardId}`
    }))
  };
}

export function getReferenceDeckGames() {
  return Object.keys(GAME_CONFIG);
}
