import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const html = await fs.readFile(new URL("../decks/index.html", import.meta.url), "utf8");
const pageJs = await fs.readFile(new URL("../src/decks/deckbuilder-page.js", import.meta.url), "utf8");

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

test("deckbuilder exposes a card-first deck sidebar and art preview", () => {
  assert.match(html, /class="db-app-shell"/);
  assert.match(html, /class="db-deck-panel"/);
  assert.match(html, /id="card-preview-dialog"/);
  assert.match(html, /id="card-preview-normal"/);
  assert.match(html, /id="card-preview-evolved"/);
});

test("deckbuilder resolves normal and evolved Shadowverse card art", () => {
  assert.match(pageJs, /phase2\/common\/C\/C_\$\{id\}\.png/);
  assert.match(pageJs, /phase2\/sp\/common\/E\/E_\$\{id\}\.png/);
  assert.match(pageJs, /card\.uid/);
});
