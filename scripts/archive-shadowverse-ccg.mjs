import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const SOURCE = "https://shadowverse-portal.com/api/v1/cards";
const LANGUAGES = ["en", "ja", "ko", "zh-tw", "fr", "it", "de", "es"];
const MIN_EXPECTED_CARDS = 4500;
const RAW_DIR = "archive/shadowverse-ccg/raw";
const API_DIR = "api/v1/shadowverse-ccg";
const LOCALE_DIR = path.join(API_DIR, "locales");

async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "ShadowBattle archival snapshot/0.3",
          accept: "application/json"
        },
        signal: AbortSignal.timeout(45_000)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return JSON.parse(await response.text());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function countBy(cards, key) {
  const out = {};
  for (const card of cards) {
    const value = String(card?.[key] ?? "unknown");
    out[value] = (out[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })));
}

await fs.mkdir(RAW_DIR, { recursive: true });
await fs.mkdir(LOCALE_DIR, { recursive: true });

const fetchedAt = new Date().toISOString();
let canonicalIds = null;
const localeSummary = {};
let englishCards = null;
let englishHeaders = null;

for (const lang of LANGUAGES) {
  const url = `${SOURCE}?format=json&lang=${encodeURIComponent(lang)}`;
  console.log(`Fetching ${lang}: ${url}`);
  const payload = await fetchJson(url);
  const cards = payload?.data?.cards;
  if (!Array.isArray(cards) || cards.length < MIN_EXPECTED_CARDS) {
    throw new Error(`Unexpected ${lang} card count: ${Array.isArray(cards) ? cards.length : "not an array"}`);
  }

  const ids = cards.map(card => String(card.card_id)).sort();
  if (canonicalIds == null) canonicalIds = ids;
  else if (ids.length !== canonicalIds.length || ids.some((id, index) => id !== canonicalIds[index])) {
    throw new Error(`${lang} does not contain the same card-id set as ${LANGUAGES[0]}`);
  }

  const rawText = stableJson(payload);
  await fs.writeFile(path.join(RAW_DIR, `cards.${lang}.json`), rawText, "utf8");

  const localePayload = {
    schemaVersion: 1,
    gameId: "shadowverse-ccg",
    dataNamespace: "sv1",
    language: lang,
    source: SOURCE,
    fetchedAt,
    cardCount: cards.length,
    cards
  };
  const localeText = stableJson(localePayload);
  await fs.writeFile(path.join(LOCALE_DIR, `cards.${lang}.json`), localeText, "utf8");

  localeSummary[lang] = {
    cardCount: cards.length,
    sha256: sha256(localeText)
  };

  if (lang === "en") {
    englishCards = cards;
    englishHeaders = payload.data_headers ?? null;
  }
}

const imageIndex = englishCards.map(card => ({
  cardId: String(card.card_id),
  base: `https://shadowverse-portal.com/image/card/phase2/common/C/C_${card.card_id}.png`,
  evolved: Number(card.char_type) === 1 ? `https://shadowverse-portal.com/image/card/phase2/sp/common/E/E_${card.card_id}.png` : null
}));

const cardsPayload = {
  schemaVersion: 1,
  gameId: "shadowverse-ccg",
  dataNamespace: "sv1",
  language: "en",
  source: "local-archived-shadowverse-portal",
  sourceEndpoint: SOURCE,
  fetchedAt,
  cardCount: englishCards.length,
  cards: englishCards
};
const cardsText = stableJson(cardsPayload);
await fs.writeFile(path.join(API_DIR, "cards.json"), cardsText, "utf8");
await fs.writeFile(path.join(API_DIR, "data-headers.json"), stableJson(englishHeaders), "utf8");
await fs.writeFile(path.join(API_DIR, "image-index.json"), stableJson({
  schemaVersion: 1,
  note: "Remote source URLs are preserved for archival planning. ShadowBattle runtime must not require these URLs.",
  cards: imageIndex
}), "utf8");

const manifest = {
  schemaVersion: 1,
  gameId: "shadowverse-ccg",
  dataNamespace: "sv1",
  available: true,
  archival: true,
  runtimeSource: "local",
  sourceEndpoint: SOURCE,
  fetchedAt,
  cardCount: englishCards.length,
  cardsSha256: sha256(cardsText),
  languages: localeSummary,
  counts: {
    clan: countBy(englishCards, "clan"),
    cardSet: countBy(englishCards, "card_set_id"),
    cardType: countBy(englishCards, "char_type"),
    rarity: countBy(englishCards, "rarity")
  },
  files: {
    cards: "./cards.json",
    dataHeaders: "./data-headers.json",
    imageIndex: "./image-index.json",
    locales: Object.fromEntries(LANGUAGES.map(lang => [lang, `./locales/cards.${lang}.json`]))
  }
};
await fs.writeFile(path.join(API_DIR, "manifest.json"), stableJson(manifest), "utf8");

console.log(`Archived ${englishCards.length} Shadowverse CCG cards in ${LANGUAGES.length} languages.`);
