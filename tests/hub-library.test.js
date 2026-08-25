import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const hub = await fs.readFile(new URL("index.html", root), "utf8");
const hubCss = await fs.readFile(new URL("src/ui/hub.css", root), "utf8");
const hubBeyondCss = await fs.readFile(new URL("src/ui/hub-beyond.css", root), "utf8");
const hubJs = await fs.readFile(new URL("src/ui/hub.js", root), "utf8");
const referenceDeckLoader = await fs.readFile(new URL("src/ai/reference-decks.js", root), "utf8");
const botDecks = JSON.parse(await fs.readFile(new URL("api/v1/worlds-beyond/bot-decks.json", root), "utf8"));
const deckPage = await fs.readFile(new URL("decks/index.html", root), "utf8");
const library = await fs.readFile(new URL("library/index.html", root), "utf8");
const apiPage = await fs.readFile(new URL("api/index.html", root), "utf8");
const testPage = await fs.readFile(new URL("test/index.html", root), "utf8");
const libraryJs = await fs.readFile(new URL("src/decks/library-page.js", root), "utf8");

test("landing page is a compact game-first ShadowBattle hub", () => {
  assert.match(hub, /<body class="hub-page">/);
  assert.match(hub, /id="battle" class="hub-stage"/);
  assert.match(hub, /Human vs AI/);
  assert.match(hub, /Mulligan, play every action yourself/);
  assert.match(hub, /Choose a ruleset/);
  assert.ok(hub.indexOf("hub-battle-card") < hub.indexOf("hub-tools"));
  assert.match(hub, /href="\.\/decks\/"/);
  assert.match(hub, /href="\.\/library\/"/);
  assert.match(hub, /class="hub-game-logo"/);
  assert.match(hub, /alt="Shadowverse"/);
  assert.match(hub, /alt="Shadowverse: Champion's Battle"/);
  assert.match(hub, /alt="Shadowverse: Worlds Beyond"/);
  assert.match(hub, /<small>Cards<\/small>/);
  assert.match(hub, /<small>AI decks<\/small>/);
  assert.match(hub, /<small>Your decks<\/small>/);
  assert.match(hub, /id="hub-sv1-card-count">5,933/);
  assert.match(hub, /id="hub-cb-card-count">623/);
  assert.match(hub, /id="hub-wb-card-count">826/);
  assert.match(hub, /id="hub-sv1-player-count"/);
  assert.match(hub, /id="hub-cb-player-count"/);
  assert.match(hub, /id="hub-wb-player-count"/);
  assert.match(hubBeyondCss, /grid-template-rows:\s*auto repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(hub, /hub-topbar|hub-nav/);
  assert.doesNotMatch(hub, /href="\.\/test\/"/);
  assert.doesNotMatch(hub, /AI Test Lab/);
  assert.match(hubCss, /\.hub-page\s*\{\s*overflow:\s*hidden/);
  assert.match(hubCss, /height:\s*100dvh/);
  assert.match(hubCss, /--panel:\s*#1c2938/);
  assert.match(hubCss, /--panel-2:\s*#263648/);
  assert.match(hubCss, /--accent:\s*#72b8ff/);
});

test("hub rotates official fan-kit backgrounds and is ready for Worlds Beyond assets", () => {
  assert.match(hubJs, /background_Castle\.png/);
  assert.match(hubJs, /background_Lake_Night\.png/);
  assert.match(hubJs, /readWorldsBeyondBackgrounds/);
  assert.match(hubJs, /worlds-beyond\/manifest\.json/);
  assert.match(hubJs, /Math\.random/);
  assert.match(hub, /© Cygames, Inc\./);
});

test("Beyond Decks AI reference pool is vendored under the svwb namespace", () => {
  assert.equal(botDecks.format, "svwb-reference-decks");
  assert.ok(botDecks.decks.length >= 7);
  assert.equal(botDecks.shadowBattle.namespace, "svwb");
  assert.equal(botDecks.shadowBattle.gameId, "worlds-beyond");
  for (const deck of botDecks.decks) {
    assert.equal(deck.cards.reduce((sum, card) => sum + card.qty, 0), 40, deck.id);
  }
  assert.match(referenceDeckLoader, /worlds-beyond/);
  assert.match(referenceDeckLoader, /namespace:\s*"svwb"/);
  assert.match(referenceDeckLoader, /qualifiedId:\s*`\$\{namespace\}:\$\{card\.cardId\}`/);
  assert.match(hub, /id="hub-wb-bot-count">7/);
  assert.match(hubJs, /api\/v1\/worlds-beyond\/bot-decks\.json/);
});

test("ruleset metrics resolve dataset and player-deck counts dynamically", () => {
  assert.match(hubJs, /renderDeckCounts/);
  assert.match(hubJs, /shadowverse-ccg/);
  assert.match(hubJs, /champions-battle/);
  assert.match(hubJs, /worlds-beyond/);
  assert.match(hubJs, /shadowverse-ccg\/manifest\.json/);
  assert.match(hubJs, /champions-battle\/manifest\.json/);
  assert.match(hubJs, /beyond_codex\/api\/v1\/manifest\.json/);
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
