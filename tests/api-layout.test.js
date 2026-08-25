import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function readJson(path) {
  return JSON.parse(await fs.readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}

test("API v1 exposes three isolated game namespaces", async () => {
  const manifest = await readJson("api/v1/manifest.json");
  const catalog = await readJson("api/v1/games.json");
  assert.deepEqual(manifest.namespaces, ["svwb", "sv1", "svcb"]);
  assert.equal(new Set(catalog.games.map(game => game.namespace)).size, 3);
  assert.equal(manifest.rules.crossGameImplicitMerging, false);
});

test("each game publishes a dedicated API manifest", async () => {
  const games = [
    ["worlds-beyond", "svwb"],
    ["shadowverse-ccg", "sv1"],
    ["champions-battle", "svcb"]
  ];
  for (const [gameId, namespace] of games) {
    const manifest = await readJson(`api/v1/${gameId}/manifest.json`);
    assert.equal(manifest.gameId, gameId);
    assert.equal(manifest.namespace ?? manifest.dataNamespace, namespace);
  }
});

test("original Shadowverse CCG is a complete local archival snapshot", async () => {
  const catalog = await readJson("api/v1/games.json");
  const manifest = await readJson("api/v1/shadowverse-ccg/manifest.json");
  const cards = await readJson("api/v1/shadowverse-ccg/cards.json");
  const game = catalog.games.find(entry => entry.id === "shadowverse-ccg");

  assert.equal(game.status, "archived-local");
  assert.equal(manifest.available, true);
  assert.equal(manifest.archival, true);
  assert.equal(manifest.runtimeSource, "local");
  assert.equal(manifest.cardCount, 5933);
  assert.equal(cards.cardCount, 5933);
  assert.equal(cards.cards.length, 5933);
  assert.deepEqual(Object.keys(manifest.languages), ["en", "ja", "ko", "zh-tw", "fr", "it", "de", "es"]);
});

test("CCG deckbuilder uses a compact local non-token catalog", async () => {
  const catalog = await readJson("api/v1/shadowverse-ccg/catalog.json");
  assert.equal(catalog.gameId, "shadowverse-ccg");
  assert.equal(catalog.dataNamespace, "sv1");
  assert.ok(catalog.cardCount > 4000);
  assert.equal(catalog.cards.length, catalog.cardCount);
  assert.equal(catalog.cards.some(card => card.setId === 90000), false);
  assert.equal(catalog.cards.every(card => card.uid.startsWith("sv1:")), true);
});

test("Champion's Battle base deckbuilding pool is local and excludes Portalcraft", async () => {
  const manifest = await readJson("api/v1/champions-battle/manifest.json");
  const catalog = await readJson("api/v1/champions-battle/catalog.json");
  const allowedSets = new Set([10000, 10001, 10002, 10003]);

  assert.equal(manifest.runtimeSource, "local");
  assert.equal(manifest.materialized, true);
  assert.equal(manifest.basePoolComplete, true);
  assert.equal(manifest.exclusiveCardsComplete, false);
  assert.equal(manifest.portalcraftIncluded, false);
  assert.ok(catalog.cardCount >= 600);
  assert.equal(catalog.cards.every(card => card.dataNamespace === "svcb"), true);
  assert.equal(catalog.cards.some(card => card.craft === "Portalcraft"), false);
  assert.equal(catalog.cards.every(card => allowedSets.has(card.setId)), true);
});

test("API page is a compact public JSON endpoint directory", async () => {
  const html = await fs.readFile(new URL("../api/index.html", import.meta.url), "utf8");
  assert.match(html, /JSON datasets/);
  assert.match(html, /v1\/shadowverse-ccg\/cards\.json/);
  assert.match(html, /v1\/shadowverse-ccg\/catalog\.json/);
  assert.match(html, /v1\/shadowverse-ccg\/image-index\.json/);
  assert.match(html, /v1\/champions-battle\/cards\.json/);
  assert.match(html, /v1\/champions-battle\/catalog\.json/);
  assert.match(html, /cards\.fr\.json/);
  assert.match(html, /data-copy-endpoint/);
  assert.doesNotMatch(html, /No shared raw card pool/);
  assert.doesNotMatch(html, /Local endpoints/);
});

test("API page publishes absolute URLs and practical usage examples", async () => {
  const html = await fs.readFile(new URL("../api/index.html", import.meta.url), "utf8");
  const js = await fs.readFile(new URL("../src/ui/api-page.js", import.meta.url), "utf8");
  assert.match(html, /https:\/\/somostve\.github\.io\/shadowbattle\/api\/v1\//);
  assert.match(html, /Use the data directly/);
  assert.match(html, />JavaScript</);
  assert.match(html, />Python</);
  assert.match(html, />curl</);
  assert.match(html, /Forestcraft/);
  assert.match(html, /requests\.get/);
  assert.match(html, /champions-battle-cards\.json/);
  assert.match(html, /data-copy-text/);
  assert.match(js, /copyValue/);
  assert.match(js, /navigator\.clipboard\.writeText/);
});
