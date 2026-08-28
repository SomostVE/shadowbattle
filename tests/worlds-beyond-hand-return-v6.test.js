import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { returnWorldsBeyondHandCardToDeck } from "../src/core/rulesets/svwb/hand-return.js";

function card(id, {
  name = String(id),
  className = "Neutral",
  type = "Follower",
  cost = 1,
  attack = 1,
  defense = 1,
  text = "",
  traits = [],
  keywords = []
} = {}) {
  return { id, name, class: className, type, cost, attack, defense, text, traits, keywords };
}

const FAIRY = card(90011110, {
  name: "Fairy",
  className: "Forestcraft",
  attack: 1,
  defense: 1
});

const ELVEN_TRAPPER = card(10711120, {
  name: "Elven Trapper",
  className: "Forestcraft",
  cost: 1,
  text: "Fanfare: Select a card in your hand and return it to deck. Add 2 copies of Fairy to your hand."
});

const MOELLE = card(10811130, {
  name: "Moelle, Gloomy Maiden",
  className: "Forestcraft",
  cost: 1,
  text: "Fanfare: Select a card in your hand and return it to deck. Draw a card.\n\nWard",
  keywords: ["Fanfare", "Ward"]
});

const APPRENTICE_ASTROLOGER = card(10131120, {
  name: "Apprentice Astrologer",
  className: "Runecraft",
  cost: 2,
  attack: 2,
  defense: 2,
  text: "Fanfare: Select a card in your hand and return it to deck. Draw a card. Gain an earth sigil."
});

const MAID_REPLACEMENT = card("maid-replacement", {
  name: "Maid Replacement",
  className: "Swordcraft",
  type: "Spell",
  cost: 2,
  text: "Select a card in your hand and return it to deck. Draw 2 Swordcraft followers."
});

const RUNE_ARCHIVIST = card("rune-archivist", {
  name: "Rune Archivist",
  className: "Runecraft",
  cost: 2,
  attack: 2,
  defense: 2,
  text: "Fanfare: Select a card in your hand and return it to deck. Draw a spell."
});

const EARRINGS_OF_SUNLIGHT = card("earrings-of-sunlight", {
  name: "Earrings of Sunlight",
  className: "Havencraft",
  type: "Amulet",
  cost: 2,
  attack: 0,
  defense: 0,
  text: "Fanfare: Select a card in your hand and return it to deck. Draw a card.\n\nEngage: Destroy this card. Replicate the effects of this card's Fanfare ability."
});

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { name: `${prefix} ${index}`, cost: 9 }));
}

function readyGame(cardCatalog = []) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "hand-return-v6",
    firstPlayer: 0,
    cardCatalog,
    players: [
      { name: "Human", className: "Forestcraft", deck: fillerDeck("A") },
      { name: "CPU", className: "Neutral", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceInstance(instance, definition) {
  instance.card = definition;
  instance.cardId = definition.id;
  return instance;
}

function installHand(game, definitions) {
  while (game.players[0].hand.length < definitions.length) {
    const moved = game.players[0].deck.shift();
    assert.ok(moved);
    game.players[0].hand.push(moved);
  }
  game.players[0].hand = game.players[0].hand.slice(0, definitions.length);
  return definitions.map((definition, index) => replaceInstance(game.players[0].hand[index], definition));
}

function installDeckCard(game, index, definition) {
  assert.ok(game.players[0].deck[index]);
  return replaceInstance(game.players[0].deck[index], definition);
}

function playActionsFor(game, source) {
  return game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
}

test("hand return moves the same modified instance into deck without creating a Shadow", () => {
  const game = readyGame();
  const [source, selected] = installHand(game, [MOELLE, card("modified-card", { name: "Modified Card", cost: 8 })]);
  selected.costDelta = -3;
  selected.spellboost = 4;
  game.players[0].resources.shadows = 2;
  game.rng = () => 0;

  const returned = returnWorldsBeyondHandCardToDeck(game, 0, selected.instanceId, { source });

  assert.equal(returned, selected);
  assert.equal(game.players[0].hand.includes(selected), false);
  assert.equal(game.players[0].deck[0], selected);
  assert.equal(game.players[0].deck[0].costDelta, -3);
  assert.equal(game.players[0].deck[0].spellboost, 4);
  assert.equal(game.players[0].resources.shadows, 2);
  const event = game.events.at(-1);
  assert.equal(event.type, BATTLE_EVENT.CARD_RETURNED);
  assert.equal(event.payload.sourceZone, "hand");
  assert.equal(event.payload.destination, "deck");
});

test("return-to-deck play actions require a hand selection only while a candidate exists", () => {
  const game = readyGame([MOELLE]);
  const [source, candidate] = installHand(game, [MOELLE, card("candidate", { name: "Candidate" })]);

  let actions = playActionsFor(game, source);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].discardInstanceId, candidate.instanceId);

  game.players[0].hand = [source];
  actions = playActionsFor(game, source);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].discardInstanceId, undefined);
});

test("Elven Trapper returns first, then adds both Fairies even from an otherwise full hand", () => {
  const filler = Array.from({ length: 7 }, (_, index) => card(`hand-${index}`, { name: `Hand ${index}` }));
  const game = readyGame([ELVEN_TRAPPER, FAIRY]);
  const definitions = [ELVEN_TRAPPER, card("return-me", { name: "Return Me" }), ...filler];
  const [source, selected] = installHand(game, definitions);
  assert.equal(game.players[0].hand.length, 9);

  const action = playActionsFor(game, source).find(item => item.discardInstanceId === selected.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].hand.filter(item => item.card?.name === "Fairy").length, 2);
  assert.equal(game.players[0].hand.length, 9);
  assert.equal(game.players[0].deck.includes(selected), true);
  assert.equal(game.events.some(event => event.type === BATTLE_EVENT.CARD_BURNED), false);
});

test("Apprentice Astrologer skips return when no other card exists and still draws plus gains an earth sigil", () => {
  const drawCard = card("astrologer-draw", { name: "Astrologer Draw" });
  const game = readyGame([APPRENTICE_ASTROLOGER]);
  const [source] = installHand(game, [APPRENTICE_ASTROLOGER]);
  installDeckCard(game, 0, drawCard);
  game.rng = () => 0;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  const actions = playActionsFor(game, source);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].discardInstanceId, undefined);

  game.dispatch(actions[0]);

  assert.equal(game.players[0].resources.earthSigils, 1);
  assert.equal(game.players[0].hand.some(item => item.card?.name === "Astrologer Draw"), true);
});

test("return-to-deck can be followed by Draw 2 Swordcraft followers", () => {
  const neutralReturn = card("neutral-return", { name: "Neutral Return" });
  const swordA = card("sword-a", { name: "Sword A", className: "Swordcraft" });
  const swordB = card("sword-b", { name: "Sword B", className: "Swordcraft" });
  const game = readyGame([MAID_REPLACEMENT]);
  const [source, selected] = installHand(game, [MAID_REPLACEMENT, neutralReturn]);
  installDeckCard(game, 0, swordA);
  installDeckCard(game, 1, swordB);
  game.rng = () => 0;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  const action = playActionsFor(game, source).find(item => item.discardInstanceId === selected.instanceId);
  assert.ok(action);
  game.dispatch(action);

  const drawnNames = game.players[0].hand.map(item => item.card?.name);
  assert.equal(drawnNames.includes("Sword A"), true);
  assert.equal(drawnNames.includes("Sword B"), true);
  assert.equal(game.players[0].deck.includes(selected), true);
});

test("return-to-deck composes with a trailing filtered spell draw", () => {
  const returned = card("rune-return", { name: "Rune Return", className: "Neutral" });
  const wantedSpell = card("wanted-spell", { name: "Wanted Spell", className: "Runecraft", type: "Spell" });
  const game = readyGame([RUNE_ARCHIVIST]);
  const [source, selected] = installHand(game, [RUNE_ARCHIVIST, returned]);
  installDeckCard(game, 0, wantedSpell);
  game.rng = () => 0;

  const action = playActionsFor(game, source).find(item => item.discardInstanceId === selected.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].hand.some(item => item.card?.name === "Wanted Spell"), true);
});

test("Earrings of Sunlight Engage replicates its Fanfare hand return and draw before destroying itself", () => {
  const returned = card("earrings-return", { name: "Earrings Return" });
  const drawCard = card("earrings-draw", { name: "Earrings Draw" });
  const game = readyGame([EARRINGS_OF_SUNLIGHT]);
  const [selected] = installHand(game, [returned]);
  installDeckCard(game, 0, drawCard);
  game.rng = () => 0.999999;

  const amulet = {
    instanceId: "0:earrings",
    owner: 0,
    cardId: EARRINGS_OF_SUNLIGHT.id,
    card: EARRINGS_OF_SUNLIGHT,
    countdown: null,
    engagedThisTurn: false
  };
  game.players[0].board.push(amulet);

  const support = getWorldsBeyondTriggerSupport(amulet, "engage", null, game.players[0]);
  assert.equal(support.supported, true);
  const action = game.listLegalActions(0).find(item => item.type === "engage" && item.amuletInstanceId === amulet.instanceId && item.discardInstanceId === selected.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].deck.includes(selected), true);
  assert.equal(game.players[0].hand.some(item => item.card?.name === "Earrings Draw"), true);
  assert.equal(game.findBoardCard(0, amulet.instanceId), null);
  const returnEvent = game.events.find(event => event.type === BATTLE_EVENT.CARD_RETURNED && event.payload?.card?.instanceId === selected.instanceId);
  assert.ok(returnEvent);
});
