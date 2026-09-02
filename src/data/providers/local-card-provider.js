import { normalizeShadowBattleCard } from "../normalize-card.js";

export function createLocalCardProvider({
  game,
  cardsUrl,
  source,
  loadError,
  invalidError,
  sourceCardId,
  metadata = {}
}) {
  return Object.freeze({
    gameId: game.id,
    dataNamespace: game.dataNamespace,
    source,
    runtimeNetworkDependency: false,
    ...metadata,
    async loadCards({ fetchImpl = fetch } = {}) {
      const response = await fetchImpl(cardsUrl);
      if (!response.ok) throw new Error(`${loadError}: ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.cards)) throw new Error(invalidError);

      return payload.cards.map(card => normalizeShadowBattleCard({
        gameId: game.id,
        dataNamespace: game.dataNamespace,
        sourceCard: { ...card, id: sourceCardId(card) }
      }));
    }
  });
}
