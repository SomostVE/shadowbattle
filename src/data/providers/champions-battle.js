import { GAME_CATALOG, GAME_IDS } from "../../core/game-catalog.js";
import { createLocalCardProvider } from "./local-card-provider.js";

const game = GAME_CATALOG[GAME_IDS.CHAMPIONS_BATTLE];
const LOCAL_CARDS_URL = new URL("../../../api/v1/champions-battle/cards.json", import.meta.url);

export const championsBattleProvider = createLocalCardProvider({
  game,
  cardsUrl: LOCAL_CARDS_URL,
  source: "ShadowBattle local Champion's Battle base dataset",
  loadError: "Unable to load local Champion's Battle dataset",
  invalidError: "Invalid local Champion's Battle card dataset",
  sourceCardId: card => card.card_id ?? card.id,
  metadata: {
    basePoolComplete: true,
    exclusiveCardsComplete: false
  }
});
