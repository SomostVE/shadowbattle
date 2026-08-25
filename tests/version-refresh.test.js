import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await fs.readFile(new URL("package.json", root), "utf8"));
const versionJson = JSON.parse(await fs.readFile(new URL("version.json", root), "utf8"));
const versionGuard = await fs.readFile(new URL("src/ui/version-guard.js", root), "utf8");
const serviceWorker = await fs.readFile(new URL("sw.js", root), "utf8");
const deckEnhancements = await fs.readFile(new URL("src/ui/deck-ui-enhancements.js", root), "utf8");
const deckHtml = await fs.readFile(new URL("decks/index.html", root), "utf8");
const deckSession = await fs.readFile(new URL("src/decks/deck-session.js", root), "utf8");

const pageHtml = await Promise.all([
  "index.html",
  "api/index.html",
  "test/index.html",
  "decks/index.html",
  "library/index.html"
].map(async path => [path, await fs.readFile(new URL(path, root), "utf8")]));

const escapedVersion = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("package and public version manifest stay in sync", () => {
  assert.equal(versionJson.version, packageJson.version);
});

test("all main pages load the automatic version guard", () => {
  const guardPattern = new RegExp(`version-guard\\.js\\?v=${escapedVersion}`);
  for (const [path, html] of pageHtml) assert.match(html, guardPattern, path);
  assert.match(versionGuard, /cache:\s*"no-store"/);
  assert.match(versionGuard, /location\.replace/);
  assert.match(versionGuard, /serviceWorker\.register/);
  assert.match(versionGuard, /visibilitychange/);
});

test("version refresh snapshots deck data and never changes the deck storage namespace", () => {
  assert.match(versionGuard, /shadowbattle:decks:v1/);
  assert.match(versionGuard, /shadowbattle:decks:backup:v1/);
  assert.match(versionGuard, /snapshotDeckData/);
  assert.doesNotMatch(versionGuard, /removeItem\(DECK_KEY\)/);
  assert.match(deckSession, /shadowbattle:deck-drafts:v1/);
  assert.match(deckSession, /activeDeckId/);
  assert.match(deckSession, /loadSavedDeck/);
});

test("service worker rotates versioned same-origin caches", () => {
  assert.match(serviceWorker, /shadowbattle-app-/);
  assert.match(serviceWorker, /skipWaiting/);
  assert.match(serviceWorker, /clients\.claim/);
  assert.match(serviceWorker, /networkFirst/);
  assert.match(serviceWorker, /cacheFirst/);
});

test("deck page uses official Portal class assets and staged card art loading", () => {
  assert.match(deckHtml, /preconnect[^>]+shadowverse-portal\.com/);
  assert.match(deckHtml, new RegExp(`deck-ui-enhancements\\.js\\?v=${escapedVersion}`));
  assert.match(deckEnhancements, /class_checkbox\.png/);
  assert.match(deckEnhancements, /Forestcraft:\s*1/);
  assert.match(deckEnhancements, /Portalcraft:\s*8/);
  assert.match(deckEnhancements, /IntersectionObserver/);
  assert.match(deckEnhancements, /data-card-art/);
  assert.match(deckEnhancements, /deferredSrc/);
});
