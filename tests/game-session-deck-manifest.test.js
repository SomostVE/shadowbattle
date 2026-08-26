import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../src/core/game-session.js";
import { GAME_IDS } from "../src/core/game-catalog.js";

function uniqueDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    name: `${prefix} ${index + 1}`,
    class: "Neutral",
    type: "Follower",
    cost: index % 10
  }));
}

function duplicateDeck() {
  const shared = { id: "dup", name: "Duplicate", class: "Dragoncraft", type: "Follower", cost: 2 };
  return [shared, shared, shared, ...uniqueDeck("rest").slice(0, 37)];
}

function createSession() {
  return new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "deck-manifest-test",
    firstPlayer: 0,
    players: [
      { name: "Human", deck: uniqueDeck("human") },
      { name: "CPU", deck: duplicateDeck() }
    ]
  });
}

test("GameSession exposes deck composition without deck order or card instances", () => {
  const game = createSession();
  const manifest = game.getDeckManifest(1);
  const duplicate = manifest.find(row => row.cardId === "dup");

  assert.equal(duplicate.qty, 3);
  assert.equal(duplicate.name, "Duplicate");
  assert.equal(duplicate.cost, 2);
  assert.equal(duplicate.type, "Follower");
  assert.equal(manifest.reduce((sum, row) => sum + row.qty, 0), 40);
  assert.ok(manifest.every(row => !("instanceId" in row)));
  assert.ok(manifest.every(row => !("position" in row)));
  assert.ok(manifest.every(row => !("order" in row)));
});

test("deck manifest is immutable from the caller and stays static after shuffle, draws and mulligan", () => {
  const game = createSession();
  const before = game.getDeckManifest(1);
  before.find(row => row.cardId === "dup").qty = 99;
  before.push({ cardId: "injected", qty: 100 });

  assert.equal(game.getDeckManifest(1).find(row => row.cardId === "dup").qty, 3);
  assert.equal(game.getDeckManifest(1).some(row => row.cardId === "injected"), false);

  game.start();
  const replacements = game.players[1].hand.slice(0, 2).map(card => card.instanceId);
  game.submitMulligan(1, replacements);
  assert.deepEqual(game.getDeckManifest(1), createSession().getDeckManifest(1));
});
