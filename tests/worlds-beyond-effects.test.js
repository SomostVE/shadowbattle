import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({ id: `${prefix}-${index}`, name: `${prefix} ${index}`, type: "Follower", cost: 9, attack: 1, defense: 1, keywords: [] }));
}
function readyGame() {
  const game = new GameSession({ gameId: GAME_IDS.WORLDS_BEYOND, seed: "effect-test", firstPlayer: 0, players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }] });
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

test("simple Fanfare effects resolve through the V5 trigger stream", () => {
  const game = readyGame();
  const card = replaceHandCard(game, { id: 201, name: "Fanfare Tester", type: "Follower", cost: 0, attack: 1, defense: 1, keywords: ["Fanfare"], text: "Fanfare: Draw 2 cards. Deal 2 damage to the enemy leader." });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  assert.equal(game.players[0].hand.length, 6);
  assert.equal(game.players[1].hp, 18);
  assert.ok(game.getEvents({ viewer: 0 }).some(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "play" && event.payload.resolved === true));
});

test("conditional card text is surfaced but not guessed", () => {
  const game = readyGame();
  const card = replaceHandCard(game, { id: 202, name: "Conditional Tester", type: "Follower", cost: 0, attack: 1, defense: 1, keywords: ["Fanfare"], text: "Fanfare: If there is another allied follower, deal 4 damage to the enemy leader." });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  assert.equal(game.players[1].hp, 20);
  const trigger = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER);
  assert.equal(trigger?.payload.resolved, false);
});

test("Evolve trigger resolves after the official +2/+2 evolution", () => {
  const game = readyGame();
  const card = replaceHandCard(game, { id: 203, name: "Evolve Tester", type: "Follower", cost: 0, attack: 2, defense: 2, keywords: ["Evolve"], text: "Evolve: Deal 2 damage to the enemy leader." });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board[0];
  game.players[0].resources.evolutionAvailable = true;
  game.dispatch({ type: "evolve", player: 0, followerInstanceId: follower.instanceId });
  assert.equal(follower.attack, 4);
  assert.equal(follower.defense, 4);
  assert.equal(game.players[1].hp, 18);
});

test("Last Words resolve when combat destroys a follower", () => {
  const game = readyGame();
  const card = replaceHandCard(game, { id: 204, name: "Last Words Tester", type: "Follower", cost: 0, attack: 1, defense: 1, keywords: ["Rush", "Last Words"], text: "Last Words: Draw 1 card." });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board[0];
  game.players[1].board.push({ instanceId: "enemy-wall", owner: 1, cardId: 205, card: { id: 205, name: "Enemy Wall", type: "Follower", attack: 5, defense: 1, keywords: [] }, attack: 5, defense: 1, maxDefense: 1, attacksRemaining: 0, canAttackFollowers: false, canAttackLeader: false });
  const before = game.players[0].hand.length;
  game.dispatch({ type: "attack", player: 0, attackerInstanceId: follower.instanceId, targetInstanceId: "enemy-wall" });
  assert.equal(game.players[0].board.length, 0);
  assert.equal(game.players[0].hand.length, before + 1);
  assert.ok(game.getEvents({ viewer: 0 }).some(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "last-words"));
});

test("Bane destroys damaged followers and Drain restores leader defense", () => {
  const baneGame = readyGame();
  const baneCard = replaceHandCard(baneGame, { id: 206, name: "Bane Tester", type: "Follower", cost: 0, attack: 1, defense: 3, keywords: ["Rush", "Bane"], text: "" });
  baneGame.dispatch({ type: "play-card", player: 0, cardInstanceId: baneCard.instanceId });
  const bane = baneGame.players[0].board[0];
  baneGame.players[1].board.push({ instanceId: "large-target", owner: 1, cardId: 207, card: { id: 207, name: "Large Target", type: "Follower", attack: 0, defense: 10, keywords: [] }, attack: 0, defense: 10, maxDefense: 10, attacksRemaining: 0, canAttackFollowers: false, canAttackLeader: false });
  baneGame.dispatch({ type: "attack", player: 0, attackerInstanceId: bane.instanceId, targetInstanceId: "large-target" });
  assert.equal(baneGame.players[1].board.length, 0);

  const drainGame = readyGame();
  const drainCard = replaceHandCard(drainGame, { id: 208, name: "Drain Tester", type: "Follower", cost: 0, attack: 3, defense: 2, keywords: ["Storm", "Drain"], text: "" });
  drainGame.players[0].hp = 10;
  drainGame.dispatch({ type: "play-card", player: 0, cardInstanceId: drainCard.instanceId });
  const drain = drainGame.players[0].board[0];
  drainGame.dispatch({ type: "attack", player: 0, attackerInstanceId: drain.instanceId, target: "leader" });
  assert.equal(drainGame.players[0].hp, 13);
  assert.ok(drainGame.getEvents({ viewer: 0 }).some(event => event.type === BATTLE_EVENT.HEAL && event.payload.reason === "drain"));
});
