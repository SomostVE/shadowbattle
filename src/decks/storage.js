import { GAME_IDS } from "../core/game-catalog.js";

export const SHADOWBATTLE_DECK_STORAGE_KEY = "shadowbattle:decks:v1";
export const SUPPORTED_DECK_GAMES = Object.freeze([
  GAME_IDS.SHADOWVERSE_CCG,
  GAME_IDS.CHAMPIONS_BATTLE,
  GAME_IDS.WORLDS_BEYOND
]);

function emptyBucket() {
  return { activeDeckId: null, decks: {} };
}

export function emptyDeckLibrary() {
  return {
    schemaVersion: 1,
    games: Object.fromEntries(SUPPORTED_DECK_GAMES.map(gameId => [gameId, emptyBucket()]))
  };
}

export function normalizeEntries(entries) {
  const merged = new Map();
  for (const entry of entries ?? []) {
    const tuple = Array.isArray(entry) ? entry : [entry?.id ?? entry?.cardId, entry?.quantity ?? entry?.count];
    const id = Number(tuple[0]);
    const quantity = Number(tuple[1]);
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(quantity) || quantity <= 0) continue;
    merged.set(id, (merged.get(id) ?? 0) + Math.floor(quantity));
  }
  return [...merged.entries()].sort((a, b) => a[0] - b[0]);
}

export function deckSize(entries) {
  return normalizeEntries(entries).reduce((sum, [, quantity]) => sum + quantity, 0);
}

export function createDeckRecord({
  id,
  gameId,
  name,
  craft = null,
  format = null,
  includeNeutral = true,
  entries = [],
  marks = [],
  source = "shadowbattle",
  savedAt = new Date().toISOString()
}) {
  if (!SUPPORTED_DECK_GAMES.includes(gameId)) throw new Error(`Unsupported deck game: ${gameId}`);
  const cleanName = String(name ?? "Untitled deck").trim() || "Untitled deck";
  const deckId = id ?? `${gameId}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
  return {
    schemaVersion: 1,
    id: String(deckId),
    gameId,
    name: cleanName,
    craft: craft ? String(craft) : null,
    format: format ? String(format) : null,
    includeNeutral: Boolean(includeNeutral),
    entries: normalizeEntries(entries),
    marks: Array.isArray(marks) ? marks : [],
    source,
    savedAt
  };
}

export function normalizeDeckLibrary(value) {
  const library = emptyDeckLibrary();
  for (const gameId of SUPPORTED_DECK_GAMES) {
    const sourceBucket = value?.games?.[gameId];
    if (!sourceBucket || typeof sourceBucket !== "object") continue;
    const bucket = library.games[gameId];
    bucket.activeDeckId = sourceBucket.activeDeckId ? String(sourceBucket.activeDeckId) : null;
    for (const [id, deck] of Object.entries(sourceBucket.decks ?? {})) {
      try {
        const normalized = createDeckRecord({ ...deck, id, gameId });
        bucket.decks[normalized.id] = normalized;
      } catch {
        // Ignore malformed records rather than breaking the full library.
      }
    }
    if (bucket.activeDeckId && !bucket.decks[bucket.activeDeckId]) bucket.activeDeckId = null;
  }
  return library;
}

export function loadDeckLibrary(storage = globalThis.localStorage) {
  if (!storage) return emptyDeckLibrary();
  try {
    const raw = storage.getItem(SHADOWBATTLE_DECK_STORAGE_KEY);
    return raw ? normalizeDeckLibrary(JSON.parse(raw)) : emptyDeckLibrary();
  } catch {
    return emptyDeckLibrary();
  }
}

export function saveDeckLibrary(library, storage = globalThis.localStorage) {
  const normalized = normalizeDeckLibrary(library);
  storage?.setItem?.(SHADOWBATTLE_DECK_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function upsertDeck(library, deck, { makeActive = true } = {}) {
  const normalizedLibrary = normalizeDeckLibrary(library);
  const normalizedDeck = createDeckRecord(deck);
  const bucket = normalizedLibrary.games[normalizedDeck.gameId];
  bucket.decks[normalizedDeck.id] = normalizedDeck;
  if (makeActive) bucket.activeDeckId = normalizedDeck.id;
  return normalizedLibrary;
}

export function deleteDeck(library, gameId, deckId) {
  const normalizedLibrary = normalizeDeckLibrary(library);
  const bucket = normalizedLibrary.games[gameId];
  if (!bucket) return normalizedLibrary;
  delete bucket.decks[deckId];
  if (bucket.activeDeckId === deckId) bucket.activeDeckId = null;
  return normalizedLibrary;
}

export function listDecks(library, gameId = null) {
  const normalizedLibrary = normalizeDeckLibrary(library);
  const gameIds = gameId ? [gameId] : SUPPORTED_DECK_GAMES;
  return gameIds.flatMap(id => Object.values(normalizedLibrary.games[id]?.decks ?? {}))
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}
