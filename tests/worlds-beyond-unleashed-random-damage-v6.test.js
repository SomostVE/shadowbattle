import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

function card(id, extra = {}) {
  return { id, name: String(id), class: "Runecraft", type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], traits: [], ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "unleashed-random-damage-v6",
    firstPlayer: 0,
    players: [
      { name: "Human", className: "Runecraft", deck: deck("A") },
      { name: "CPU", className: "Runecraft", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function enemy(game, id) {
  const instance = game.players[1].hand.shift() ?? game.players[1].deck.shift();
  assert.ok(instance);
  instance.card = card(id, { class: "Neutral", defense: 7 });
  instance.cardId = id;
  instance.attack = 1;
  instance.defense = 7;
  instance.maxDefense = 7;
  game.players[1].board.push(instance);
  return instance;
}

test("Unleashed mode 2 draws, damages 2 distinct enemy followers, then damages its leader", () => {
  const game = readyGame();
  const source = game.players[0].hand[0];
  source.card = card(10432310, {
    name: "Unleashed",
    type: "Spell",
    cost: 0,
    text: "Draw 2 cards. Deal 4 damage to 2 random enemy followers and 2 damage to your leader."
  });
  source.cardId = 10432310;
  const first = enemy(game, "u1");
  const second = enemy(game, "u2");
  const third = enemy(game, "u3");
  const handBefore = game.players[0].hand.length;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true, `unexpected residual: ${support.residual}`);

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].hand.length, handBefore - 1 + 2);
  assert.equal(game.players[0].hp, 18);
  const defenses = [first, second, third].map(unit => game.findBoardCard(1, unit.instanceId)?.defense);
  assert.equal(defenses.filter(value => value === 3).length, 2);
  assert.equal(defenses.filter(value => value === 7).length, 1);
});
