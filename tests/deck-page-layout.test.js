import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const html = await fs.readFile(new URL("../decks/index.html", import.meta.url), "utf8");
const pageJs = await fs.readFile(new URL("../src/decks/deckbuilder-page.js", import.meta.url), "utf8");
const enhancementsJs = await fs.readFile(new URL("../src/ui/deck-ui-enhancements.js", import.meta.url), "utf8");

test("deckbuilder exposes OG and Champion's Battle editors", () => {
  assert.match(html, /value="shadowverse-ccg"/);
  assert.match(html, /value="champions-battle"/);
  assert.match(html, /id="deck-game-switch"/);
  assert.match(html, /id="deck-craft-buttons"/);
  assert.match(html, /id="save-deck"/);
  assert.match(html, /id="saved-decks"/);
});

test("deckbuilder mirrors the Beyond Decks card-first working layout", () => {
  assert.match(html, /class="db-app-shell"/);
  assert.match(html, /class="db-deck-panel"/);
  assert.match(html, /id="deck-rarity-filter"/);
  assert.match(html, /id="deck-cost-filter"/);
  assert.match(html, /id="deck-type-filter"/);
  assert.match(html, /id="filters-drawer-toggle"/);
  assert.match(html, /id="deck-card-size"/);
  assert.match(html, /id="deck-cost-strip"/);
  assert.match(html, /id="card-preview-dialog"/);
  assert.match(html, /id="card-preview-normal"/);
  assert.match(html, /id="card-preview-evolved"/);
});

test("deckbuilder uses the Beyond Decks adaptive card sizing model", () => {
  assert.match(html, /min="74" max="190"/);
  assert.match(html, /data-card-size-preset="90">S/);
  assert.match(html, /data-card-size-preset="118">M/);
  assert.match(html, /data-card-size-preset="154">L/);
  assert.match(enhancementsJs, /const target = 156/);
  assert.match(enhancementsJs, /Math\.round\(usable \/ target\)/);
  assert.match(enhancementsJs, /svwb-card-size-mode/);
});

test("deckbuilder exposes both Beyond Decks import paths", () => {
  assert.match(html, /id="import-beyond-local"/);
  assert.match(html, /id="beyond-import-json"/);
  assert.match(html, /id="import-beyond-file"/);
  assert.match(html, /shadowverse-deck-assistant:v2/);
});

test("deckbuilder resolves normal and evolved Shadowverse card art", () => {
  assert.match(pageJs, /phase2\/common\/C\/C_\$\{id\}\.png/);
  assert.match(pageJs, /phase2\/sp\/common\/E\/E_\$\{id\}\.png/);
  assert.match(pageJs, /card\.uid/);
});
