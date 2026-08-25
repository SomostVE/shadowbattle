import { GAME_CATALOG, GAME_IDS } from "../../core/game-catalog.js";

const game = GAME_CATALOG[GAME_IDS.SHADOWVERSE_CCG];

export const shadowverseCcgProvider = Object.freeze({
  gameId: game.id,
  dataNamespace: game.dataNamespace,
  source: "Shadowverse Portal (planned)",
  async loadCards() {
    throw new Error("Shadowverse CCG provider is not enabled yet: source schema and normalization must be audited first");
  }
});
