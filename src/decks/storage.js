import { GAME_IDS } from "../core/game-catalog.js";

export const SHADOWBATTLE_DECK_STORAGE_KEY = "shadowbattle:decks:v1";
export const SHADOWBATTLE_DECK_BACKUP_KEY = "shadowbattle:decks:backup:v1";
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
    const quantity = Math.floor(Number(tuple[1]));
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(quantity) || quantity <= 0) continue;
    merged.set(id, (merged.get(id) ?? 0) + quantity);
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
        // A malformed individual record must never make the rest of the user's
        // local library unreadable.
      }
    }
    if (bucket.activeDeckId && !bucket.decks[bucket.activeDeckId]) bucket.activeDeckId = null;
  }
  return library;
}

function parseLibrary(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!isLibraryPayload(value)) return null;
    return normalizeDeckLibrary(value);
  } catch {
    return null;
  }
}

function isLibraryPayload(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.schemaVersion === 1 &&
    value.games &&
    typeof value.games === "object" &&
    !Array.isArray(value.games)
  );
}

function readStorage(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadDeckLibrary(storage = globalThis.localStorage) {
  if (!storage) return emptyDeckLibrary();

  const primaryRaw = readStorage(storage, SHADOWBATTLE_DECK_STORAGE_KEY);
  const primary = parseLibrary(primaryRaw);
  if (primary) return primary;

  // Recover only when the primary value is absent/corrupt. App version bumps
  // never intentionally clear or replace the user's deck storage key.
  const backupRaw = readStorage(storage, SHADOWBATTLE_DECK_BACKUP_KEY);
  const backup = parseLibrary(backupRaw);
  if (backup) {
    writeStorage(storage, SHADOWBATTLE_DECK_STORAGE_KEY, JSON.stringify(backup));
    return backup;
  }

  return emptyDeckLibrary();
}

export function saveDeckLibrary(library, storage = globalThis.localStorage) {
  const normalized = normalizeDeckLibrary(library);
  if (!storage?.setItem) return normalized;

  // Keep the last valid library as a recovery point before replacing the
  // primary value. This is deliberately independent from ShadowBattle version.
  const previous = readStorage(storage, SHADOWBATTLE_DECK_STORAGE_KEY);
  if (parseLibrary(previous)) writeStorage(storage, SHADOWBATTLE_DECK_BACKUP_KEY, previous);
  writeStorage(storage, SHADOWBATTLE_DECK_STORAGE_KEY, JSON.stringify(normalized));
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
