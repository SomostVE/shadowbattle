import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: [],
    text: ""
  }));
}

function readyGame({ playerClass = "Forestcraft" } = {}) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "target-debuff-highest-attack-v6",
    firstPlayer: 0,
    players: [
      { className: playerClass, deck: fillerDeck("A") },
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

function enemyFollower(game, { id, attack, defense }) {
  const unit = {
    instanceId: id,
    owner: 1,
    cardId: id,
    card: {
      id,
      name: id,
      type: "Follower",
      cost: 1,
      attack,
      defense,
      keywords: [],
      text: ""
    },
    attack,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[1].board.push(unit);
  return unit;
}

test("Codex-style targeted -0/-1 debuff exposes explicit targets and reduces defense", () => {
  const game = readyGame();
  const source = replaceHandCard(game, {
    id: "devotee-unkilling",
    name: "Devotee of Unkilling",
    class: "Forestcraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare", "Evolve"],
    text: "Fanfare: Select an enemy follower on the field and give it -0/-1.\n\nEvolve: Replicate the effects of this card's Fanfare ability."
  });
  const first = enemyFollower(game, { id: "debuff-first", attack: 4, defense: 5 });
  const second = enemyFollower(game, { id: "debuff-second", attack: 2, defense: 3 });

  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
  assert.deepEqual(new Set(actions.map(action => action.targetInstanceId)), new Set([first.instanceId, second.instanceId]));

  game.dispatch(actions.find(action => action.targetInstanceId === second.instanceId));
  assert.equal(game.findBoardCard(1, first.instanceId)?.defense, 5);
  assert.equal(game.findBoardCard(1, second.instanceId)?.attack, 2);
  assert.equal(game.findBoardCard(1, second.instanceId)?.defense, 2);
  assert.equal(game.findBoardCard(1, second.instanceId)?.maxDefense, 2);
});

test("Codex-style targeted defense reduction destroys a follower reduced to zero", () => {
  const game = readyGame();
  const source = replaceHandCard(game, {
    id: "izudia-annihilation-manifest",
    name: "Izudia, Annihilation Manifest",
    class: "Forestcraft",
    type: "Follower",
    cost: 0,
    attack: 5,
    defense: 5,
    keywords: ["Fanfare"],
    text: "Fanfare: Select an enemy follower on the field and give it -0/-6."
  });
  const target = enemyFollower(game, { id: "debuff-lethal", attack: 7, defense: 6 });
  const beforeShadows = game.players[1].resources.shadows;

  const action = game.listLegalActions(0).find(item => item.type === "play-card"
    && item.cardInstanceId === source.instanceId
    && item.targetInstanceId === target.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, target.instanceId), null);
  assert.equal(game.players[1].resources.shadows, beforeShadows + 1);
});

test("Divine Thunder destroys a random highest-attack follower before its area damage", () => {
  const game = readyGame({ playerClass: "Neutral" });
  const source = replaceHandCard(game, {
    id: "divine-thunder",
    name: "Divine Thunder",
    class: "Neutral",
    type: "Spell",
    cost: 0,
    attack: 0,
    defense: 0,
    keywords: [],
    text: "Destroy a random enemy follower with the highest attack. Deal 1 damage to all enemy followers."
  });
  const highest = enemyFollower(game, { id: "highest-first", attack: 8, defense: 5 });
  const low = enemyFollower(game, { id: "low-second", attack: 2, defense: 1 });
  const start = game.events.length;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: source.instanceId });

  assert.equal(game.findBoardCard(1, highest.instanceId), null);
  assert.equal(game.findBoardCard(1, low.instanceId), null);
  const destroyed = game.events.slice(start)
    .filter(event => event.type === BATTLE_EVENT.FOLLOWER_DESTROYED)
    .map(event => event.payload?.card?.name);
  assert.deepEqual(destroyed.slice(0, 2), [highest.card.name, low.card.name]);
});

test("highest-attack random selection is restricted to followers tied for the maximum", () => {
  const game = readyGame({ playerClass: "Neutral" });
  const source = replaceHandCard(game, {
    id: "highest-tie-spell",
    name: "Highest Tie Spell",
    class: "Neutral",
    type: "Spell",
    cost: 0,
    attack: 0,
    defense: 0,
    keywords: [],
    text: "Destroy a random enemy follower with the highest attack."
  });
  const low = enemyFollower(game, { id: "highest-low", attack: 3, defense: 3 });
  const highA = enemyFollower(game, { id: "highest-a", attack: 7, defense: 3 });
  const highB = enemyFollower(game, { id: "highest-b", attack: 7, defense: 3 });
  game.rng = () => 0.99;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: source.instanceId });

  assert.ok(game.findBoardCard(1, low.instanceId));
  assert.ok(game.findBoardCard(1, highA.instanceId));
  assert.equal(game.findBoardCard(1, highB.instanceId), null);
});

test("Fate of the World draws before destroying the current highest-attack follower", () => {
  const game = readyGame({ playerClass: "Neutral" });
  const source = replaceHandCard(game, {
    id: "fate-of-world",
    name: "Fate of the World",
    class: "Neutral",
    type: "Spell",
    cost: 0,
    attack: 0,
    defense: 0,
    keywords: ["Enhance"],
    text: "Draw 2 cards. Destroy a random enemy follower with the highest attack.\nEnhance (10): Deal 4 damage to all enemies."
  });
  const target = enemyFollower(game, { id: "fate-highest", attack: 9, defense: 4 });
  const start = game.events.length;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: source.instanceId });

  assert.equal(game.findBoardCard(1, target.instanceId), null);
  const relevant = game.events.slice(start).filter(event => event.type === BATTLE_EVENT.DRAW || event.type === BATTLE_EVENT.FOLLOWER_DESTROYED);
  const firstDestroy = relevant.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_DESTROYED);
  const drawsBeforeDestroy = relevant.slice(0, firstDestroy).filter(event => event.type === BATTLE_EVENT.DRAW);
  assert.equal(drawsBeforeDestroy.length, 2);
});
