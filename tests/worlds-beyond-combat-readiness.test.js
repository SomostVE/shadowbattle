import test from "node:test";
import assert from "node:assert/strict";
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
    keywords: [],
    text: ""
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "combat-readiness",
    firstPlayer: 0,
    players: [{ deck: fillerDeck("A") }, { deck: fillerDeck("B") }]
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

function attacksFor(game, instanceId) {
  return game.listLegalActions(0).filter(action => action.type === "attack" && action.attackerInstanceId === instanceId);
}

test("a normal follower cannot attack on the turn it enters play", () => {
  const game = readyGame();
  const card = replaceHandCard(game, { id: 20001, name: "Normal Follower", type: "Follower", cost: 0, attack: 3, defense: 3, keywords: [], text: "" });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board[0];

  assert.equal(follower.playedTurn, game.turn);
  assert.equal(follower.canAttackFollowers, false);
  assert.equal(follower.canAttackLeader, false);
  assert.deepEqual(attacksFor(game, follower.instanceId), []);
  assert.throws(
    () => game.dispatch({ type: "attack", player: 0, attackerInstanceId: follower.instanceId, target: "leader" }),
    /cannot attack the enemy leader yet/
  );
});

test("mentioning Storm in ability text does not grant Storm", () => {
  const game = readyGame();
  const card = replaceHandCard(game, {
    id: 20002,
    name: "Storm Mention Tester",
    type: "Follower",
    cost: 0,
    attack: 2,
    defense: 2,
    keywords: [],
    text: "Fanfare: Give another allied follower Storm."
  });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board[0];

  assert.equal(follower.canAttackFollowers, false);
  assert.equal(follower.canAttackLeader, false);
  assert.deepEqual(attacksFor(game, follower.instanceId), []);
});

test("Rush can attack followers immediately but not the enemy leader", () => {
  const game = readyGame();
  game.players[1].board.push({
    instanceId: "enemy-target",
    owner: 1,
    cardId: 20003,
    card: { id: 20003, name: "Enemy Target", type: "Follower", attack: 1, defense: 3, keywords: [], text: "" },
    attack: 1,
    defense: 3,
    maxDefense: 3,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  });
  const card = replaceHandCard(game, { id: 20004, name: "Rush Tester", type: "Follower", cost: 0, attack: 2, defense: 2, keywords: ["Rush"], text: "" });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board[0];
  const attacks = attacksFor(game, follower.instanceId);

  assert.equal(attacks.some(action => action.target === "leader"), false);
  assert.equal(attacks.some(action => action.targetInstanceId === "enemy-target"), true);
});

test("a normal follower becomes attack-ready on its controller's next turn", () => {
  const game = readyGame();
  const card = replaceHandCard(game, { id: 20005, name: "Next Turn Tester", type: "Follower", cost: 0, attack: 2, defense: 2, keywords: [], text: "" });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const instanceId = game.players[0].board[0].instanceId;

  game.endTurn(0);
  game.endTurn(1);

  const follower = game.findBoardCard(0, instanceId);
  assert.equal(follower.canAttackFollowers, true);
  assert.equal(follower.canAttackLeader, true);
  assert.equal(attacksFor(game, instanceId).some(action => action.target === "leader"), true);
});

test("permanent attack locks survive the normal turn refresh", () => {
  const game = readyGame();
  const card = replaceHandCard(game, { id: 20006, name: "Locked Tester", type: "Follower", cost: 0, attack: 4, defense: 4, keywords: [], text: "" });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board[0];
  follower.permanentAttackLock = true;
  follower.canAttackFollowers = false;
  follower.canAttackLeader = false;

  game.endTurn(0);
  game.endTurn(1);

  assert.equal(follower.attacksRemaining, 0);
  assert.equal(follower.canAttackFollowers, false);
  assert.equal(follower.canAttackLeader, false);
  assert.deepEqual(attacksFor(game, follower.instanceId), []);
});
