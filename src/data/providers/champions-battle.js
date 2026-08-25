import { GAME_CATALOG, GAME_IDS } from "../../core/game-catalog.js";

const game = GAME_CATALOG[GAME_IDS.CHAMPIONS_BATTLE];

export const championsBattleProvider = Object.freeze({
  gameId: game.id,
  dataNamespace: game.dataNamespace,
  source: "Dedicated Champion's Battle dataset (planned)",
  async loadCards() {
    throw new Error("Champion's Battle provider is not enabled yet: a dedicated normalized dataset is required");
  }
});
