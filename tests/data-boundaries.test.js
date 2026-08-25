import test from "node:test";
import assert from "node:assert/strict";
import { GAME_CATALOG } from "../src/core/game-catalog.js";
import { normalizeShadowBattleCard } from "../src/data/normalize-card.js";

test("every supported game has a unique data namespace", () => {
  const games = Object.values(GAME_CATALOG);
  const namespaces = games.map(game => game.dataNamespace);
  assert.equal(new Set(namespaces).size, namespaces.length);
});

test("normalized card identity is qualified by game namespace", () => {
  const sourceCard = { id: 12345, name: "Example" };
  const wb = normalizeShadowBattleCard({ gameId: "worlds-beyond", dataNamespace: "svwb", sourceCard });
  const classic = normalizeShadowBattleCard({ gameId: "shadowverse-ccg", dataNamespace: "sv1", sourceCard });

  assert.equal(wb.uid, "svwb:12345");
  assert.equal(classic.uid, "sv1:12345");
  assert.notEqual(wb.uid, classic.uid);
});
