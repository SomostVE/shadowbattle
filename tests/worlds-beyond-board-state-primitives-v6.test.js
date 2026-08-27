import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: [],
    text: ""
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "board-state-primitives-v6",
    firstPlayer: 0,
    players: [
      { deck: fillerDeck("A") },
      { deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, card, index = 0) {
  const instance = game.players[0].hand[index];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

function attacksFor(game, instanceId) {
  return game.listLegalActions(0).filter(action => action.type === "attack" && action.attackerInstanceId === instanceId);
}

test("printed Earth Sigil is amulet metadata and does not pollute Fanfare support", () => {
  const game = readyGame();
  const definition = {
    id: "earth-sigil-fanfare",
    name: "Earth Sigil Fanfare",
    class: "Runecraft",
    type: "Amulet",
    cost: 1,
    traits: ["Earth Sigil"],
    keywords: ["Earth Sigil", "Engage", "Fanfare"],
    text: "Fanfare: Draw a card.\n\nEarth Sigil\n\nEngage (1): Gain an earth sigil."
  };
  const source = replaceHandCard(game, definition);
  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);

  assert.equal(support.supported, true);
  assert.equal(support.residual, "");
  assert.match(support.text, /^Draw a card\.?$/i);

  const before = game.players[0].hand.length;
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: source.instanceId });
  assert.equal(game.players[0].hand.length, before, "playing the amulet consumes one hand card then Fanfare draws one");
  assert.equal(game.players[0].board.some(card => card.instanceId === source.instanceId), true);
});

test("standalone Earth Sigil setup text is not treated as an executable play ability", () => {
  const game = readyGame();
  const source = replaceHandCard(game, {
    id: "earth-sigil-only",
    name: "Earth Sigil Only",
    class: "Runecraft",
    type: "Amulet",
    cost: 1,
    traits: ["Earth Sigil"],
    keywords: ["Earth Sigil", "Engage"],
    text: "Earth Sigil\n\nEngage (1): Gain an earth sigil."
  });
  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);

  assert.equal(support.supported, true);
  assert.equal(support.text, "");
  assert.equal(support.residual, "");
});

test("a two-attack follower refreshes to two attacks and may attack the leader twice", () => {
  const game = readyGame();
  const source = replaceHandCard(game, {
    id: "double-attacker",
    name: "Double Attacker",
    type: "Follower",
    cost: 0,
    attack: 2,
    defense: 6,
    keywords: [],
    text: "Can attack 2 times per turn."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: source.instanceId });
  const follower = game.findBoardCard(0, source.instanceId);
  assert.equal(follower.attackLimit, 2);
  assert.equal(follower.attacksRemaining, 2);
  assert.deepEqual(attacksFor(game, follower.instanceId), [], "without Storm it still cannot attack on the turn it enters");

  game.endTurn(0);
  game.endTurn(1);
  assert.equal(follower.attacksRemaining, 2);
  assert.equal(attacksFor(game, follower.instanceId).some(action => action.target === "leader"), true);

  const hpBefore = game.players[1].hp;
  game.dispatch({ type: "attack", player: 0, attackerInstanceId: follower.instanceId, target: "leader" });
  assert.equal(follower.attacksRemaining, 1);
  assert.equal(attacksFor(game, follower.instanceId).some(action => action.target === "leader"), true, "one legal attack must remain");

  game.dispatch({ type: "attack", player: 0, attackerInstanceId: follower.instanceId, target: "leader" });
  assert.equal(follower.attacksRemaining, 0);
  assert.deepEqual(attacksFor(game, follower.instanceId), []);
  assert.equal(game.players[1].hp, hpBefore - 4);
});

test("Storm plus a two-attack passive grants two immediate attacks but no third attack", () => {
  const game = readyGame();
  const source = replaceHandCard(game, {
    id: "double-storm",
    name: "Double Storm",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 4,
    keywords: ["Storm"],
    text: "Storm\nCan attack 2 times per turn."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: source.instanceId });
  const follower = game.findBoardCard(0, source.instanceId);
  assert.equal(follower.attacksRemaining, 2);

  game.dispatch({ type: "attack", player: 0, attackerInstanceId: follower.instanceId, target: "leader" });
  assert.equal(follower.attacksRemaining, 1);
  assert.equal(attacksFor(game, follower.instanceId).some(action => action.target === "leader"), true);

  game.dispatch({ type: "attack", player: 0, attackerInstanceId: follower.instanceId, target: "leader" });
  assert.equal(follower.attacksRemaining, 0);
  assert.deepEqual(attacksFor(game, follower.instanceId), []);
});

test("single-attack followers keep the existing one-attack limit", () => {
  const game = readyGame();
  const source = replaceHandCard(game, {
    id: "single-storm-control",
    name: "Single Storm Control",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 2,
    keywords: ["Storm"],
    text: "Storm"
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: source.instanceId });
  const follower = game.findBoardCard(0, source.instanceId);
  assert.equal(follower.attackLimit, 1);
  assert.equal(follower.attacksRemaining, 1);
  game.dispatch({ type: "attack", player: 0, attackerInstanceId: follower.instanceId, target: "leader" });
  assert.equal(follower.attacksRemaining, 0);
  assert.deepEqual(attacksFor(game, follower.instanceId), []);
});
