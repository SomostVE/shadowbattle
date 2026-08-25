import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { WORLDS_BEYOND_RULESET } from "../src/core/rulesets/worlds-beyond.js";
import { SHADOWBATTLE_V6_ENGINE_PROFILE } from "../src/core/rulesets/svwb/v6/engine-profile.js";

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 1,
    keywords: [],
    traits: [],
    text: ""
  }));
}

test("Worlds Beyond is explicitly served by ShadowBattle Engine V6 Alpha", () => {
  assert.equal(WORLDS_BEYOND_RULESET.id, "svwb-v6-alpha");
  assert.equal(WORLDS_BEYOND_RULESET.engineVersion, 6);
  assert.equal(WORLDS_BEYOND_RULESET.battleRulesVersion, 6);
  assert.equal(WORLDS_BEYOND_RULESET.compatibilityBattleRulesVersion, 5);
  assert.equal(WORLDS_BEYOND_RULESET.engineProfile, SHADOWBATTLE_V6_ENGINE_PROFILE);
  assert.equal(SHADOWBATTLE_V6_ENGINE_PROFILE.resolution.model, "deterministic-fifo");
  assert.equal(SHADOWBATTLE_V6_ENGINE_PROFILE.migrationGates.runtimeMonkeyPatches, "removed");
  assert.equal(Object.isFrozen(SHADOWBATTLE_V6_ENGINE_PROFILE), true);
  assert.equal(Object.isFrozen(SHADOWBATTLE_V6_ENGINE_PROFILE.migrationGates), true);
});

test("a default Worlds Beyond GameSession reports the V6 ruleset and native queue", () => {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    firstPlayer: 0,
    players: [{ deck: deck("A") }, { deck: deck("B") }]
  });
  game.start();
  assert.equal(game.ruleset.id, "svwb-v6-alpha");
  assert.equal(game.getSnapshot().ruleset, "svwb-v6-alpha");
  assert.equal(Object.prototype.hasOwnProperty.call(game, "emit"), false);
  assert.equal(game.getResolutionState().maxSteps, 512);
});

test("the internal Battle Lab identifies V6 Alpha instead of the inherited V5 engine", async () => {
  const html = await fs.readFile(new URL("../test/index.html", import.meta.url), "utf8");
  assert.match(html, /ShadowBattle Engine V6 Alpha/);
  assert.doesNotMatch(html, /ruleset v5/i);
  assert.match(html, /v=0\.4\.45/);
});
