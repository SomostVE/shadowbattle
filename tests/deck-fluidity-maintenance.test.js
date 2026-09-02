import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const gridJs = await fs.readFile(new URL("../src/decks/card-grid.js", import.meta.url), "utf8");
const catalogJs = await fs.readFile(new URL("../src/decks/catalog.js", import.meta.url), "utf8");
const assistantPageJs = await fs.readFile(new URL("../src/decks/deck-assistant-page.js", import.meta.url), "utf8");
const sessionJs = await fs.readFile(new URL("../src/decks/deck-session.js", import.meta.url), "utf8");

test("deck grid avoids duplicate pool filtering and nested quantity lookups", () => {
  assert.match(gridJs, /const visibleCards = Array\.isArray\(cards\) \? cards : \[\]/);
  assert.match(gridJs, /function updateTileQuantity\(tile, quantity\)/);
  assert.match(gridJs, /updateTileQuantity\(tile, entries\.get\(id\) \?\? 0\)/);
  assert.doesNotMatch(gridJs, /const visibleCards = poolMode ===/);
  assert.doesNotMatch(gridJs, /syncCardQuantities[\s\S]{0,300}updateCardTile\(root/);
});

test("deck search and assistant filtering reuse normalized work", () => {
  assert.match(catalogJs, /const searchTextCache = new WeakMap\(\)/);
  assert.match(catalogJs, /export function catalogSearchText/);
  assert.match(assistantPageJs, /catalogSearchText\(card\)\.includes\(needle\)/);
  assert.match(assistantPageJs, /function summarizeAssistantCards\(cards\)/);
  assert.doesNotMatch(assistantPageJs, /baseCardsForAssistant\(\)\.filter/);
});

test("batched grid mutations reuse assistant visibility and deck restore waits on renders", () => {
  assert.match(assistantPageJs, /applyAssistantVisibility\(addedTiles, false\)/);
  assert.match(sessionJs, /results\.dataset\.renderId/);
  assert.match(sessionJs, /waitForGridRender/);
  assert.doesNotMatch(sessionJs, /await wait\(120\)/);
  assert.doesNotMatch(sessionJs, /await wait\(100\)/);
});
