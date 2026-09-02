import { GAME_IDS } from "../core/game-catalog.js";

const CATALOG_URLS = Object.freeze({
  [GAME_IDS.SHADOWVERSE_CCG]: new URL("../../api/v1/shadowverse-ccg/catalog.json", import.meta.url),
  [GAME_IDS.CHAMPIONS_BATTLE]: new URL("../../api/v1/champions-battle/catalog.json", import.meta.url)
});
const RAW_CCG_URL = new URL("../../api/v1/shadowverse-ccg/cards.json", import.meta.url);
const CARD_POOL_MODE_KEY = "shadowbattle:card-pool-mode";

const CRAFT_NAMES = new Map([
  [0, "Neutral"], [1, "Forestcraft"], [2, "Swordcraft"], [3, "Runecraft"],
  [4, "Dragoncraft"], [5, "Shadowcraft"], [6, "Bloodcraft"], [7, "Havencraft"], [8, "Portalcraft"]
]);
const RARITY_NAMES = new Map([[1, "Bronze"], [2, "Silver"], [3, "Gold"], [4, "Legendary"]]);
const TYPE_NAMES = new Map([[1, "Follower"], [2, "Amulet"], [3, "Countdown Amulet"], [4, "Spell"]]);

const cache = new Map();
const referenceCache = new Map();

export async function loadDeckCatalog(gameId) {
  const url = CATALOG_URLS[gameId];
  if (!url) throw new Error(`No editable deck catalog for ${gameId}`);
  if (cache.has(gameId)) return cache.get(gameId);

  const promise = fetch(url, { cache: "force-cache" }).then(async response => {
    if (!response.ok) throw new Error(`Unable to load ${gameId} deck catalog (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload.cards)) throw new Error(`${gameId} catalog is missing cards`);
    return payload;
  }).catch(error => {
    cache.delete(gameId);
    throw error;
  });
  cache.set(gameId, promise);
  return promise;
}

// Generated/token cards are intentionally absent from the compact deck catalog.
// Load the archived raw CCG dataset only when the deck assistant needs linked
// cards. This remains same-origin/local data and never calls the Portal API.
export async function loadDeckReferenceCards(gameId) {
  if (!CATALOG_URLS[gameId]) throw new Error(`No reference catalog for ${gameId}`);
  if (referenceCache.has(gameId)) return referenceCache.get(gameId);

  const promise = Promise.all([
    loadDeckCatalog(gameId),
    fetch(RAW_CCG_URL, { cache: "force-cache" }).then(async response => {
      if (!response.ok) throw new Error(`Unable to load archived Shadowverse references (${response.status})`);
      return response.json();
    })
  ]).then(([deckPayload, rawPayload]) => {
    const deckCards = Array.isArray(deckPayload.cards) ? deckPayload.cards : [];
    const deckIds = new Set(deckCards.map(card => Number(card.id)));
    const rawCards = Array.isArray(rawPayload.cards) ? rawPayload.cards : [];
    const namespace = gameId === GAME_IDS.CHAMPIONS_BATTLE ? "svcb" : "sv1";

    const references = rawCards
      .filter(card => {
        const id = Number(card.card_id ?? card.id);
        if (deckIds.has(id)) return false;
        return Number(card.card_set_id ?? 0) === 90000;
      })
      .map(card => compactReferenceCard(card, gameId, namespace));

    return [...deckCards.map(card => ({ ...card, deckSelectable: true })), ...references];
  }).catch(error => {
    referenceCache.delete(gameId);
    throw error;
  });

  referenceCache.set(gameId, promise);
  return promise;
}

function compactReferenceCard(card, gameId, namespace) {
  const id = Number(card.card_id ?? card.id);
  const setId = Number(card.card_set_id ?? 0);
  const craftId = Number(card.clan ?? 0);
  const rarityId = Number(card.rarity ?? 0);
  const typeId = Number(card.char_type ?? 0);
  return {
    id,
    uid: `${namespace}:${id}`,
    gameId,
    dataNamespace: namespace,
    deckSelectable: false,
    name: String(card.card_name ?? card.name ?? `Card ${id}`),
    cost: Number(card.cost ?? 0),
    attack: Number(card.atk ?? 0),
    defense: Number(card.life ?? 0),
    evolvedAttack: Number(card.evo_atk ?? card.atk ?? 0),
    evolvedDefense: Number(card.evo_life ?? card.life ?? 0),
    craftId,
    craft: CRAFT_NAMES.get(craftId) ?? `Craft ${craftId}`,
    rarityId,
    rarity: RARITY_NAMES.get(rarityId) ?? `Rarity ${rarityId}`,
    typeId,
    type: TYPE_NAMES.get(typeId) ?? `Type ${typeId}`,
    setId,
    set: setId === 90000 ? "Generated" : `Set ${setId}`,
    trait: String(card.tribe_name ?? "").trim(),
    text: String(card.skill_disc ?? "").trim(),
    evolvedText: String(card.evo_skill_disc ?? "").trim(),
    image: `https://shadowverse-portal.com/image/card/phase2/common/C/C_${id}.png`,
    evolvedImage: typeId === 1 ? `https://shadowverse-portal.com/image/card/phase2/sp/common/E/E_${id}.png` : null
  };
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
    const haystack = `${card.name} ${card.text ?? ""} ${card.evolvedText ?? ""} ${card.trait ?? ""} ${card.type ?? ""}`.toLowerCase();
    return haystack.includes(needle);
  });
}

function getCardPoolMode() {
  if (typeof localStorage === "undefined") return "all";
  return localStorage.getItem(CARD_POOL_MODE_KEY) === "neutral" ? "neutral" : "class";
}
