import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const html = await fs.readFile(new URL("../decks/index.html", import.meta.url), "utf8");

test("deckbuilder exposes OG and Champion's Battle editors", () => {
  assert.match(html, /value="shadowverse-ccg"/);
  assert.match(html, /value="champions-battle"/);
  assert.match(html, /id="save-deck"/);
  assert.match(html, /id="saved-decks"/);
});

test("deckbuilder exposes both Beyond Decks import paths", () => {
  assert.match(html, /id="import-beyond-local"/);
  assert.match(html, /id="beyond-import-json"/);
  assert.match(html, /id="import-beyond-file"/);
  assert.match(html, /shadowverse-deck-assistant:v2/);
});
