import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({ id: `${prefix}-${index}`, name: `${prefix} ${index}`, type: "Follower", cost: 9, attack: 1, defense: 1, keywords: [] }));
}
function readyGame() {
  const game = new GameSession({ gameId: GAME_IDS.WORLDS_BEYOND, seed: "resolver-test", firstPlayer: 0, players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }] });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}
function replaceHandCard(game, playerIndex, card) {
  const instance = game.players[playerIndex].hand[0];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

test("SVWB action resolver spends PP and moves a follower from hand to board", () => {
  const game = readyGame();
  const card = replaceHandCard(game, 0, { id: 100, name: "Test Fighter", type: "Follower", cost: 2, attack: 2, defense: 3, keywords: [] });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  assert.equal(game.players[0].resources.pp, 8);
  assert.equal(game.players[0].hand.length, 4);
  assert.equal(game.players[0].board.length, 1);
  assert.equal(game.players[0].board[0].attack, 2);
  assert.equal(game.players[0].board[0].defense, 3);
  assert.equal(game.players[0].board[0].canAttackLeader, false);
  assert.deepEqual(game.getEvents({ viewer: 0 }).slice(-2).map(event => event.type), [BATTLE_EVENT.CARD_PLAY, BATTLE_EVENT.FOLLOWER_ENTER]);
});

test("Storm can attack the leader immediately and combat events stay ordered", () => {
  const game = readyGame();
  const card = replaceHandCard(game, 0, { id: 101, name: "Storm Tester", type: "Follower", cost: 1, attack: 4, defense: 2, keywords: ["Storm"] });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const attacker = game.players[0].board[0];
  game.dispatch({ type: "attack", player: 0, attackerInstanceId: attacker.instanceId, target: "leader" });
  assert.equal(game.players[1].hp, 16);
  assert.equal(attacker.attacksRemaining, 0);
  const tail = game.getEvents({ viewer: 0 }).slice(-3).map(event => event.type);
  assert.deepEqual(tail, [BATTLE_EVENT.ATTACK_START, BATTLE_EVENT.ATTACK_IMPACT, BATTLE_EVENT.LEADER_DAMAGE]);
});

test("Ward blocks leader attacks until the Ward follower is removed", () => {
  const game = readyGame();
  const attackerCard = replaceHandCard(game, 0, { id: 102, name: "Storm Tester", type: "Follower", cost: 0, attack: 3, defense: 3, keywords: ["Storm"] });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: attackerCard.instanceId });
  const attacker = game.players[0].board[0];
  game.players[1].board.push({ instanceId: "ward", owner: 1, cardId: 103, card: { id: 103, name: "Ward Tester", type: "Follower", attack: 1, defense: 2, keywords: ["Ward"] }, attack: 1, defense: 2, maxDefense: 2, attacksRemaining: 0, canAttackFollowers: false, canAttackLeader: false });
  assert.throws(() => game.dispatch({ type: "attack", player: 0, attackerInstanceId: attacker.instanceId, target: "leader" }), /Ward/);
  game.dispatch({ type: "attack", player: 0, attackerInstanceId: attacker.instanceId, targetInstanceId: "ward" });
  assert.equal(game.players[1].board.length, 0);
  assert.equal(game.players[1].cemetery.length, 1);
});

test("Evo and Super Evo use the official WB stat bonuses and one evolution action per turn", () => {
  const game = readyGame();
  const card = replaceHandCard(game, 0, { id: 104, name: "Evolution Tester", type: "Follower", cost: 0, attack: 2, defense: 2, keywords: [] });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board[0];
  game.players[0].resources.evolutionAvailable = true;
  game.dispatch({ type: "evolve", player: 0, followerInstanceId: follower.instanceId });
  assert.equal(follower.attack, 4);
  assert.equal(follower.defense, 4);
  assert.equal(follower.evolved, true);
  assert.equal(follower.canAttackFollowers, true);
  assert.equal(follower.canAttackLeader, false);
  assert.equal(game.players[0].resources.evolutionPoints, 1);
  assert.throws(() => game.dispatch({ type: "super-evolve", player: 0, followerInstanceId: follower.instanceId }), /already evolved|already used/);

  const second = readyGame();
  const superCard = replaceHandCard(second, 0, { id: 105, name: "Super Tester", type: "Follower", cost: 0, attack: 2, defense: 2, keywords: [] });
  second.dispatch({ type: "play-card", player: 0, cardInstanceId: superCard.instanceId });
  const superFollower = second.players[0].board[0];
  second.players[0].resources.superEvolutionAvailable = true;
  second.dispatch({ type: "super-evolve", player: 0, followerInstanceId: superFollower.instanceId });
  assert.equal(superFollower.attack, 5);
  assert.equal(superFollower.defense, 5);
  assert.equal(superFollower.superEvolved, true);
  assert.equal(second.players[0].resources.superEvolutionPoints, 1);
  second.damageFollower(0, superFollower.instanceId, 99, { actor: 1, reason: "ability" });
  assert.equal(superFollower.defense, 5, "Super Evo is Invincible during its controller's turn");
});

test("legal action enumeration exposes playable cards and combat without leaking hidden hands", () => {
  const game = readyGame();
  const card = replaceHandCard(game, 0, { id: 106, name: "Cheap Storm", type: "Follower", cost: 1, attack: 1, defense: 1, keywords: ["Storm"] });
  let actions = game.listLegalActions(0);
  assert.ok(actions.some(action => action.type === "play-card" && action.cardInstanceId === card.instanceId));
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  actions = game.listLegalActions(0);
  assert.ok(actions.some(action => action.type === "attack" && action.target === "leader"));
  assert.ok(game.getSnapshot(0).players[1].hand.every(value => value === null));
});
