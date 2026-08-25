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
  [10003, "Rise of Bahamut"],
  [10004, "Tempest of the Gods"],
  [10005, "Wonderland Dreams"],
  [10006, "Starforged Legends"],
  [10007, "Chronogenesis"],
  [10008, "Dawnbreak, Nightedge"],
  [10009, "Brigade of the Sky"],
  [10010, "Omen of the Ten"],
  [10011, "Altersphere"],
  [10012, "Steel Rebellion"],
  [10013, "Rebirth of Glory"],
  [10014, "Verdant Conflict"],
  [10015, "Ultimate Colosseum"],
  [10016, "World Uprooted"],
  [10017, "Fortune's Hand"],
  [10018, "Storm Over Rivayle"],
  [10019, "Eternal Awakening"],
  [10020, "Darkness Over Vellsar"],
  [10021, "Renascent Chronicles"],
  [10022, "Dawn of Calamity"],
  [10023, "Omen of Storms"],
  [10024, "Edge of Paradise"],
  [10025, "Roar of the Godwyrm"],
  [10026, "Celestial Dragonblade"],
  [10027, "Eightfold Abyss: Azvaldt"],
  [10028, "Academy of Ages"],
  [10029, "Heroes of Rivenbrandt"],
  [10030, "Order Shift"],
  [10031, "Resurgent Legends"],
  [10032, "Heroes of Shadowverse"],
  [20001, "Hatsune Miku Tie-in"],
  [20002, "SPY x FAMILY Tie-in"],
  [70001, "Prebuilt Decks Set 1"],
  [70002, "Prebuilt Decks Set 2"],
  [70003, "Anigera Didoooon Tie-in"],
  [70004, "Fate/stay night [Heaven's Feel] Tie-in"],
  [70005, "Prebuilt Decks Set 4"],
  [70006, "Prebuilt Decks Set 5"],
  [70008, "Princess Connect! Re:Dive Tie-in"],
  [70009, "One-Punch Man Tie-in"],
  [70010, "Re:ZERO Tie-in"],
  [70011, "Prebuilt Decks Set 6"],
  [70012, "Love Live! School Idol Festival Tie-in"],
  [70013, "The Melancholy of Haruhi Suzumiya Tie-in"],
  [70014, "Prebuilt Decks Set 7"],
  [70016, "NieR:Automata Tie-in"],
  [70017, "Code Geass Lelouch of the Rebellion Tie-in"],
  [70018, "Shadowverse: Champion's Battle Tie-In"],
  [70019, "Shadowverse: Champion's Battle Set"],
  [70020, "Granblue Fantasy Tie-in"],
  [70021, "Battle Pass"],
  [70022, "Kaguya-sama: Love Is War? Tie-in"],
  [70023, "The Idolmaster: Cinderella Girls Tie-in"],
  [70024, "Shaman King Tie-in"],
  [70025, "Umamusume: Pretty Derby Tie-in"],
  [70026, "Chiikawa Tie-in"],
  [70027, "Shadowverse Flame Tie-in"],
  [70028, "Hatsune Miku Tie-in"],
  [70029, "Sanrio Characters Tie-in"],
  [70030, "SPY x FAMILY Tie-in"]
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

const cbSourceCards = sourceCards.filter(card =>
  CHAMPIONS_BATTLE_BASE_SETS.has(Number(card.card_set_id)) && Number(card.clan) !== 8
);
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
  portalcraftIncluded: false,
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
  portalcraftIncluded: false,
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
  portalcraftIncluded: false,
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
  notes: "The shared launch-era card pool is materialized locally without Portalcraft. Champion's Battle-exclusive cards must be added as a dedicated svcb-only layer after their dataset is audited."
}));

console.log(`Built ${ccgCards.length} CCG deckbuilding cards and ${cbCards.length} Champion's Battle base cards.`);
