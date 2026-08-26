import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

const CALL_OF_THE_MEGALORCA = Object.freeze({
  id: 10241310,
  name: "Call of the Megalorca",
  class: "Dragoncraft",
  type: "Spell",
  cost: 2,
  attack: 0,
  defense: 0,
  keywords: ["Call of the Megalorca", "Majestic Megalorca", "Overflow"],
  text: "Summon a Majestic Megalorca. If you're in Overflow, draw a Call of the Megalorca."
});

const MAJESTIC_MEGALORCA = Object.freeze({
  id: 90041130,
  name: "Majestic Megalorca",
  class: "Dragoncraft",
  type: "Follower",
  cost: 1,
  attack: 2,
  defense: 2,
  keywords: [],
  text: ""
});

const FAN_OF_OTOHIME = Object.freeze({
  id: 10143210,
  name: "Fan of Otohime",
  class: "Dragoncraft",
  type: "Amulet",
  cost: 1,
  attack: 0,
  defense: 0,
  keywords: ["Engage", "Otohime's Bodyguard"],
  text: "Engage (3): Summon an Otohime's Bodyguard. Select a card in your hand and discard it."
});

const OTOHIMES_BODYGUARD = Object.freeze({
  id: 90043110,
  name: "Otohime's Bodyguard",
  class: "Dragoncraft",
  type: "Follower",
  cost: 1,
  attack: 1,
  defense: 1,
  keywords: [],
  text: ""
});

const DOUBLE_SUMMON = Object.freeze({
  id: "double-summon",
  name: "Double Summon",
  class: "Dragoncraft",
  type: "Spell",
  cost: 0,
  attack: 0,
  defense: 0,
  keywords: [],
  text: "Summon 2 copies of Majestic Megalorca."
});

const PLAIN_FOLLOWER = Object.freeze({
  id: "plain-follower",
  name: "Plain Follower",
  class: "Dragoncraft",
  type: "Follower",
  cost: 1,
  attack: 2,
  defense: 2,
  keywords: [],
  text: ""
});

const CARD_CATALOG = [
  CALL_OF_THE_MEGALORCA,
  MAJESTIC_MEGALORCA,
  FAN_OF_OTOHIME,
  OTOHIMES_BODYGUARD,
  DOUBLE_SUMMON,
  PLAIN_FOLLOWER
];

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

function readyGame(maxPp = 10) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: `summon-${maxPp}`,
    firstPlayer: 0,
    cardCatalog: CARD_CATALOG,
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

function installDeckCard(game, card, index = 0) {
  const instance = game.players[0].deck[index];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

function boardFollower(instanceId, owner, defense = 2) {
  return {
    instanceId,
    owner,
    cardId: instanceId,
    card: { id: instanceId, name: instanceId, class: "Neutral", type: "Follower", cost: 1, attack: 1, defense, keywords: [], text: "" },
    attack: 1,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
}

function installFan(game) {
  const amulet = {
    instanceId: "fan-of-otohime",
    owner: 0,
    cardId: FAN_OF_OTOHIME.id,
    card: FAN_OF_OTOHIME,
    engagedThisTurn: false
  };
  game.players[0].board.push(amulet);
  return amulet;
}

test("FOLLOWER_ENTER increments Rally exactly once for a normally played follower", () => {
  const game = readyGame();
  const follower = replaceHandCard(game, PLAIN_FOLLOWER);
  assert.equal(game.players[0].resources.rally, 0);

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === follower.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].resources.rally, 1);
  assert.equal(game.getEvents({ viewer: 0 }).filter(event => event.type === BATTLE_EVENT.FOLLOWER_ENTER && event.actor === 0).length, 1);
});

test("Call of the Megalorca summons one token outside Overflow and does not tutor", () => {
  const game = readyGame(6);
  const spell = replaceHandCard(game, CALL_OF_THE_MEGALORCA);
  const deckCall = installDeckCard(game, CALL_OF_THE_MEGALORCA);

  const support = getWorldsBeyondTriggerSupport(spell, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.doesNotMatch(support.text, /draw a Call of the Megalorca/i);
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].board.filter(item => item.card?.name === "Majestic Megalorca").length, 1);
  assert.equal(game.players[0].resources.rally, 1);
  assert.equal(game.players[0].hand.some(item => item.instanceId === deckCall.instanceId), false);
});

test("Call of the Megalorca summons before its named tutor in Overflow", () => {
  const game = readyGame(7);
  const spell = replaceHandCard(game, CALL_OF_THE_MEGALORCA);
  const deckCall = installDeckCard(game, CALL_OF_THE_MEGALORCA);

  const support = getWorldsBeyondTriggerSupport(spell, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.match(support.text, /draw a Call of the Megalorca/i);
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].board.filter(item => item.card?.name === "Majestic Megalorca").length, 1);
  assert.ok(game.players[0].hand.some(item => item.instanceId === deckCall.instanceId));
  assert.equal(game.players[0].resources.rally, 1);

  const ownerEvents = game.getEvents({ viewer: 0 });
  const summonIndex = ownerEvents.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_ENTER && event.payload.card?.name === "Majestic Megalorca");
  const drawIndex = ownerEvents.findIndex(event => event.type === BATTLE_EVENT.DRAW && event.payload.cards?.some(card => card.instanceId === deckCall.instanceId));
  assert.ok(summonIndex >= 0);
  assert.ok(drawIndex > summonIndex);

  const sequence = ownerEvents[drawIndex].sequence;
  assert.equal(game.getEvents({ viewer: 1 }).some(event => event.sequence === sequence), false, "named tutor draw stays owner-private");
});

test("Summon respects board capacity and Rally counts only followers that actually enter", () => {
  const game = readyGame();
  const spell = replaceHandCard(game, DOUBLE_SUMMON);
  for (let index = 0; index < 4; index += 1) game.players[0].board.push(boardFollower(`occupied-${index}`, 0));

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].board.length, 5);
  assert.equal(game.players[0].board.filter(item => item.card?.name === "Majestic Megalorca").length, 1);
  assert.equal(game.players[0].resources.rally, 1);
});

test("Fan of Otohime enumerates explicit discard variants and summons before discarding", () => {
  const game = readyGame();
  const fan = installFan(game);
  const handBefore = [...game.players[0].hand];
  const actions = game.listLegalActions(0).filter(action => action.type === "engage" && action.amuletInstanceId === fan.instanceId);

  assert.equal(actions.length, handBefore.length);
  assert.deepEqual(new Set(actions.map(action => action.discardInstanceId)), new Set(handBefore.map(card => card.instanceId)));
  assert.ok(actions.every(action => action.discardInstanceId));

  const chosen = actions[0];
  const ppBefore = game.players[0].resources.pp;
  game.dispatch(chosen);

  assert.equal(game.players[0].resources.pp, ppBefore - 3);
  assert.equal(fan.engagedThisTurn, true);
  assert.equal(game.players[0].board.some(item => item.card?.name === "Otohime's Bodyguard"), true);
  assert.equal(game.players[0].hand.some(item => item.instanceId === chosen.discardInstanceId), false);
  assert.equal(game.players[0].cemetery.some(item => item.instanceId === chosen.discardInstanceId), true);
  assert.equal(game.players[0].resources.shadows, 1);
  assert.equal(game.players[0].resources.rally, 1);

  const events = game.getEvents({ viewer: 0 });
  const summonIndex = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_ENTER && event.payload.card?.name === "Otohime's Bodyguard");
  const discardIndex = events.findIndex(event => event.type === BATTLE_EVENT.CARD_DISCARDED && event.payload.card?.instanceId === chosen.discardInstanceId);
  assert.ok(summonIndex >= 0);
  assert.ok(discardIndex > summonIndex);
});

test("Fan of Otohime rejects a missing discard before spending PP when the hand is not empty", () => {
  const game = readyGame();
  const fan = installFan(game);
  const ppBefore = game.players[0].resources.pp;
  const boardBefore = game.players[0].board.length;

  assert.throws(
    () => game.dispatch({ type: "engage", player: 0, amuletInstanceId: fan.instanceId }),
    /requires a card to discard/i
  );
  assert.equal(game.players[0].resources.pp, ppBefore);
  assert.equal(game.players[0].board.length, boardBefore);
  assert.equal(fan.engagedThisTurn, false);
});

test("Fan of Otohime remains legal with an empty hand and summons without discarding", () => {
  const game = readyGame();
  const fan = installFan(game);
  game.players[0].hand = [];

  const actions = game.listLegalActions(0).filter(action => action.type === "engage" && action.amuletInstanceId === fan.instanceId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].discardInstanceId, undefined);
  const ppBefore = game.players[0].resources.pp;
  game.dispatch(actions[0]);

  assert.equal(game.players[0].resources.pp, ppBefore - 3);
  assert.equal(game.players[0].board.some(item => item.card?.name === "Otohime's Bodyguard"), true);
  assert.equal(game.players[0].resources.rally, 1);
  assert.equal(game.players[0].resources.shadows, 0);
  assert.equal(game.getEvents({ viewer: 0 }).some(event => event.type === BATTLE_EVENT.CARD_DISCARDED), false);
  const ability = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.name === "Fan of Otohime");
  assert.equal(ability?.payload.resolved, true);
  assert.equal(ability?.payload.discardSkipped, true);
});
