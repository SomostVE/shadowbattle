import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: []
  }));
}

function readyGame({ className = "Abysscraft" } = {}) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: `trigger-atomicity-${className}`,
    firstPlayer: 0,
    players: [
      { name: "A", className, deck: fillerDeck("A") },
      { name: "B", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, card) {
  const instance = game.players[0].hand[0];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

function latestTrigger(game, trigger = "play") {
  return [...game.getEvents({ viewer: 0 })]
    .reverse()
    .find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === trigger);
}

test("a mixed unsupported Fanfare is atomic and does not execute its supported prefix", () => {
  const game = readyGame();
  const card = replaceHandCard(game, {
    id: "atomic-mixed-fanfare",
    name: "Atomic Mixed Fanfare",
    class: "Abysscraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Draw 2 cards. Banish all duplicates from your deck."
  });
  const handBefore = game.players[0].hand.length;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  assert.equal(game.players[0].hand.length, handBefore - 1, "unsupported suffix must block the otherwise supported draw");
  assert.equal(game.players[0].board.some(unit => unit.instanceId === card.instanceId), true, "playing the follower itself remains legal");
  const trigger = latestTrigger(game);
  assert.equal(trigger?.payload.resolved, false);
  assert.match(trigger?.payload.unsupportedResidual ?? "", /Banish all duplicates from your deck/i);
});

test("an unresolved Necromancy trigger does not consume Shadows", () => {
  const game = readyGame({ className: "Abysscraft" });
  game.players[0].resources.shadows = 2;
  const card = replaceHandCard(game, {
    id: "atomic-necromancy-unresolved",
    name: "Atomic Necromancy Unresolved",
    class: "Abysscraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare", "Necromancy"],
    text: "Fanfare: Necromancy (2): Draw 1 card. Banish all duplicates from your deck."
  });
  const handBefore = game.players[0].hand.length;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  assert.equal(game.players[0].resources.shadows, 2);
  assert.equal(game.players[0].hand.length, handBefore - 1);
  assert.equal(latestTrigger(game)?.payload.resolved, false);
});

test("a fully supported Necromancy trigger still consumes its cost before resolving", () => {
  const game = readyGame({ className: "Abysscraft" });
  game.players[0].resources.shadows = 2;
  const card = replaceHandCard(game, {
    id: "atomic-necromancy-supported",
    name: "Atomic Necromancy Supported",
    class: "Abysscraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare", "Necromancy"],
    text: "Fanfare: Necromancy (2): Draw 1 card."
  });
  const handBefore = game.players[0].hand.length;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  assert.equal(game.players[0].resources.shadows, 0);
  assert.equal(game.players[0].hand.length, handBefore, "played follower is replaced by the resolved draw");
  assert.equal(latestTrigger(game)?.payload.resolved, true);
});

test("mixed unsupported Last Words do not partially draw before surfacing unresolved text", () => {
  const game = readyGame();
  const card = replaceHandCard(game, {
    id: "atomic-last-words",
    name: "Atomic Last Words",
    class: "Abysscraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Rush", "Last Words"],
    text: "Last Words: Draw 1 card. Banish all duplicates from your deck."
  });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board.find(unit => unit.instanceId === card.instanceId);
  game.players[1].board.push({
    instanceId: "atomic-wall",
    owner: 1,
    cardId: "atomic-wall",
    card: { id: "atomic-wall", name: "Atomic Wall", type: "Follower", attack: 5, defense: 1, keywords: [] },
    attack: 5,
    defense: 1,
    maxDefense: 1,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  });
  const handBefore = game.players[0].hand.length;

  game.dispatch({ type: "attack", player: 0, attackerInstanceId: follower.instanceId, targetInstanceId: "atomic-wall" });

  assert.equal(game.players[0].hand.length, handBefore);
  const trigger = latestTrigger(game, "last-words");
  assert.equal(trigger?.payload.resolved, false);
  assert.match(trigger?.payload.unsupportedResidual ?? "", /Banish all duplicates from your deck/i);
});
