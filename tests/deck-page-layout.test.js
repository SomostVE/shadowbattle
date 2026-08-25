import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const html = await fs.readFile(new URL("../decks/index.html", import.meta.url), "utf8");
const pageJs = await fs.readFile(new URL("../src/decks/deckbuilder-page.js", import.meta.url), "utf8");
const gridJs = await fs.readFile(new URL("../src/decks/card-grid.js", import.meta.url), "utf8");
const catalogJs = await fs.readFile(new URL("../src/decks/catalog.js", import.meta.url), "utf8");
const assistantJs = await fs.readFile(new URL("../src/decks/card-assistant.js", import.meta.url), "utf8");
const assistantPageJs = await fs.readFile(new URL("../src/decks/deck-assistant-page.js", import.meta.url), "utf8");
const enhancementsJs = await fs.readFile(new URL("../src/ui/deck-ui-enhancements.js", import.meta.url), "utf8");
const enhancementsCss = await fs.readFile(new URL("../src/ui/deck-enhancements.css", import.meta.url), "utf8");
const polishJs = await fs.readFile(new URL("../src/ui/deck-polish.js", import.meta.url), "utf8");
const beyondTheme = await fs.readFile(new URL("../src/ui/beyond-decks-v2.css", import.meta.url), "utf8");
const assistantCss = await fs.readFile(new URL("../src/ui/deck-assistant.css", import.meta.url), "utf8");

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

test("deckbuilder uses the Beyond Decks modern UI v2 palette", () => {
  assert.match(html, /beyond-decks-v2\.css/);
  assert.match(beyondTheme, /--bg:\s*#141d28/);
  assert.match(beyondTheme, /--panel:\s*#1c2938/);
  assert.match(beyondTheme, /--panel-2:\s*#263648/);
  assert.match(beyondTheme, /--accent:\s*#72b8ff/);
  assert.match(beyondTheme, /select option/);
  assert.match(beyondTheme, /color-scheme:\s*dark/);
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

test("class switching follows the Beyond Decks seamless renderer pattern", () => {
  assert.match(pageJs, /buildCraftPools/);
  assert.match(pageJs, /syncCraftButtons/);
  assert.match(pageJs, /saveClassScroll/);
  assert.match(pageJs, /restoreClassScroll/);
  assert.match(pageJs, /renderCardGrid/);
  assert.match(pageJs, /updateCardTile/);
  assert.match(gridJs, /requestIdleCallback/);
  assert.match(gridJs, /batchSize/);
  assert.match(gridJs, /root\.dataset\.renderId/);
});

test("Neutral cards are a separate selectable pool", () => {
  assert.match(enhancementsJs, /Neutral:\s*0/);
  assert.match(enhancementsJs, /data-neutral-toggle/);
  assert.match(enhancementsJs, /shadowbattle:card-pool-mode/);
  assert.match(catalogJs, /poolMode === "neutral"/);
  assert.match(catalogJs, /card\.craft !== "Neutral"/);
});

test("deck assistant exposes trait and keyword deck filters", () => {
  assert.match(html, /id="deck-trait-filter"/);
  assert.match(html, /id="deck-keyword-filter"/);
  assert.match(html, /deck-assistant\.css/);
  assert.match(html, /deck-assistant-page\.js/);
  assert.match(assistantPageJs, /cardTraits/);
  assert.match(assistantPageJs, /cardKeywords/);
  assert.match(assistantPageJs, /selectedTraits/);
  assert.match(assistantPageJs, /selectedKeywords/);
  assert.match(assistantCss, /db-assistant-filter-chip/);
  assert.doesNotMatch(html, />Card assistant</);
});

test("deck assistant hovers cards and resolves generated cards plus their sources locally", () => {
  assert.match(assistantJs, /PREVIEW_DELAY/);
  assert.match(assistantJs, /Generated \/ summoned/);
  assert.match(assistantJs, /Sources/);
  assert.match(assistantJs, /buildRelations/);
  assert.match(assistantJs, /extractReferences/);
  assert.match(catalogJs, /loadDeckReferenceCards/);
  assert.match(catalogJs, /api\/v1\/shadowverse-ccg\/cards\.json|shadowverse-ccg\/cards\.json/);
  assert.match(catalogJs, /deckSelectable:\s*false/);
});

test("hover preview reuses loaded card art and keeps Portal fallbacks", () => {
  assert.match(assistantJs, /visibleGridArt/);
  assert.match(assistantJs, /phase2\/common\/C\/C_\$\{id\}\.png/);
  assert.match(assistantJs, /phase2\/sp\/common\/E\/E_\$\{id\}\.png/);
  assert.match(assistantJs, /setAssistantArt/);
});

test("native add tooltip and expected deck-cap toasts are suppressed", () => {
  assert.doesNotMatch(gridJs, /click to add/i);
  assert.match(html, /deck-polish\.js/);
  assert.match(polishJs, /is-capped/);
  assert.match(polishJs, /total < 40/);
  assert.match(polishJs, /stopImmediatePropagation/);
});

test("save action lives inside the Saved deck variants panel", () => {
  assert.match(html, /data-db-panel="saved"[\s\S]*Deck variants[\s\S]*id="deck-name"[\s\S]*id="save-deck"/);
  assert.doesNotMatch(html, /db-header-actions[\s\S]{0,600}id="save-deck"/);
  assert.match(enhancementsCss, /db-saved-compose/);
  assert.match(enhancementsCss, /db-tabs-two/);
});

test("Beyond Decks import is not exposed in the deckbuilder UI", () => {
  assert.doesNotMatch(html, /data-db-tab="import"/);
  assert.match(html, /href="\.\.\/library\/">Deck Library/);
});

test("deckbuilder resolves normal and evolved Shadowverse card art", () => {
  assert.match(pageJs, /phase2\/common\/C\/C_\$\{id\}\.png/);
  assert.match(pageJs, /phase2\/sp\/common\/E\/E_\$\{id\}\.png/);
  assert.match(pageJs, /card\.uid/);
});
