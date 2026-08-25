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
    assert.equal(manifest.namespace, namespace);
    assert.equal(manifest.materialized, false);
  }
});
