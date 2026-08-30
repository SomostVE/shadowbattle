import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function card(id, extra = {}) {
  return { id, name: String(id), class: "Neutral", type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], traits: [], ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "random-multi-damage-order-v6",
    firstPlayer: 0,
    players: [{ deck: deck("A") }, { deck: deck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function enemy(game, id) {
  const instance = game.players[1].hand.shift();
  instance.card = card(id, { defense: 5 });
  instance.cardId = id;
  instance.attack = 1;
  instance.defense = 5;
  instance.maxDefense = 5;
  game.players[1].board.push(instance);
  return instance;
}

test("same-clause random follower plus leader damage keeps printed order", () => {
  const game = readyGame();
  const source = game.players[0].hand[0];
  source.card = card("march", {
    type: "Spell",
    cost: 0,
    text: "Deal 2 damage to 2 random enemy followers and the enemy leader."
  });
  source.cardId = "march";
  const first = enemy(game, "first");
  const second = enemy(game, "second");
  game.players[1].hp = 2;

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, first.instanceId)?.defense, 3);
  assert.equal(game.findBoardCard(1, second.instanceId)?.defense, 3);
  assert.equal(game.players[1].hp, 0);
});
