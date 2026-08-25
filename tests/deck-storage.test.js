import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { createDeckRecord, emptyDeckLibrary, listDecks, upsertDeck } from "../src/decks/storage.js";
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

test("OG and Champion's Battle use 40 cards and max three copies", () => {
  const legal = Array.from({ length: 14 }, (_, index) => [1000 + index, index < 12 ? 3 : 2]);
  const result = validateDeckEntries(GAME_IDS.SHADOWVERSE_CCG, legal);
  assert.equal(result.total, 40);
  assert.equal(result.legal, true);
  assert.equal(canAddCard(GAME_IDS.CHAMPIONS_BATTLE, [[1, 3]], 1, 1), false);
  assert.equal(canAddCard(GAME_IDS.CHAMPIONS_BATTLE, Array.from({ length: 13 }, (_, index) => [index + 1, 3]), 99, 1), true);
  assert.equal(canAddCard(GAME_IDS.CHAMPIONS_BATTLE, [...Array.from({ length: 13 }, (_, index) => [index + 1, 3]), [99, 1]], 100, 1), false);
});
