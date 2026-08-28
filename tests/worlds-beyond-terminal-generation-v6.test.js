import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

function card(id, {
  name = String(id),
  className = "Neutral",
  type = "Follower",
  cost = 1,
  attack = 1,
  defense = 1,
  text = ""
} = {}) {
  return { id, name, class: className, type, cost, attack, defense, text, keywords: [], traits: [] };
}

const DEEPWOOD_BOUNTY = card(90011310, {
  name: "Deepwood Bounty",
  className: "Forestcraft",
  type: "Spell",
  cost: 0,
  attack: 0,
  defense: 0,
  text: "Restore 1 defense to your leader."
});

const FAIRY = card(90011110, {
  name: "Fairy",
  className: "Forestcraft",
  cost: 1,
  attack: 1,
  defense: 1
});

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { cost: 9 }));
}

function readyGame(cardCatalog = []) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "terminal-generation-v6",
    firstPlayer: 0,
    cardCatalog,
    players: [
      { name: "Human", className: "Forestcraft", deck: deck("A") },
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

function installHandCard(game, definition) {
  const instance = game.players[0].hand[0];
  instance.card = definition;
  instance.cardId = definition.id;
  return instance;
}

function fillHandToLimit(game) {
  const player = game.players[0];
  while (player.hand.length < game.ruleset.maxHandSize) player.hand.push(player.deck.shift());
}

function installNextDeckCard(game, definition) {
  const instance = game.players[0].deck[0];
  instance.card = definition;
  instance.cardId = definition.id;
  return instance;
}

function playAction(game, source) {
  return game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
}

function zoneHas(player, zone, name) {
  return player[zone].some(item => item.card?.name === name);
}

test("Fragrantwood-style prefix generation resolves before the following draw", () => {
  const sourceCard = card(10112310, {
    name: "Fragrantwood Whispers",
    className: "Forestcraft",
    type: "Spell",
    cost: 1,
    attack: 0,
    defense: 0,
    text: "Add a Deepwood Bounty to your hand. Draw a card."
  });
  const drawn = card("prefix-draw", { name: "Prefix Draw" });
  const game = readyGame([sourceCard, DEEPWOOD_BOUNTY]);
  const source = installHandCard(game, sourceCard);
  fillHandToLimit(game);
  installNextDeckCard(game, drawn);

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(zoneHas(game.players[0], "hand", "Deepwood Bounty"), true);
  assert.equal(zoneHas(game.players[0], "cemetery", "Prefix Draw"), true);
  assert.equal(zoneHas(game.players[0], "hand", "Prefix Draw"), false);
});

test("terminal single-card generation resolves after a preceding draw", () => {
  const sourceCard = card("terminal-add", {
    name: "Terminal Add",
    className: "Forestcraft",
    type: "Spell",
    cost: 1,
    attack: 0,
    defense: 0,
    text: "Draw a card. Add a Fairy to your hand."
  });
  const drawn = card("terminal-draw", { name: "Terminal Draw" });
  const game = readyGame([sourceCard, FAIRY]);
  const source = installHandCard(game, sourceCard);
  fillHandToLimit(game);
  installNextDeckCard(game, drawn);

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(zoneHas(game.players[0], "hand", "Terminal Draw"), true);
  assert.equal(zoneHas(game.players[0], "cemetery", "Fairy"), true);
  assert.equal(zoneHas(game.players[0], "hand", "Fairy"), false);
});

test("single-card generation in the middle of a compound effect remains unsupported", () => {
  const sourceCard = card("middle-add", {
    name: "Middle Add",
    className: "Forestcraft",
    type: "Spell",
    cost: 1,
    attack: 0,
    defense: 0,
    text: "Draw a card. Add a Fairy to your hand. Restore 1 defense to your leader."
  });
  const game = readyGame([sourceCard, FAIRY]);
  const source = installHandCard(game, sourceCard);

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, false);
  assert.match(support.residual, /add a fairy to your hand/i);
  assert.equal(playAction(game, source), undefined);
});
