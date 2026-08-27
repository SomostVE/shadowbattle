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

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "resource-draw-generation-v6",
    firstPlayer: 0,
    players: [
      { name: "A", deck: fillerDeck("A") },
      { name: "B", deck: fillerDeck("B") }
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
  game.registerCardDefinitions([card]);
  return instance;
}

function zoneCard(instanceId, owner, card) {
  return {
    instanceId,
    owner,
    cardId: card.id,
    card,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0
  };
}

function simpleCard(id, type, extra = {}) {
  return {
    id,
    name: extra.name ?? id,
    class: extra.class ?? "Neutral",
    type,
    cost: extra.cost ?? 1,
    attack: extra.attack ?? (type === "Follower" ? 1 : 0),
    defense: extra.defense ?? (type === "Follower" ? 1 : 0),
    keywords: extra.keywords ?? [],
    text: extra.text ?? ""
  };
}

test("super-evolution-unlocked conditions stay inactive before unlock and resolve after unlock", () => {
  const inactive = readyGame();
  inactive.players[0].resources.superEvolutionAvailable = false;
  const inactiveCard = replaceHandCard(inactive, simpleCard("super-evo-gate-off", "Follower", {
    cost: 0,
    keywords: ["Fanfare"],
    text: "Fanfare: If you've unlocked super-evolution, draw 1 card."
  }));
  const inactiveHandBefore = inactive.players[0].hand.length;
  inactive.dispatch({ type: "play-card", player: 0, cardInstanceId: inactiveCard.instanceId });
  assert.equal(inactive.players[0].hand.length, inactiveHandBefore - 1);

  const active = readyGame();
  active.players[0].resources.superEvolutionAvailable = true;
  const activeCard = replaceHandCard(active, simpleCard("super-evo-gate-on", "Follower", {
    cost: 0,
    keywords: ["Fanfare"],
    text: "Fanfare: If you've unlocked super-evolution, draw 1 card."
  }));
  const activeHandBefore = active.players[0].hand.length;
  active.dispatch({ type: "play-card", player: 0, cardInstanceId: activeCard.instanceId });
  assert.equal(active.players[0].hand.length, activeHandBefore, "the active branch must draw exactly one card");
});

test("Gain max play point raises only max PP and respects the ruleset cap", () => {
  const game = readyGame();
  game.players[0].resources.maxPp = 5;
  game.players[0].resources.pp = 3;
  const card = replaceHandCard(game, simpleCard("gain-max-pp", "Spell", {
    cost: 0,
    text: "Gain 1 max play point."
  }));

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  assert.equal(game.players[0].resources.maxPp, 6);
  assert.equal(game.players[0].resources.pp, 3, "gaining maximum PP must not recover current PP");

  const capped = replaceHandCard(game, simpleCard("gain-max-pp-cap", "Spell", {
    cost: 0,
    text: "Gain 2 max play points."
  }), 0);
  game.players[0].resources.maxPp = 10;
  game.players[0].resources.pp = 4;
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: capped.instanceId });
  assert.equal(game.players[0].resources.maxPp, 10);
  assert.equal(game.players[0].resources.pp, 4);
});

test("Draw 2 amulets draws only matching deck cards", () => {
  const game = readyGame();
  const drawCard = replaceHandCard(game, simpleCard("draw-amulets", "Spell", {
    cost: 0,
    text: "Draw 2 amulets."
  }));
  const amuletA = simpleCard("amulet-a", "Amulet");
  const amuletB = simpleCard("amulet-b", "Amulet");
  const follower = simpleCard("not-an-amulet", "Follower");
  game.players[0].deck = [
    zoneCard("deck-amulet-a", 0, amuletA),
    zoneCard("deck-follower", 0, follower),
    zoneCard("deck-amulet-b", 0, amuletB)
  ];

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: drawCard.instanceId });

  const names = game.players[0].hand.map(item => item.card?.name);
  assert.equal(names.includes("amulet-a"), true);
  assert.equal(names.includes("amulet-b"), true);
  assert.equal(names.includes("not-an-amulet"), false);
  assert.equal(game.players[0].deck.length, 1);
  assert.equal(game.players[0].deck[0].card?.name, "not-an-amulet");
  const draws = game.getEvents({ viewer: 0 }).filter(event => event.type === BATTLE_EVENT.DRAW && event.payload?.reason === "ability");
  assert.equal(draws.length, 2);
});

test("Draw a spell resolves after the explicit hand discard", () => {
  const game = readyGame();
  const source = replaceHandCard(game, simpleCard("discard-then-spell", "Follower", {
    cost: 0,
    keywords: ["Fanfare"],
    text: "Fanfare: Select a card in your hand and discard it. Draw a spell."
  }), 0);
  const discard = game.players[0].hand[1];
  const spell = simpleCard("filtered-spell", "Spell");
  const follower = simpleCard("filtered-follower", "Follower");
  game.players[0].deck = [
    zoneCard("deck-filtered-follower", 0, follower),
    zoneCard("deck-filtered-spell", 0, spell)
  ];

  const action = game.listLegalActions(0).find(item => item.type === "play-card"
    && item.cardInstanceId === source.instanceId
    && item.discardInstanceId === discard.instanceId);
  assert.ok(action, "the legal graph must bind an explicit discard before the filtered draw");
  game.dispatch(action);

  assert.equal(game.players[0].cemetery.some(item => item.instanceId === discard.instanceId), true);
  assert.equal(game.players[0].hand.some(item => item.card?.name === "filtered-spell"), true);
  assert.equal(game.players[0].deck.some(item => item.card?.name === "filtered-follower"), true);
  const events = game.getEvents({ viewer: 0 });
  const discardIndex = events.findIndex(event => event.type === BATTLE_EVENT.CARD_DISCARDED && event.payload?.card?.instanceId === discard.instanceId);
  const drawIndex = events.findIndex(event => event.type === BATTLE_EVENT.DRAW
    && event.payload?.reason === "ability"
    && event.payload?.cards?.some(card => card.name === "filtered-spell"));
  assert.ok(discardIndex >= 0 && drawIndex > discardIndex, "discard must resolve before drawing the filtered spell");
});

test("Add 2 copies creates unique generated cards and burns overflow for exactly one Shadow", () => {
  const game = readyGame();
  const source = replaceHandCard(game, simpleCard("fairy-generator", "Follower", {
    cost: 0,
    keywords: ["Fanfare", "Fairy"],
    text: "Fanfare: Add 2 copies of Fairy to your hand."
  }));
  const fairy = simpleCard("fairy-token", "Follower", {
    name: "Fairy",
    class: "Forestcraft",
    cost: 1,
    keywords: ["Fairy"]
  });
  game.registerCardDefinitions([fairy]);

  while (game.players[0].hand.length < game.ruleset.maxHandSize) {
    const index = game.players[0].hand.length;
    const filler = simpleCard(`hand-filler-${index}`, "Follower");
    game.players[0].hand.push(zoneCard(`hand-filler-instance-${index}`, 0, filler));
  }
  const shadowsBefore = game.players[0].resources.shadows;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: source.instanceId });

  const handFairies = game.players[0].hand.filter(item => item.card?.name === "Fairy");
  const burnedFairies = game.players[0].cemetery.filter(item => item.card?.name === "Fairy");
  assert.equal(handFairies.length, 1, "playing the source opens one hand slot for the first generated Fairy");
  assert.equal(burnedFairies.length, 1, "the second generated Fairy must burn when the hand is full again");
  assert.notEqual(handFairies[0].instanceId, burnedFairies[0].instanceId);
  assert.equal(game.players[0].resources.shadows, shadowsBefore + 1);
  assert.equal(game.getEvents({ viewer: 0 }).some(event => event.type === BATTLE_EVENT.CARD_BURNED && event.payload?.card?.name === "Fairy"), true);
});
