import { GAME_CATALOG, GAME_IDS } from "../../core/game-catalog.js";
import { normalizeShadowBattleCard } from "../normalize-card.js";

const game = GAME_CATALOG[GAME_IDS.CHAMPIONS_BATTLE];
const LOCAL_CARDS_URL = new URL("../../../api/v1/champions-battle/cards.json", import.meta.url);

export const championsBattleProvider = Object.freeze({
  gameId: game.id,
  dataNamespace: game.dataNamespace,
  source: "ShadowBattle local Champion's Battle base dataset",
  runtimeNetworkDependency: false,
  basePoolComplete: true,
  exclusiveCardsComplete: false,
  async loadCards({ fetchImpl = fetch } = {}) {
    const response = await fetchImpl(LOCAL_CARDS_URL);
    if (!response.ok) throw new Error(`Unable to load local Champion's Battle dataset: ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.cards)) throw new Error("Invalid local Champion's Battle card dataset");

    return payload.cards.map(card => normalizeShadowBattleCard({
      gameId: game.id,
      dataNamespace: game.dataNamespace,
      sourceCard: { ...card, id: card.card_id ?? card.id }
    }));
  }
});
