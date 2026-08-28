import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  getWorldsBeyondDiscardReactionSpec,
  stripWorldsBeyondDiscardReactionText
} from "../src/core/rulesets/svwb/discard-reactions.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { baseText } from "../src/core/rulesets/svwb/v5/battle-engine-v5-text.js";

const CARDS = Object.freeze({
  discardSpell: {
    id: 88001,
    name: "Discard Test",
    class: "Dragoncraft",
    type: "Spell",
    cost: 1,
    traits: [],
    keywords: [],
    text: "Select a card in your hand and discard it. Draw a card."
  },
  vorlalai: {
    id: 10644120,
    name: "Vorlalai, Eld Blades",
    class: "Dragoncraft",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 2,
    traits: ["Encroacher"],
    keywords: ["Bane"],
    text: "When this card is discarded, summon a Vorlalai, Eld Blades.\n\nBane\n\nEvolve: Add a Depths of the Eld Blades to your hand.\nSuper-Evolve: Add 3 copies instead."
  },
  depths: {
    id: 90044330,
    name: "Depths of the Eld Blades",
    class: "Dragoncraft",
    type: "Spell",
    cost: 2,
    traits: ["Encroacher"],
    keywords: [],
    text: "When this card is discarded, deal 1 damage to the enemy leader and restore 1 defense to your leader.\n\nDeal 1 damage to the enemy leader. Restore 1 defense to your leader."
  },
  kit: {
    id: 10142110,
    name: "Kit, Luxfang Champion",
    class: "Dragoncraft",
    type: "Follower",
    cost: 6,
    attack: 5,
    defense: 5,
    traits: [],
    keywords: ["Rush"],
    text: "When this card is discarded, give a random allied follower on the field +1/+0.\n\nRush"
  },
  advent: {
    id: 10641310,
    name: "Advent of the Eld Blades",
    class: "Dragoncraft",
    type: "Spell",
    cost: 4,
    traits: ["Encroacher"],
    keywords: [],
    text: "When this card is discarded, if its cost is 4, add an Advent of the Eld Blades to your hand and set its cost to 2.\n\nSelect an allied follower on the field and give it +2/+2."
  },
  vanilla: {
    id: 88002,
    name: "Training Dragon",
    class: "Dragoncraft",
    type: "Follower",
    cost: 1,
    attack: 2,
    defense: 3,
    traits: [],
    keywords: [],
    text: ""
  }
});

const CATALOG = Object.freeze(Object.values(CARDS));

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    traits: [],
    keywords: [],
    text: ""
  }));
}

function readyGame(seed = "discard-reactions-v6") {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed,
    firstPlayer: 0,
    cardCatalog: CATALOG,
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function putInHand(game, slot, card, overrides = {}) {
  const instance = game.players[0].hand[slot];
  instance.card = card;
  instance.cardId = card.id;
  instance.costDelta = Number(overrides.costDelta ?? 0);
  instance.attackBonus = Number(overrides.attackBonus ?? 0);
  instance.defenseBonus = Number(overrides.defenseBonus ?? 0);
  return instance;
}

function putOnBoard(game, card, suffix) {
  const instance = {
    instanceId: `board:${suffix}`,
    owner: 0,
    cardId: card.id,
    card,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0,
    attack: Number(card.attack ?? 0),
    defense: Number(card.defense ?? 0),
    maxDefense: Number(card.defense ?? 0),
    playedTurn: Math.max(0, game.turn - 1),
    evolved: false,
    superEvolved: false,
    attacksRemaining: 1,
    canAttackFollowers: true,
    canAttackLeader: true
  };
  game.players[0].board.push(instance);
  return instance;
}

function discardAction(game, source, discarded) {
  return game.listLegalActions(0).find(action =>
    action.type === "play-card"
    && action.cardInstanceId === source.instanceId
    && action.discardInstanceId === discarded.instanceId
  ) ?? null;
}

test("supported discard reaction grammar is separated from normal play text without hiding unsupported cost conditions", () => {
  const vorlalaiSpec = getWorldsBeyondDiscardReactionSpec({ card: CARDS.vorlalai });
  assert.equal(vorlalaiSpec?.kind, "discard-summon");
  assert.equal(vorlalaiSpec?.cardName, "Vorlalai, Eld Blades");
  assert.equal(baseText(CARDS.vorlalai.text), "");
  assert.equal(baseText(CARDS.kit.text), "");
  assert.equal(baseText(CARDS.depths.text), "Deal 1 damage to the enemy leader. Restore 1 defense to your leader.");

  assert.equal(getWorldsBeyondDiscardReactionSpec({ card: CARDS.advent }), null);
  assert.equal(stripWorldsBeyondDiscardReactionText(CARDS.advent.text), CARDS.advent.text);
});

test("Vorlalai discard moves the original to cemetery before summoning a fresh Bane follower", () => {
  const game = readyGame();
  const source = putInHand(game, 0, CARDS.discardSpell);
  const discarded = putInHand(game, 1, CARDS.vorlalai);
  const action = discardAction(game, source, discarded);
  assert.ok(action);

  game.dispatch(action);

  assert.equal(game.players[0].cemetery.some(item => item.instanceId === discarded.instanceId), true);
  const summoned = game.players[0].board.find(item => item.card?.name === CARDS.vorlalai.name);
  assert.ok(summoned);
  assert.notEqual(summoned.instanceId, discarded.instanceId);
  assert.equal(summoned.card.keywords.includes("Bane"), true);
  assert.equal(game.players[0].resources.rally, 1);
  assert.equal(game.players[0].resources.shadows, 2, "discarded card and cast spell each create one Shadow");

  const events = game.getEvents({ viewer: 0 });
  const discardIndex = events.findIndex(event => event.type === BATTLE_EVENT.CARD_DISCARDED && event.payload?.card?.instanceId === discarded.instanceId);
  const triggerIndex = events.findIndex(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.trigger === "discard" && event.payload?.card?.instanceId === discarded.instanceId);
  const enterIndex = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_ENTER && event.payload?.card?.name === CARDS.vorlalai.name);
  const postDiscardDrawIndex = events.findIndex((event, index) => index > discardIndex && event.type === BATTLE_EVENT.DRAW);
  assert.ok(discardIndex >= 0 && triggerIndex > discardIndex && enterIndex > triggerIndex);
  assert.ok(postDiscardDrawIndex > enterIndex, "discard reaction resolves before the source spell continues to Draw");
});

test("Vorlalai discard resolves safely with a full allied board", () => {
  const game = readyGame("discard-full-board");
  for (let index = 0; index < 5; index += 1) putOnBoard(game, CARDS.vanilla, index);
  const source = putInHand(game, 0, CARDS.discardSpell);
  const discarded = putInHand(game, 1, CARDS.vorlalai);
  const action = discardAction(game, source, discarded);
  assert.ok(action);

  game.dispatch(action);
  assert.equal(game.players[0].board.length, 5);
  assert.equal(game.players[0].cemetery.some(item => item.instanceId === discarded.instanceId), true);
  const trigger = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.trigger === "discard");
  assert.equal(trigger?.payload?.resolved, true);
  assert.equal(trigger?.payload?.applied, false);
});

test("Depths of the Eld Blades discard deals 1 and heals 1 through normal V6 leader events", () => {
  const game = readyGame("discard-depths");
  game.players[0].hp = 15;
  const source = putInHand(game, 0, CARDS.discardSpell);
  const discarded = putInHand(game, 1, CARDS.depths);
  const action = discardAction(game, source, discarded);
  assert.ok(action);

  game.dispatch(action);
  assert.equal(game.players[1].hp, 19);
  assert.equal(game.players[0].hp, 16);

  const events = game.getEvents({ viewer: 0 });
  assert.equal(events.filter(event => event.type === BATTLE_EVENT.LEADER_DAMAGE && event.payload?.reason === "discard-reaction").length, 1);
  assert.equal(events.filter(event => event.type === BATTLE_EVENT.HEAL && event.payload?.reason === "discard-reaction").length, 1);
});

test("Depths played normally resolves only its playable body once", () => {
  const game = readyGame("play-depths");
  game.players[0].hp = 15;
  const source = putInHand(game, 0, CARDS.depths);
  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true, support.residual);
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId);
  assert.ok(action);

  game.dispatch(action);
  assert.equal(game.players[1].hp, 19);
  assert.equal(game.players[0].hp, 16);
  assert.equal(game.getEvents({ viewer: 0 }).filter(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.trigger === "discard").length, 0);
});

test("Kit discard buffs one deterministic allied follower and safely no-ops without a follower", () => {
  const game = readyGame("discard-kit-one-target");
  const target = putOnBoard(game, CARDS.vanilla, "kit-target");
  const source = putInHand(game, 0, CARDS.discardSpell);
  const discarded = putInHand(game, 1, CARDS.kit);
  const action = discardAction(game, source, discarded);
  assert.ok(action);
  game.dispatch(action);
  assert.equal(target.attack, 3);
  assert.equal(target.defense, 3);
  assert.equal(game.getEvents({ viewer: 0 }).filter(event => event.type === BATTLE_EVENT.FOLLOWER_BUFF && event.payload?.reason === "discard-reaction").length, 1);

  const empty = readyGame("discard-kit-empty");
  const emptySource = putInHand(empty, 0, CARDS.discardSpell);
  const emptyDiscard = putInHand(empty, 1, CARDS.kit);
  const emptyAction = discardAction(empty, emptySource, emptyDiscard);
  assert.ok(emptyAction);
  assert.doesNotThrow(() => empty.dispatch(emptyAction));
  const trigger = empty.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.trigger === "discard");
  assert.equal(trigger?.payload?.resolved, true);
  assert.equal(trigger?.payload?.applied, false);
});
