import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const hub = await fs.readFile(new URL("index.html", root), "utf8");
const hubCss = await fs.readFile(new URL("src/ui/hub.css", root), "utf8");
const deckPage = await fs.readFile(new URL("decks/index.html", root), "utf8");
const library = await fs.readFile(new URL("library/index.html", root), "utf8");
const libraryJs = await fs.readFile(new URL("src/decks/library-page.js", root), "utf8");

test("landing page is a compact ShadowBattle hub", () => {
  assert.match(hub, /class="hub-hero"/);
  assert.match(hub, /Build\. Test\. Play\./);
  assert.match(hub, /href="\.\/decks\/"/);
  assert.match(hub, /href="\.\/library\/"/);
  assert.match(hub, /5,933 cards/);
  assert.match(hub, /623 base cards/);
  assert.doesNotMatch(hub, /One interactive battle platform/);
  assert.match(hubCss, /--panel:\s*#1c2938/);
});

test("deckbuilder no longer exposes Beyond Decks import as a visible tool", () => {
  assert.doesNotMatch(deckPage, /data-db-tab="import"/);
  assert.match(deckPage, /href="\.\.\/library\/">Deck Library/);
  assert.match(deckPage, /deck-session\.js/);
});

test("dedicated library filters saved SV1 and Champion's Battle decks for event rules", () => {
  assert.match(library, /id="library-game-filter"/);
  assert.match(library, /id="library-craft"/);
  assert.match(library, /id="library-legendary-max"/);
  assert.match(library, /id="library-average-max"/);
  assert.match(library, /id="library-total-max"/);
  assert.match(library, /Event filters/);
  assert.match(libraryJs, /legendary/);
  assert.match(libraryJs, /averageCost/);
  assert.match(libraryJs, /totalCost/);
  assert.match(libraryJs, /Open in deckbuilder/);
  assert.match(libraryJs, /shadowverse-ccg/);
  assert.match(libraryJs, /champions-battle/);
});
