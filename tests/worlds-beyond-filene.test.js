import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { hasWorldsBeyondKeyword } from "../src/core/rulesets/svwb/combat-readiness.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { baseText } from "../src/core/rulesets/svwb/v5/battle-engine-v5-text.js";

const FILENE = Object.freeze({
  id: 10244110,
  name: "Filene, Whitefrost Bloom",
  class: "Dragoncraft",
  type: "Follower",
  rarity: "Legendary",
  cost: 2,
  attack: 2,
  defense: 2,
  traits: [],
  keywords: ["Bane", "Evolve", "Fanfare", "Overflow", "Whitefrost Whisper"],
  text: "Fanfare: If you're in Overflow, add a Whitefrost Whisper to your hand.\n\nBane\n\nEvolve: Deal 1 damage to all enemy followers."
});

const WHITEFROST_WHISPER = Object.freeze({
  id: 90044310,
  name: "Whitefrost Whisper",
  class: "Dragoncraft",
  type: "Spell",
  cost: 1,
  attack: 0,
  defense: 0,
  keywords: []
});

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
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
    seed: `filene-${maxPp}`,
    firstPlayer: 0,
    cardCatalog: [FILENE, WHITEFROST_WHISPER],
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

function replaceHandCard(game, card) {
  const instance = game.players[0].hand[0];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

function enemyFollower(id, defense) {
  return {
    instanceId: id,
    owner: 1,
    cardId: id,
    card: { id, name: id, type: "Follower", cost: 1, attack: 0, defense, keywords: [] },
    attack: 0,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
}

test("trigger text stops before Filene's standalone Bane paragraph", () => {
  assert.equal(baseText(FILENE.text), "If you're in Overflow, add a Whitefrost Whisper to your hand.");
  assert.equal(baseText("Bane"), "");
  assert.equal(baseText("Rush\n\nAt the end of your turn, draw a card."), "");
});

test("Filene stays legal below Overflow without generating Whitefrost Whisper", () => {
  const game = readyGame(6);
  const fileneCard = replaceHandCard(game, FILENE);
  const support = getWorldsBeyondTriggerSupport(fileneCard, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.equal(support.conditionInactive, true);
  const handBefore = game.players[0].hand.length;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: fileneCard.instanceId });

  assert.equal(game.players[0].hand.length, handBefore - 1);
  assert.equal(game.players[0].hand.some(item => item.card?.id === WHITEFROST_WHISPER.id), false);
  const filene = game.players[0].board.find(unit => unit.instanceId === fileneCard.instanceId);
  assert.ok(filene);
  assert.equal(hasWorldsBeyondKeyword(filene, "Bane"), true);
});

test("Filene generates Whitefrost Whisper in Overflow", () => {
  const game = readyGame(7);
  const fileneCard = replaceHandCard(game, FILENE);
  const support = getWorldsBeyondTriggerSupport(fileneCard, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.equal(support.residual, "");
  const handBefore = game.players[0].hand.length;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: fileneCard.instanceId });

  assert.equal(game.players[0].hand.length, handBefore);
  assert.equal(game.players[0].hand.some(item => item.card?.id === WHITEFROST_WHISPER.id), true);
  const trigger = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.instanceId === fileneCard.instanceId && event.payload.trigger === "play");
  assert.equal(trigger?.payload.resolved, true);
  assert.equal(trigger?.payload.classMechanic, "overflow");
});

test("Filene Evolve deals 1 damage to every enemy follower after the passive-boundary fix", () => {
  const game = readyGame(7);
  const fileneCard = replaceHandCard(game, FILENE);
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: fileneCard.instanceId });
  const filene = game.players[0].board.find(unit => unit.instanceId === fileneCard.instanceId);
  game.players[1].board.push(enemyFollower("fragile", 1), enemyFollower("sturdy", 3));
  game.players[0].resources.evolutionAvailable = true;
  game.players[0].resources.evolutionPoints = 2;

  game.dispatch({ type: "evolve", player: 0, followerInstanceId: filene.instanceId });

  assert.equal(game.players[1].board.some(unit => unit.instanceId === "fragile"), false);
  assert.equal(game.players[1].board.find(unit => unit.instanceId === "sturdy")?.defense, 2);
  assert.equal(game.players[1].resources.shadows, 1);
  const trigger = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.instanceId === filene.instanceId && event.payload.trigger === "evolve");
  assert.equal(trigger?.payload.resolved, true);
});
