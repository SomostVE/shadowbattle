import { GAME_IDS } from "../core/game-catalog.js";

const CATALOG_URLS = Object.freeze({
  [GAME_IDS.SHADOWVERSE_CCG]: new URL("../../api/v1/shadowverse-ccg/catalog.json", import.meta.url),
  [GAME_IDS.CHAMPIONS_BATTLE]: new URL("../../api/v1/champions-battle/catalog.json", import.meta.url)
});
const CARD_POOL_MODE_KEY = "shadowbattle:card-pool-mode";

const cache = new Map();

export async function loadDeckCatalog(gameId) {
  const url = CATALOG_URLS[gameId];
  if (!url) throw new Error(`No editable deck catalog for ${gameId}`);
  if (cache.has(gameId)) return cache.get(gameId);

  const promise = fetch(url, { cache: "force-cache" }).then(async response => {
    if (!response.ok) throw new Error(`Unable to load ${gameId} deck catalog (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload.cards)) throw new Error(`${gameId} catalog is missing cards`);
    return payload;
  });
  cache.set(gameId, promise);
  return promise;
}

export function filterCatalog(cards, { query = "", craft = "all", set = "all" } = {}) {
  const needle = String(query).trim().toLowerCase();
  const poolMode = getCardPoolMode();

  return (cards ?? []).filter(card => {
    if (poolMode === "neutral" && card.craft !== "Neutral") return false;
    if (poolMode === "class" && card.craft === "Neutral") return false;
    if (craft !== "all" && card.craft !== craft && card.craft !== "Neutral") return false;
    if (set !== "all" && String(card.setId) !== String(set)) return false;
    if (!needle) return true;
    const haystack = `${card.name} ${card.text ?? ""} ${card.trait ?? ""} ${card.type ?? ""}`.toLowerCase();
    return haystack.includes(needle);
  });
}

function getCardPoolMode() {
  if (typeof localStorage === "undefined") return "all";
  return localStorage.getItem(CARD_POOL_MODE_KEY) === "neutral" ? "neutral" : "class";
}
