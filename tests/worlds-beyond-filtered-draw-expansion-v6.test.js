import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function card(id, extra = {}) {
  return {
    id,
    name: id,
    class: "Neutral",
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 1,
    keywords: [],
    traits: [],
    text: "",
    ...extra
  };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { cost: 9 }));
}

function readyGame(playerClass = "Neutral") {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: `filtered-draw-${playerClass}`,
    firstPlayer: 0,
    players: [
      { name: "Human", className: playerClass, deck: deck("A") },
      { name: "CPU", className: "Neutral", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, definition, index = 0) {
  const instance = game.players[0].hand[index];
  assert.ok(instance);
  instance.card = definition;
  instance.cardId = definition.id;
  game.registerCardDefinitions([definition]);
  return instance;
}

function deckInstance(instanceId, definition, costDelta = 0) {
  return {
    instanceId,
    owner: 0,
    cardId: definition.id,
    card: definition,
    costDelta,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0
  };
}

function forceBoardFollower(game, definition) {
  const instance = game.players[0].hand.shift() ?? game.players[0].deck.shift();
  assert.ok(instance);
  instance.card = definition;
  instance.cardId = definition.id;
  instance.attack = Number(definition.attack ?? 0);
  instance.defense = Number(definition.defense ?? 0);
  instance.maxDefense = Number(definition.defense ?? 0);
  instance.playedTurn = game.turn - 1;
  instance.evolved = false;
  instance.superEvolved = false;
  instance.attacksRemaining = 1;
  instance.hasAttacked = false;
  game.players[0].board.push(instance);
  game.registerCardDefinitions([definition]);
  return instance;
}

test("Altaro-style Evolve draws a Neutral card without treating 'Neutral card' as a card name", () => {
  const game = readyGame("Neutral");
  const altaro = card("altaro", {
    name: "Altaro Superfan",
    attack: 2,
    defense: 2,
    keywords: ["Evolve"],
    text: "Evolve: Draw a Neutral card."
  });
  const source = forceBoardFollower(game, altaro);
  game.players[0].resources.evolutionAvailable = true;
  game.players[0].resources.evolutionPoints = 2;

  const neutral = card("neutral-draw", { name: "Neutral Draw", class: "Neutral", type: "Spell", cost: 4 });
  const forest = card("forest-stays", { name: "Forest Stays", class: "Forestcraft", type: "Follower", cost: 4 });
  game.players[0].deck = [
    deckInstance("neutral-draw-instance", neutral),
    deckInstance("forest-stays-instance", forest)
  ];

  const action = game.listLegalActions(0).find(item =>
    item.type === "evolve" && item.followerInstanceId === source.instanceId
  );
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].hand.some(item => item.instanceId === "neutral-draw-instance"), true);
  assert.equal(game.players[0].deck.some(item => item.instanceId === "forest-stays-instance"), true);
  assert.equal(game.getEvents({ viewer: 0 }).some(event =>
    event.type === BATTLE_EVENT.DRAW && event.payload?.cards?.some(item => item.instanceId === "neutral-draw-instance")
  ), true);
});

test("Workin' Grasshopper draws by printed base cost from X = Combo, not modified hand cost", () => {
  const game = readyGame("Forestcraft");
  const setup = replaceHandCard(game, card("setup", { class: "Forestcraft", type: "Spell", cost: 0 }), 0);
  const grasshopper = replaceHandCard(game, card("grasshopper", {
    name: "Workin' Grasshopper",
    class: "Forestcraft",
    cost: 0,
    keywords: ["Combo", "Fanfare"],
    text: "Fanfare: Draw an X-cost follower. X is your Combo."
  }), 1);

  const baseTwo = card("base-two", { name: "Base Two", class: "Forestcraft", cost: 2 });
  const modifiedToTwo = card("base-one", { name: "Base One", class: "Forestcraft", cost: 1 });
  game.players[0].deck = [
    deckInstance("base-two-instance", baseTwo, -1),
    deckInstance("base-one-instance", modifiedToTwo, 1)
  ];

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: setup.instanceId });
  assert.equal(game.players[0].cardsPlayedThisTurn, 1);
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: grasshopper.instanceId });

  assert.equal(game.players[0].cardsPlayedThisTurn, 2);
  assert.equal(game.players[0].hand.some(item => item.instanceId === "base-two-instance"), true);
  assert.equal(game.players[0].deck.some(item => item.instanceId === "base-one-instance"), true);
});
