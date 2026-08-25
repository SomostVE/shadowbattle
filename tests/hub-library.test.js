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
const wbFanKit = JSON.parse(await fs.readFile(new URL("assets/fankits/worlds-beyond/manifest.json", root), "utf8"));
const deckPage = await fs.readFile(new URL("decks/index.html", root), "utf8");
const library = await fs.readFile(new URL("library/index.html", root), "utf8");
const apiPage = await fs.readFile(new URL("api/index.html", root), "utf8");
const testPage = await fs.readFile(new URL("test/index.html", root), "utf8");
const libraryJs = await fs.readFile(new URL("src/decks/library-page.js", root), "utf8");

test("landing page is a compact game-first ShadowBattle hub", () => {
  assert.match(hub, /<body class="hub-page">/);
  assert.match(hub, /id="battle" class="hub-stage"/);
  assert.match(hub, /Human vs CPU/);
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
  assert.match(hub, /<small>CPU decks<\/small>/);
  assert.match(hub, /<small>Your decks<\/small>/);
  assert.match(hub, /CPU difficulty/);
  assert.match(hub, /data-cpu-difficulty="intermediate"/);
  assert.match(hub, /data-cpu-difficulty="expert"/);
  assert.doesNotMatch(hub, /\bAI\b/);
  assert.match(hub, /id="hub-sv1-card-count">5,933/);
  assert.match(hub, /id="hub-cb-card-count">623/);
  assert.match(hub, /id="hub-wb-card-count">826/);
  assert.match(hub, /id="hub-sv1-player-count"/);
  assert.match(hub, /id="hub-cb-player-count"/);
  assert.match(hub, /id="hub-wb-player-count"/);
  assert.match(hubBeyondCss, /grid-template-rows:\s*auto repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(hubBeyondCss, /grid-template-columns:\s*minmax\(0, 1\.68fr\) minmax\(430px, \.82fr\)/);
  assert.doesNotMatch(hub, /hub-topbar|hub-nav/);
  assert.doesNotMatch(hub, /href="\.\/test\/"/);
  assert.doesNotMatch(hub, /AI Test Lab/);
  assert.match(hubCss, /\.hub-page\s*\{\s*overflow:\s*hidden/);
  assert.match(hubCss, /height:\s*100dvh/);
  assert.match(hubCss, /--panel:\s*#1c2938/);
  assert.match(hubCss, /--panel-2:\s*#263648/);
  assert.match(hubCss, /--accent:\s*#72b8ff/);
});

test("landing page exposes the official fan-kit background behind lighter glass panels", () => {
  assert.match(hubBeyondCss, /body\.hub-page::before\s*\{[\s\S]*?z-index:\s*0/);
  assert.match(hubBeyondCss, /body\.hub-page::after\s*\{[\s\S]*?z-index:\s*1/);
  assert.match(hubBeyondCss, /\.hub-page \.hub-shell\s*\{[\s\S]*?z-index:\s*2/);
  assert.match(hubBeyondCss, /rgba\(35,50,70,\.43\)/);
  assert.match(hubBeyondCss, /backdrop-filter:\s*blur\(2\.2px\)/);
});

test("hub rotates archived CCG and Worlds Beyond Fan Kit backgrounds", async () => {
  assert.match(hubJs, /background_Castle\.png/);
  assert.match(hubJs, /background_Lake_Night\.png/);
  assert.match(hubJs, /background_Morning_Star\.png/);
  assert.match(hubJs, /background_Track_Night\.png/);
  assert.match(hubJs, /readWorldsBeyondBackgrounds/);
  assert.match(hubJs, /assets\/fankits\/worlds-beyond\//);
  assert.match(hubJs, /new URL\("manifest\.json", root\)/);
  assert.match(hubJs, /Math\.random/);
  assert.match(hub, /© Cygames, Inc\./);

  assert.equal(wbFanKit.status, "archived");
  assert.equal(wbFanKit.source, "official-cygames-fankit");
  assert.equal(wbFanKit.backgrounds.length, 9);
  assert.equal(wbFanKit.logo, "./logo_ShadowverseWB.png");
  assert.match(hub, /assets\/fankits\/worlds-beyond\/logo_ShadowverseWB\.png/);

  for (const entry of wbFanKit.files) {
    assert.ok(entry.bytes > 100_000, `${entry.file} should be a real archived asset`);
    assert.match(entry.sourceUrl, /shadowverse-wb\.com\/uploads\/fankit\//);
    const file = new URL(`assets/fankits/worlds-beyond/${entry.file.replace(/^\.\//, "")}`, root);
    const bytes = await fs.readFile(file);
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
});

test("Beyond Decks CPU reference pool is vendored under the svwb namespace", () => {
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

test("Worlds Beyond ruleset and CPU difficulty are selectable and persisted", () => {
  assert.match(hub, /class="hub-game active" type="button" data-game="worlds-beyond"/);
  assert.doesNotMatch(hub, /hub-game muted[^>]*data-game="worlds-beyond"/);
  assert.match(hubJs, /RULESET_KEY/);
  assert.match(hubJs, /CPU_DIFFICULTY_KEY/);
  assert.match(hubJs, /selectRuleset/);
  assert.match(hubJs, /selectCpuDifficulty/);
  assert.match(hubJs, /worlds-beyond/);
  assert.match(hubBeyondCss, /cursor:\s*pointer/);
});

test("hub has a dedicated stacked mobile layout", () => {
  assert.match(hubBeyondCss, /@media \(max-width: 980px\)/);
  assert.match(hubBeyondCss, /overflow-y:\s*auto/);
  assert.match(hubBeyondCss, /grid-template-columns:\s*1fr/);
  assert.match(hubBeyondCss, /@media \(max-width: 420px\)/);
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
