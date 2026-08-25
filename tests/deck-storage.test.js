import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import {
  SHADOWBATTLE_DECK_BACKUP_KEY,
  SHADOWBATTLE_DECK_STORAGE_KEY,
  createDeckRecord,
  emptyDeckLibrary,
  listDecks,
  loadDeckLibrary,
  saveDeckLibrary,
  upsertDeck
} from "../src/decks/storage.js";
import { canAddCard, validateDeckEntries } from "../src/decks/deck-rules.js";

test("deck records remain isolated by game", () => {
  let library = emptyDeckLibrary();
  const ccg = createDeckRecord({ id: "ccg-1", gameId: GAME_IDS.SHADOWVERSE_CCG, name: "Classic", craft: "Forestcraft", entries: [[101, 3]] });
  const cb = createDeckRecord({ id: "cb-1", gameId: GAME_IDS.CHAMPIONS_BATTLE, name: "Switch", craft: "Swordcraft", entries: [[101, 1]] });
  library = upsertDeck(library, ccg);
  library = upsertDeck(library, cb);

  assert.equal(listDecks(library, GAME_IDS.SHADOWVERSE_CCG).length, 1);
  assert.equal(listDecks(library, GAME_IDS.CHAMPIONS_BATTLE).length, 1);
  assert.equal(listDecks(library, GAME_IDS.SHADOWVERSE_CCG)[0].entries[0][1], 3);
  assert.equal(listDecks(library, GAME_IDS.CHAMPIONS_BATTLE)[0].entries[0][1], 1);
});

test("saving keeps the previous valid local deck library as a recovery point", () => {
  const storage = fakeStorage();
  let library = upsertDeck(emptyDeckLibrary(), createDeckRecord({
    id: "test",
    gameId: GAME_IDS.SHADOWVERSE_CCG,
    name: "test",
    craft: "Forestcraft",
    entries: [[1001, 3], [1002, 3]]
  }));
  library = saveDeckLibrary(library, storage);

  const updated = upsertDeck(library, createDeckRecord({
    id: "test",
    gameId: GAME_IDS.SHADOWVERSE_CCG,
    name: "test",
    craft: "Forestcraft",
    entries: [[1001, 3], [1002, 3], [1003, 2]]
  }));
  saveDeckLibrary(updated, storage);

  const backup = JSON.parse(storage.getItem(SHADOWBATTLE_DECK_BACKUP_KEY));
  assert.deepEqual(backup.games[GAME_IDS.SHADOWVERSE_CCG].decks.test.entries, [[1001, 3], [1002, 3]]);
  assert.ok(storage.getItem(SHADOWBATTLE_DECK_STORAGE_KEY));
});

test("a corrupt primary deck value recovers from the local backup", () => {
  const storage = fakeStorage();
  const library = upsertDeck(emptyDeckLibrary(), createDeckRecord({
    id: "recover-me",
    gameId: GAME_IDS.CHAMPIONS_BATTLE,
    name: "Switch deck",
    craft: "Swordcraft",
    entries: [[2001, 3]]
  }));
  storage.setItem(SHADOWBATTLE_DECK_BACKUP_KEY, JSON.stringify(library));
  storage.setItem(SHADOWBATTLE_DECK_STORAGE_KEY, "{broken");

  const recovered = loadDeckLibrary(storage);
  assert.equal(recovered.games[GAME_IDS.CHAMPIONS_BATTLE].decks["recover-me"].entries[0][1], 3);
  assert.doesNotThrow(() => JSON.parse(storage.getItem(SHADOWBATTLE_DECK_STORAGE_KEY)));
});

test("OG and Champion's Battle use 40 cards and max three copies", () => {
  const legal = Array.from({ length: 14 }, (_, index) => [1000 + index, index < 12 ? 3 : 2]);
  const result = validateDeckEntries(GAME_IDS.SHADOWVERSE_CCG, legal);
  assert.equal(result.total, 40);
  assert.equal(result.legal, true);
  assert.equal(canAddCard(GAME_IDS.CHAMPIONS_BATTLE, [[1, 3]], 1, 1), false);
  assert.equal(canAddCard(GAME_IDS.CHAMPIONS_BATTLE, Array.from({ length: 13 }, (_, index) => [index + 1, 3]), 99, 1), true);
  assert.equal(canAddCard(GAME_IDS.CHAMPIONS_BATTLE, [...Array.from({ length: 13 }, (_, index) => [index + 1, 3]), [99, 1]], 100, 1), false);
});

function fakeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}
