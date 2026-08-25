import fs from "node:fs/promises";
import path from "node:path";

const CCG_CARDS_PATH = "api/v1/shadowverse-ccg/cards.json";
const CCG_CATALOG_PATH = "api/v1/shadowverse-ccg/catalog.json";
const CCG_MANIFEST_PATH = "api/v1/shadowverse-ccg/manifest.json";
const CB_DIR = "api/v1/champions-battle";
const CB_CARDS_PATH = path.join(CB_DIR, "cards.json");
const CB_CATALOG_PATH = path.join(CB_DIR, "catalog.json");
const CB_MANIFEST_PATH = path.join(CB_DIR, "manifest.json");

const CHAMPIONS_BATTLE_BASE_SETS = new Set([10000, 10001, 10002, 10003]);
const SET_NAMES = new Map([
  [10000, "Basic"],
  [10001, "Classic"],
  [10002, "Darkness Evolved"],
  [10003, "Rise of Bahamut"]
]);
const CRAFT_NAMES = new Map([
  [0, "Neutral"],
  [1, "Forestcraft"],
  [2, "Swordcraft"],
  [3, "Runecraft"],
  [4, "Dragoncraft"],
  [5, "Shadowcraft"],
  [6, "Bloodcraft"],
  [7, "Havencraft"],
  [8, "Portalcraft"]
]);
const RARITY_NAMES = new Map([[1, "Bronze"], [2, "Silver"], [3, "Gold"], [4, "Legendary"]]);
const TYPE_NAMES = new Map([[1, "Follower"], [2, "Amulet"], [3, "Countdown Amulet"], [4, "Spell"]]);

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function compactCard(card, gameId, dataNamespace) {
  const id = Number(card.card_id ?? card.id);
  const setId = Number(card.card_set_id ?? 0);
  const craftId = Number(card.clan ?? 0);
  const rarityId = Number(card.rarity ?? 0);
  const typeId = Number(card.char_type ?? 0);
  return {
    id,
    uid: `${dataNamespace}:${id}`,
    gameId,
    dataNamespace,
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
    set: SET_NAMES.get(setId) ?? `Set ${setId}`,
    trait: String(card.tribe_name ?? "").trim(),
    text: String(card.skill_disc ?? "").trim(),
    evolvedText: String(card.evo_skill_disc ?? "").trim(),
    image: `https://shadowverse-portal.com/image/card/en/C_${id}.png`,
    evolvedImage: typeId === 1 ? `https://shadowverse-portal.com/image/card/en/E_${id}.png` : null
  };
}

const source = JSON.parse(await fs.readFile(CCG_CARDS_PATH, "utf8"));
const sourceCards = Array.isArray(source.cards) ? source.cards : [];
if (sourceCards.length < 5000) throw new Error(`CCG archive unexpectedly small: ${sourceCards.length}`);

const ccgCards = sourceCards
  .filter(card => Number(card.card_set_id) !== 90000)
  .map(card => compactCard(card, "shadowverse-ccg", "sv1"));

const generatedAt = new Date().toISOString();
await fs.writeFile(CCG_CATALOG_PATH, json({
  schemaVersion: 1,
  gameId: "shadowverse-ccg",
  dataNamespace: "sv1",
  generatedAt,
  source: "./cards.json",
  cardCount: ccgCards.length,
  cards: ccgCards
}));

const cbSourceCards = sourceCards.filter(card => CHAMPIONS_BATTLE_BASE_SETS.has(Number(card.card_set_id)));
if (cbSourceCards.length < 600) throw new Error(`Champion's Battle base pool unexpectedly small: ${cbSourceCards.length}`);
const cbCards = cbSourceCards.map(card => compactCard(card, "champions-battle", "svcb"));
await fs.mkdir(CB_DIR, { recursive: true });
await fs.writeFile(CB_CARDS_PATH, json({
  schemaVersion: 1,
  gameId: "champions-battle",
  dataNamespace: "svcb",
  generatedAt,
  source: "local Shadowverse CCG archive",
  basePoolComplete: true,
  exclusiveCardsComplete: false,
  sourceSets: [...CHAMPIONS_BATTLE_BASE_SETS],
  cardCount: cbSourceCards.length,
  cards: cbSourceCards
}));
await fs.writeFile(CB_CATALOG_PATH, json({
  schemaVersion: 1,
  gameId: "champions-battle",
  dataNamespace: "svcb",
  generatedAt,
  source: "./cards.json",
  basePoolComplete: true,
  exclusiveCardsComplete: false,
  cardCount: cbCards.length,
  cards: cbCards
}));

const ccgManifest = JSON.parse(await fs.readFile(CCG_MANIFEST_PATH, "utf8"));
ccgManifest.files = { ...(ccgManifest.files ?? {}), catalog: "./catalog.json" };
ccgManifest.deckbuildingCardCount = ccgCards.length;
await fs.writeFile(CCG_MANIFEST_PATH, json(ccgManifest));

await fs.writeFile(CB_MANIFEST_PATH, json({
  schemaVersion: 1,
  gameId: "champions-battle",
  namespace: "svcb",
  dataNamespace: "svcb",
  status: "base-pool-ready",
  materialized: true,
  runtimeSource: "local",
  generatedAt,
  cardCount: cbCards.length,
  basePoolComplete: true,
  exclusiveCardsComplete: false,
  sourceSets: [
    { id: 10000, name: "Basic" },
    { id: 10001, name: "Classic" },
    { id: 10002, name: "Darkness Evolved" },
    { id: 10003, name: "Rise of Bahamut" }
  ],
  files: {
    cards: "./cards.json",
    catalog: "./catalog.json"
  },
  notes: "The shared launch-era card pool is materialized locally. Champion's Battle-exclusive cards must be added as a dedicated svcb-only layer after their dataset is audited."
}));

console.log(`Built ${ccgCards.length} CCG deckbuilding cards and ${cbCards.length} Champion's Battle base cards.`);
