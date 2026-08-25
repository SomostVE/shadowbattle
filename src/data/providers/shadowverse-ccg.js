import { GAME_CATALOG, GAME_IDS } from "../../core/game-catalog.js";
import { normalizeShadowBattleCard } from "../normalize-card.js";

const game = GAME_CATALOG[GAME_IDS.SHADOWVERSE_CCG];
const LOCAL_CARDS_URL = new URL("../../../api/v1/shadowverse-ccg/cards.json", import.meta.url);

export const shadowverseCcgProvider = Object.freeze({
  gameId: game.id,
  dataNamespace: game.dataNamespace,
  source: "ShadowBattle local archived Shadowverse Portal snapshot",
  runtimeNetworkDependency: false,
  async loadCards({ fetchImpl = fetch } = {}) {
    const response = await fetchImpl(LOCAL_CARDS_URL);
    if (!response.ok) throw new Error(`Unable to load local Shadowverse CCG archive: ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.cards)) throw new Error("Invalid local Shadowverse CCG card archive");

    return payload.cards.map(card => normalizeShadowBattleCard({
      gameId: game.id,
      dataNamespace: game.dataNamespace,
      sourceCard: { ...card, id: card.card_id }
    }));
  }
});
