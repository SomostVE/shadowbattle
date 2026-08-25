import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const hub = await fs.readFile(new URL("index.html", root), "utf8");
const hubCss = await fs.readFile(new URL("src/ui/hub.css", root), "utf8");
const hubJs = await fs.readFile(new URL("src/ui/hub.js", root), "utf8");
const deckPage = await fs.readFile(new URL("decks/index.html", root), "utf8");
const library = await fs.readFile(new URL("library/index.html", root), "utf8");
const apiPage = await fs.readFile(new URL("api/index.html", root), "utf8");
const testPage = await fs.readFile(new URL("test/index.html", root), "utf8");
const libraryJs = await fs.readFile(new URL("src/decks/library-page.js", root), "utf8");

test("landing page is a compact game-first ShadowBattle hub", () => {
  assert.match(hub, /<body class="hub-page">/);
  assert.match(hub, /id="battle" class="hub-stage"/);
  assert.match(hub, /Human vs AI/);
  assert.match(hub, /Play Shadowverse as a real match/);
  assert.match(hub, /Choose a ruleset/);
  assert.ok(hub.indexOf("hub-battle-card") < hub.indexOf("hub-prep-grid"));
  assert.match(hub, /href="\.\/decks\/"/);
  assert.match(hub, /href="\.\/library\/"/);
  assert.match(hub, /5,933 archived cards/);
  assert.match(hub, /623-card base pool/);
  assert.doesNotMatch(hub, /href="\.\/test\/"/);
  assert.doesNotMatch(hub, /AI Test Lab/);
  assert.match(hubCss, /\.hub-page\s*\{\s*overflow:\s*hidden/);
  assert.match(hubCss, /height:\s*100dvh/);
  assert.match(hubCss, /--panel:\s*#1c2938/);
});

test("hub rotates official fan-kit backgrounds and is ready for Worlds Beyond assets", () => {
  assert.match(hubJs, /background_Castle\.png/);
  assert.match(hubJs, /background_Lake_Night\.png/);
  assert.match(hubJs, /readWorldsBeyondBackgrounds/);
  assert.match(hubJs, /worlds-beyond\/manifest\.json/);
  assert.match(hubJs, /Math\.random/);
  assert.match(hub, /© Cygames, Inc\./);
});

test("AI test lab is internal and absent from public navigation", () => {
  for (const html of [hub, deckPage, library, apiPage]) {
    assert.doesNotMatch(html, /href="(?:\.\.\/|\.\/)test\/"/);
    assert.doesNotMatch(html, />AI Test(?: Lab)?</);
  }
  assert.match(testPage, /noindex,nofollow,noarchive/);
  assert.match(testPage, /Internal AI Test Lab/);
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
