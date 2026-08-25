import { GAME_CATALOG, GAME_IDS } from "../../core/game-catalog.js";
import { normalizeShadowBattleCard } from "../normalize-card.js";

const game = GAME_CATALOG[GAME_IDS.WORLDS_BEYOND];
const BASE_URL = "https://somostve.github.io/beyond_codex/api/v1";

async function fetchJson(path) {
  const response = await fetch(`${BASE_URL}/${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Beyond Codex ${path} failed with HTTP ${response.status}`);
  return response.json();
}

export const worldsBeyondProvider = Object.freeze({
  gameId: game.id,
  dataNamespace: game.dataNamespace,
  source: "Beyond Codex",
  async loadCards() {
    const cards = await fetchJson("cards.json");
    if (!Array.isArray(cards)) throw new Error("Beyond Codex cards endpoint did not return an array");
    return cards.map(sourceCard => normalizeShadowBattleCard({
      gameId: game.id,
      dataNamespace: game.dataNamespace,
      sourceCard
    }));
  },
  async loadManifest() {
    return fetchJson("manifest.json");
  }
});
