import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Forestcraft",
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
    seed: "combo-target-preview",
    firstPlayer: 0,
    players: [
      { name: "Human", className: "Forestcraft", deck: fillerDeck("A") },
      { name: "CPU", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function putTarget(game) {
  const target = game.players[1].hand.shift();
  target.card = { id: 91002, name: "Combo Target", type: "Follower", attack: 1, defense: 5, keywords: [], text: "" };
  target.cardId = 91002;
  target.attack = 1;
  target.defense = 5;
  target.maxDefense = 5;
  target.attacksRemaining = 0;
  target.canAttackFollowers = false;
  target.canAttackLeader = false;
  game.players[1].board.push(target);
  return target;
}

function putComboCard(game) {
  const source = game.players[0].hand[0];
  source.card = {
    id: 91001,
    name: "Combo Target Tester",
    class: "Forestcraft",
    type: "Follower",
    cost: 0,
    attack: 2,
    defense: 2,
    keywords: ["Fanfare", "Combo"],
    text: "Fanfare: Combo (3) - Deal 2 damage to an enemy follower."
  };
  source.cardId = 91001;
  return source;
}

test("a played follower counts itself for Combo when previewing a required Fanfare target", () => {
  const game = readyGame();
  const source = putComboCard(game);
  const target = putTarget(game);
  game.players[0].cardsPlayedThisTurn = 2;
  game.players[0].resources.combo = 2;

  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].targetInstanceId, target.instanceId, "the third card must expose its Combo target before play");
  assert.equal(actions.some(action => !action.targetInstanceId), false, "an active targeted Combo Fanfare must not expose an untargeted branch");

  game.dispatch(actions[0]);
  assert.equal(game.findBoardCard(1, target.instanceId).defense, 3);
  assert.equal(game.players[0].cardsPlayedThisTurn, 3);
});

test("the same targeted Combo Fanfare stays optional before its threshold", () => {
  const game = readyGame();
  const source = putComboCard(game);
  const target = putTarget(game);
  game.players[0].cardsPlayedThisTurn = 1;
  game.players[0].resources.combo = 1;

  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].targetInstanceId, undefined);

  game.dispatch(actions[0]);
  assert.equal(game.findBoardCard(1, target.instanceId).defense, 5, "inactive Combo must not resolve the targeted damage");
});
