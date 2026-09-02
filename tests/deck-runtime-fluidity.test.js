import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const gridJs = await fs.readFile(new URL("../src/decks/card-grid.js", import.meta.url), "utf8");
const sessionJs = await fs.readFile(new URL("../src/decks/deck-session.js", import.meta.url), "utf8");
const enhancementsJs = await fs.readFile(new URL("../src/ui/deck-ui-enhancements.js", import.meta.url), "utf8");
const polishJs = await fs.readFile(new URL("../src/ui/deck-polish.js", import.meta.url), "utf8");

test("card grid reuses one template and already-ordered card records across batches", () => {
  assert.match(gridJs, /let cursor = 0;\s*const template = document\.createElement\("template"\)/);
  assert.match(gridJs, /handlers\.setImageArt\?\.\(image, visibleCards\[cardIndex\], false\)/);
  assert.doesNotMatch(gridJs, /handlers\.getCardById/);
});

test("deck craft enhancements process added nodes instead of rescanning the whole root", () => {
  assert.match(enhancementsJs, /function installCraftControls\(\)/);
  assert.match(enhancementsJs, /for \(const node of mutation\.addedNodes\) upgradeAddedNode\(node\)/);
  assert.match(enhancementsJs, /observe\(root, \{ childList: true \}\)/);
  assert.doesNotMatch(enhancementsJs, /new MutationObserver\(renderIcons\)/);
});

test("fallback card-art hints and fit sizing coalesce repeated layout work", () => {
  assert.match(enhancementsJs, /for \(const node of mutation\.addedNodes\) applyNode\(node\)/);
  assert.match(enhancementsJs, /const scheduleFit = \(\) =>/);
  assert.match(enhancementsJs, /if \(fitFrame \|\| localStorage\.getItem\(CARD_SIZE_MODE_KEY\) !== "fit"\) return/);
  assert.doesNotMatch(enhancementsJs, /const apply = \(\) => root\.querySelectorAll/);
});

test("deck polish and draft persistence observe only top-level replacement work", () => {
  assert.match(polishJs, /for \(const node of mutation\.addedNodes\) inspectAddedNode\(node\)/);
  assert.match(polishJs, /observe\(saved, \{ childList: true \}\)/);
  assert.doesNotMatch(polishJs, /subtree:\s*true/);
  assert.match(sessionJs, /new MutationObserver\(queuePersist\)\.observe\(currentDeck, \{ childList: true \}\)/);
  assert.doesNotMatch(sessionJs, /characterData:\s*true/);
  assert.doesNotMatch(sessionJs, /subtree:\s*true/);
});
