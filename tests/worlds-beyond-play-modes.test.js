import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function card(id, extra = {}) {
  return { id, name: id, type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function startedGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "play-modes-test",
    firstPlayer: 0,
    players: [
      { name: "Human", deck: deck("A") },
      { name: "CPU", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function addToHand(game, source) {
  const instance = {
    instanceId: `0:mode:${source.id}`,
    owner: 0,
    cardId: source.id,
    card: source,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0
  };
  game.players[0].hand.push(instance);
  return instance;
}

function setPp(game, pp) {
  game.players[0].resources.pp = pp;
  game.players[0].resources.maxPp = Math.max(game.players[0].resources.maxPp, pp);
}

test("Enhance replaces the base play when its cost is affordable and keeps base Fanfare", () => {
  const game = startedGame();
  setPp(game, 5);
  const source = card("enhance-card", {
    cost: 2,
    attack: 2,
    defense: 2,
    text: "Fanfare: Draw a card.\nEnhance (5): Deal 3 damage to the enemy leader."
  });
  const instance = addToHand(game, source);
  const handBefore = game.players[0].hand.length;
  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === instance.instanceId);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].cost, 5);
  assert.equal(actions[0].playMode.enhanced, true);
  assert.equal(actions[0].playMode.kind, "enhance");
  game.dispatch(actions[0]);

  assert.equal(game.players[0].resources.pp, 0);
  assert.equal(game.players[1].hp, 17);
  assert.equal(game.players[0].hand.length, handBefore);
  assert.ok(game.findBoardCard(0, instance.instanceId));
});

test("Accelerate is offered only when the normal card cannot be paid and resolves as a spell", () => {
  const game = startedGame();
  setPp(game, 1);
  const source = card("accelerate-card", {
    cost: 6,
    attack: 6,
    defense: 6,
    text: "Accelerate (1): Draw a card."
  });
  const instance = addToHand(game, source);
  const handBefore = game.players[0].hand.length;
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === instance.instanceId);

  assert.equal(action?.playMode.kind, "accelerate");
  assert.equal(action?.effectiveType, "spell");
  assert.equal(action?.cost, 1);
  game.dispatch(action);

  assert.equal(game.findBoardCard(0, instance.instanceId), null);
  assert.ok(game.players[0].cemetery.some(item => item.instanceId === instance.instanceId));
  assert.equal(instance.card.type, "Follower");
  assert.equal(game.players[0].hand.length, handBefore);
  const cast = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.SPELL_CAST && event.payload.card?.instanceId === instance.instanceId);
  assert.equal(cast?.payload.mode, "accelerate");
});

test("Crystallize creates an amulet and restores the original follower identity after Countdown", () => {
  const game = startedGame();
  setPp(game, 2);
  const source = card("crystallize-card", {
    cost: 7,
    attack: 7,
    defense: 7,
    text: "Crystallize (2): Countdown (1)\nLast Words: Deal 2 damage to the enemy leader."
  });
  const instance = addToHand(game, source);
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === instance.instanceId);

  assert.equal(action?.playMode.kind, "crystallize");
  assert.equal(action?.effectiveType, "amulet");
  game.dispatch(action);
  assert.equal(game.findBoardCard(0, instance.instanceId)?.card.type, "Amulet");
  assert.equal(game.findBoardCard(0, instance.instanceId)?.countdown, 1);

  game.endTurn(0);
  game.endTurn(1);

  assert.equal(game.findBoardCard(0, instance.instanceId), null);
  assert.equal(game.players[1].hp, 18);
  const cemeteryCard = game.players[0].cemetery.find(item => item.instanceId === instance.instanceId);
  assert.equal(cemeteryCard?.card.type, "Follower");
});

test("Accelerate is not offered when the normal follower is affordable", () => {
  const game = startedGame();
  setPp(game, 6);
  const source = card("affordable-base", {
    cost: 6,
    attack: 6,
    defense: 6,
    text: "Accelerate (1): Draw a card."
  });
  const instance = addToHand(game, source);
  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === instance.instanceId);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].playMode.kind, "base");
  assert.equal(actions[0].cost, 6);
  assert.equal(actions[0].effectiveType, "follower");
});
