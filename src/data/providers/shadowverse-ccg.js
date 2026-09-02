import { GAME_CATALOG, GAME_IDS } from "../../core/game-catalog.js";
import { createLocalCardProvider } from "./local-card-provider.js";

const game = GAME_CATALOG[GAME_IDS.SHADOWVERSE_CCG];
const LOCAL_CARDS_URL = new URL("../../../api/v1/shadowverse-ccg/cards.json", import.meta.url);

export const shadowverseCcgProvider = createLocalCardProvider({
  game,
  cardsUrl: LOCAL_CARDS_URL,
  source: "ShadowBattle local archived Shadowverse Portal snapshot",
  loadError: "Unable to load local Shadowverse CCG archive",
  invalidError: "Invalid local Shadowverse CCG card archive",
  sourceCardId: card => card.card_id
});
