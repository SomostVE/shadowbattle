import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function fillerDeck(prefix, className) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: className,
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: []
  }));
}

function readyGame(className = "Abysscraft") {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: `class-${className}`,
    firstPlayer: 0,
    players: [
      { name: "A", className, deck: fillerDeck("A", className) },
      { name: "B", className: "Neutral", deck: fillerDeck("B", "Neutral") }
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

test("Necromancy stays inactive without enough Shadows and consumes exactly its cost when active", () => {
  const inactive = readyGame("Abysscraft");
  const inactiveCard = replaceHandCard(inactive, {
    id: 501,
    name: "Necromancy Tester",
    class: "Abysscraft",
    type: "Spell",
    cost: 0,
    keywords: ["Necromancy"],
    text: "Necromancy (3): Deal 4 damage to the enemy leader."
  });
  inactive.players[0].resources.shadows = 2;
  inactive.dispatch({ type: "play-card", player: 0, cardInstanceId: inactiveCard.instanceId });
  assert.equal(inactive.players[1].hp, 20);
  assert.equal(inactive.players[0].resources.shadows, 3, "the spell itself enters the cemetery after its inactive Necromancy check");
  const inactiveTrigger = inactive.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER);
  assert.equal(inactiveTrigger?.payload.conditionInactive, true);

  const active = readyGame("Abysscraft");
  const activeCard = replaceHandCard(active, {
    id: 502,
    name: "Necromancy Active",
    class: "Abysscraft",
    type: "Spell",
    cost: 0,
    keywords: ["Necromancy"],
    text: "Necromancy (3): Deal 4 damage to the enemy leader."
  });
  active.players[0].resources.shadows = 5;
  active.dispatch({ type: "play-card", player: 0, cardInstanceId: activeCard.instanceId });
  assert.equal(active.players[1].hp, 16);
  assert.equal(active.players[0].resources.shadows, 3, "3 Shadows are spent, then the resolved spell contributes 1 Shadow");
});

test("destroyed followers contribute Shadows before Last Words resolve", () => {
  const game = readyGame("Abysscraft");
  game.players[0].resources.shadows = 0;
  const card = replaceHandCard(game, {
    id: 503,
    name: "Shadow Last Words",
    class: "Abysscraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Rush", "Last Words", "Necromancy"],
    text: "Last Words: Necromancy (1): Draw 1 card."
  });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board[0];
  game.players[1].board.push({
    instanceId: "enemy-wall",
    owner: 1,
    cardId: 504,
    card: { id: 504, name: "Enemy Wall", class: "Neutral", type: "Follower", attack: 5, defense: 1, keywords: [] },
    attack: 5,
    defense: 1,
    maxDefense: 1,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  });
  const before = game.players[0].hand.length;
  game.dispatch({ type: "attack", player: 0, attackerInstanceId: follower.instanceId, targetInstanceId: "enemy-wall" });
  assert.equal(game.players[0].hand.length, before + 1);
  assert.equal(game.players[0].resources.shadows, 0, "the destroyed follower grants the Shadow consumed by its Last Words");
});

test("Combo resolves from cards played this turn and resets at the next personal turn", () => {
  const game = readyGame("Forestcraft");
  game.players[0].cardsPlayedThisTurn = 1;
  game.players[0].resources.combo = 1;
  const card = replaceHandCard(game, {
    id: 505,
    name: "Combo Tester",
    class: "Forestcraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Combo"],
    text: "Fanfare: Combo (2): Deal 3 damage to the enemy leader."
  });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  assert.equal(game.players[1].hp, 17);
  assert.equal(game.players[0].cardsPlayedThisTurn, 2);
  assert.equal(game.players[0].resources.combo, 2);

  game.endTurn(0);
  game.endTurn(1);
  assert.equal(game.players[0].cardsPlayedThisTurn, 0);
  assert.equal(game.players[0].resources.combo, 0);
});

test("Overflow activates at 7 maximum PP and remains inactive below the threshold", () => {
  const inactive = readyGame("Dragoncraft");
  inactive.players[0].resources.maxPp = 6;
  inactive.players[0].resources.pp = 6;
  const inactiveCard = replaceHandCard(inactive, {
    id: 506,
    name: "Overflow Tester",
    class: "Dragoncraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Overflow"],
    text: "Fanfare: Overflow: Deal 2 damage to the enemy leader."
  });
  inactive.dispatch({ type: "play-card", player: 0, cardInstanceId: inactiveCard.instanceId });
  assert.equal(inactive.players[1].hp, 20);

  const active = readyGame("Dragoncraft");
  active.players[0].resources.maxPp = 7;
  active.players[0].resources.pp = 7;
  const activeCard = replaceHandCard(active, {
    id: 507,
    name: "Overflow Active",
    class: "Dragoncraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Overflow"],
    text: "Fanfare: Overflow: Deal 2 damage to the enemy leader."
  });
  active.dispatch({ type: "play-card", player: 0, cardInstanceId: activeCard.instanceId });
  assert.equal(active.players[1].hp, 18);
});

test("inactive class conditions do not force a target selection", () => {
  const game = readyGame("Abysscraft");
  game.players[0].resources.shadows = 0;
  const card = replaceHandCard(game, {
    id: 508,
    name: "Conditional Destroy",
    class: "Abysscraft",
    type: "Spell",
    cost: 0,
    keywords: ["Necromancy"],
    text: "Necromancy (5): Destroy an enemy follower."
  });
  game.players[1].board.push({
    instanceId: "target",
    owner: 1,
    cardId: 509,
    card: { id: 509, name: "Target", class: "Neutral", type: "Follower", attack: 1, defense: 1, keywords: [] },
    attack: 1,
    defense: 1,
    maxDefense: 1
  });
  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === card.instanceId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].targetInstanceId, undefined);
  game.dispatch(actions[0]);
  assert.equal(game.players[1].board.length, 1);
});
