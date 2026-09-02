import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const libraryPage = await fs.readFile(new URL("src/decks/library-page.js", root), "utf8");
const localProvider = await fs.readFile(new URL("src/data/providers/local-card-provider.js", root), "utf8");
const ccgProvider = await fs.readFile(new URL("src/data/providers/shadowverse-ccg.js", root), "utf8");
const cbProvider = await fs.readFile(new URL("src/data/providers/champions-battle.js", root), "utf8");

test("deck library coalesces search renders and delegates artwork fallback", () => {
  assert.match(libraryPage, /els\.search\.addEventListener\("input", scheduleRender\)/);
  assert.match(libraryPage, /window\.requestAnimationFrame\(/);
  assert.match(libraryPage, /els\.grid\.addEventListener\("error",[\s\S]*?, true\)/);
  assert.doesNotMatch(libraryPage, /hydrateCardArtwork/);
  assert.doesNotMatch(libraryPage, /querySelectorAll\("img\[data-library-art\]"\)/);
});

test("deck library reuses model metadata instead of rebuilding hot-path values", () => {
  assert.match(libraryPage, /for \(const \[id, rawQuantity\] of deck\.entries \?\? \[\]\)/);
  assert.match(libraryPage, /searchName: name\.toLowerCase\(\)/);
  assert.match(libraryPage, /savedAtKey: String\(deck\.savedAt \?\? ""\)/);
  assert.match(libraryPage, /const DATE_FORMATTER = new Intl\.DateTimeFormat/);
  assert.match(libraryPage, /const VIAL_FORMATTER = new Intl\.NumberFormat/);
});

test("local card providers share one normalized loader", () => {
  assert.match(localProvider, /export function createLocalCardProvider/);
  assert.match(localProvider, /normalizeShadowBattleCard/);
  assert.match(ccgProvider, /createLocalCardProvider\(\{/);
  assert.match(cbProvider, /createLocalCardProvider\(\{/);
  assert.doesNotMatch(ccgProvider, /async loadCards/);
  assert.doesNotMatch(cbProvider, /async loadCards/);
});
