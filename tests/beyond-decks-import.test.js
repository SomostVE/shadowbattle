import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { importBeyondDeckExport, importBeyondDecksWorkspace } from "../src/decks/import-beyond-decks.js";

test("Beyond Decks v2 export maps to a Worlds Beyond ShadowBattle deck", () => {
  const deck = importBeyondDeckExport({
    version: 2,
    exportedAt: "2026-08-25T00:00:00.000Z",
    class: "Forestcraft",
    format: "Rotation",
    includeNeutral: true,
    deck: [[101, 3], [202, 2]],
    marks: [[101, "core"]]
  }, { name: "Imported" });

  assert.equal(deck.gameId, GAME_IDS.WORLDS_BEYOND);
  assert.equal(deck.name, "Imported");
  assert.equal(deck.craft, "Forestcraft");
  assert.equal(deck.format, "Rotation");
  assert.deepEqual(deck.entries, [[101, 3], [202, 2]]);
  assert.equal(deck.source, "beyond-decks-export-v2");
});

test("Beyond Decks local workspace imports current deck and saved variants", () => {
  const decks = importBeyondDecksWorkspace({
    deck: [[1, 3]],
    deckMarks: [[1, "keep"]],
    preferences: {
      selectedClass: "Runecraft",
      includeNeutral: false,
      format: "Unlimited"
    },
    savedDecks: {
      Combo: {
        name: "Combo",
        savedAt: "2026-08-20T00:00:00.000Z",
        class: "Runecraft",
        includeNeutral: true,
        deck: [[2, 3], [3, 3]],
        marks: []
      },
      Control: {
        deck: [[4, 2]]
      }
    }
  });

  assert.equal(decks.length, 3);
  assert.deepEqual(decks.map(deck => deck.gameId), [GAME_IDS.WORLDS_BEYOND, GAME_IDS.WORLDS_BEYOND, GAME_IDS.WORLDS_BEYOND]);
  assert.equal(decks[0].name, "Beyond Decks · Current");
  assert.equal(decks[1].name, "Combo");
  assert.equal(decks[2].name, "Control");
  assert.equal(decks[2].craft, "Runecraft");
});
