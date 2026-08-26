import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

const FEROCIOUS_FLAME = Object.freeze({
  id: 10343310,
  name: "Ferocious Flame",
  class: "Dragoncraft",
  type: "Spell",
  cost: 1,
  attack: 0,
  defense: 0,
  keywords: ["Overflow"],
  text: "Select an allied follower on the field and deal it 1 damage. Deal 3 damage to a random enemy follower. If you're in Overflow, draw a Dragoncraft follower."
});

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: []
  }));
}

function readyGame(maxPp) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: `ferocious-flame-${maxPp}`,
    firstPlayer: 0,
    players: [
      { name: "Dragon", className: "Dragoncraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = maxPp;
  return game;
}

function replaceHandCard(game) {
  const instance = game.players[0].hand[0];
  instance.card = FEROCIOUS_FLAME;
  instance.cardId = FEROCIOUS_FLAME.id;
  return instance;
}

function follower(instanceId, owner, name, defense) {
  return {
    instanceId,
    owner,
    cardId: instanceId,
    card: { id: instanceId, name, class: owner === 0 ? "Dragoncraft" : "Swordcraft", type: "Follower", cost: 1, attack: 1, defense, keywords: [] },
    attack: 1,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
}

function installSingleDragoncraftFollowerInDeck(game) {
  const item = game.players[0].deck[0];
  item.card = {
    id: "dragon-draw",
    name: "Dragon Draw Target",
    class: "Dragoncraft",
    type: "Follower",
    cost: 4,
    attack: 4,
    defense: 4,
    keywords: []
  };
  item.cardId = item.card.id;
  return item;
}

test("Ferocious Flame is legal only with an allied follower target", () => {
  const noTarget = readyGame(7);
  const noTargetSpell = replaceHandCard(noTarget);
  assert.equal(getWorldsBeyondTriggerSupport(noTargetSpell, "play", null, noTarget.players[0]).supported, true);
  assert.equal(noTarget.listLegalActions(0).some(action => action.type === "play-card" && action.cardInstanceId === noTargetSpell.instanceId), false);

  const game = readyGame(7);
  const spell = replaceHandCard(game);
  const ally = follower("ally", 0, "Allied Follower", 5);
  const enemy = follower("enemy", 1, "Enemy Follower", 5);
  game.players[0].board.push(ally);
  game.players[1].board.push(enemy);
  installSingleDragoncraftFollowerInDeck(game);

  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === spell.instanceId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].targetInstanceId, ally.instanceId);
  assert.equal(actions[0].targetKind, "damage");
  assert.equal(actions[0].targetAmount, 1);
});

test("Ferocious Flame resolves allied damage, random enemy damage, then filtered draw in text order", () => {
  const game = readyGame(7);
  const spell = replaceHandCard(game);
  const ally = follower("ally", 0, "Allied Follower", 5);
  const enemy = follower("enemy", 1, "Enemy Follower", 6);
  game.players[0].board.push(ally);
  game.players[1].board.push(enemy);
  const drawTarget = installSingleDragoncraftFollowerInDeck(game);
  const deckBefore = game.players[0].deck.length;

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId && item.targetInstanceId === ally.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(ally.defense, 4);
  assert.equal(enemy.defense, 3);
  assert.equal(game.players[0].deck.length, deckBefore - 1);
  assert.ok(game.players[0].hand.some(item => item.instanceId === drawTarget.instanceId));
  assert.equal(game.players[0].cemetery.some(item => item.instanceId === spell.instanceId), true);
  assert.equal(game.players[0].resources.shadows, 1, "resolved spell creates exactly one Shadow");

  const events = game.getEvents({ viewer: 0 });
  const damages = events.filter(event => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE);
  const allyDamageIndex = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE && event.payload.target?.instanceId === ally.instanceId);
  const enemyDamageIndex = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE && event.payload.target?.instanceId === enemy.instanceId);
  const filteredDrawIndex = events.findIndex(event => event.type === BATTLE_EVENT.DRAW && event.payload.cards?.some(card => card.instanceId === drawTarget.instanceId));
  assert.equal(damages.length, 2);
  assert.ok(allyDamageIndex >= 0);
  assert.ok(enemyDamageIndex > allyDamageIndex);
  assert.ok(filteredDrawIndex > enemyDamageIndex);

  const opponentEvents = game.getEvents({ viewer: 1 });
  const opponentDraw = opponentEvents.find(event => event.type === BATTLE_EVENT.DRAW && event.actor === 0 && event.sequence === events[filteredDrawIndex].sequence);
  assert.ok(opponentDraw);
  assert.equal(opponentDraw.payload.cards, undefined, "filtered draw identity stays hidden from the opponent");
});

test("Ferocious Flame outside Overflow keeps both damage clauses but does not tutor", () => {
  const game = readyGame(6);
  const spell = replaceHandCard(game);
  const ally = follower("ally", 0, "Allied Follower", 4);
  const enemy = follower("enemy", 1, "Enemy Follower", 5);
  game.players[0].board.push(ally);
  game.players[1].board.push(enemy);
  const drawTarget = installSingleDragoncraftFollowerInDeck(game);
  const deckBefore = game.players[0].deck.length;

  const support = getWorldsBeyondTriggerSupport(spell, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.doesNotMatch(support.text, /draw a Dragoncraft follower/i);
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId && item.targetInstanceId === ally.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(ally.defense, 3);
  assert.equal(enemy.defense, 2);
  assert.equal(game.players[0].deck.length, deckBefore);
  assert.equal(game.players[0].hand.some(item => item.instanceId === drawTarget.instanceId), false);
});
