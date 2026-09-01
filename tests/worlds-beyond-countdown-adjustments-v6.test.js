import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { gainWorldsBeyondCrest, getWorldsBeyondCrests } from "../src/core/rulesets/svwb/crests.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

function card(id, extra = {}) {
  return {
    id,
    name: String(id),
    class: "Neutral",
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 1,
    text: "",
    keywords: [],
    traits: [],
    ...extra
  };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { cost: 9 }));
}

function readyGame(seed = "countdown-adjustments-v6") {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed,
    firstPlayer: 0,
    players: [
      { name: "A", deck: deck("A") },
      { name: "B", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.maxPp = 10;
  game.players[0].resources.pp = 10;
  return game;
}

function installHandCard(game, definition) {
  const instance = game.players[0].hand[0];
  instance.card = definition;
  instance.cardId = definition.id;
  game.registerCardDefinitions([definition]);
  return instance;
}

function playText(game, text, id = "countdown-spell") {
  const definition = card(id, { name: id, type: "Spell", cost: 0, text });
  const instance = installHandCard(game, definition);
  const support = getWorldsBeyondTriggerSupport(instance, "play", null, game.players[0]);
  assert.equal(support.supported, true, support.residual || `expected supported text: ${text}`);
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === instance.instanceId);
  assert.ok(action, `expected legal play for ${text}`);
  game.dispatch(action);
}

function boardAmulet(game, id, name, countdown) {
  const definition = card(id, { name, type: "Amulet", cost: 1, text: `Countdown (${countdown})` });
  game.registerCardDefinitions([definition]);
  const unit = {
    instanceId: `0:manual:${id}`,
    owner: 0,
    cardId: id,
    card: definition,
    countdown,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[0].board.push(unit);
  return unit;
}

test("specific Crest advance reduces Countdown without waiting for turn start", () => {
  const game = readyGame("crest-advance");
  gainWorldsBeyondCrest(game, 0, "Belial, Archangel of Cunning");

  playText(game, "Advance the count of your Crest Belial, Archangel of Cunning by 2.", "advance-belial");

  const crest = getWorldsBeyondCrests(game.players[0]).find(item => item.name === "Belial, Archangel of Cunning");
  assert.equal(crest?.countdown, 2);
});

test("advancing a Crest to zero expires it immediately and resolves Crest Last Words", () => {
  const game = readyGame("crest-expire");
  gainWorldsBeyondCrest(game, 0, "Maddening Benison");
  assert.equal(game.players[0].hp, 20);

  playText(game, "Advance the count of your Crest Maddening Benison by 2.", "expire-benison");

  assert.equal(getWorldsBeyondCrests(game.players[0]).some(item => item.name === "Maddening Benison"), false);
  assert.equal(game.players[0].hp, 10);
  const events = game.getEvents({ viewer: 0 });
  const advance = events.findIndex(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.action === "advance" && event.payload.crest?.name === "Maddening Benison");
  const expired = events.findIndex((event, index) => index > advance && event.type === BATTLE_EVENT.CREST_EXPIRED && event.payload.crest?.name === "Maddening Benison");
  const lastWords = events.findIndex((event, index) => index > expired && event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.action === "last-words" && event.payload.crest?.name === "Maddening Benison");
  assert.ok(advance >= 0 && expired > advance && lastWords > expired);
});

test("specific and all-Crest delay increase only finite Crest Countdowns", () => {
  const game = readyGame("crest-delay");
  gainWorldsBeyondCrest(game, 0, "Dragon's Vale Elder");
  gainWorldsBeyondCrest(game, 0, "Belial, Archangel of Cunning");
  gainWorldsBeyondCrest(game, 0, "Titania, Queen of Fairies");

  playText(game, "Delay the count of your Crest Dragon's Vale Elder by 2.", "delay-vale");
  playText(game, "Delay the counts of all your crests by 1.", "delay-all-crests");

  const byName = Object.fromEntries(getWorldsBeyondCrests(game.players[0]).map(crest => [crest.name, crest.countdown]));
  assert.equal(byName["Dragon's Vale Elder"], 5);
  assert.equal(byName["Belial, Archangel of Cunning"], 5);
  assert.equal(byName["Titania, Queen of Fairies"], null);
});

test("all allied named copies advance independently without touching other amulets", () => {
  const game = readyGame("named-amulet-advance");
  const first = boardAmulet(game, "flag-a", "Dread Pirate's Flag", 4);
  const second = boardAmulet(game, "flag-b", "Dread Pirate's Flag", 3);
  const other = boardAmulet(game, "other-amulet", "Other Amulet", 4);

  playText(game, "Advance the counts of all allied copies of Dread Pirate's Flag on the field by 2.", "advance-flags");

  assert.equal(game.findBoardCard(0, first.instanceId)?.countdown, 2);
  assert.equal(game.findBoardCard(0, second.instanceId)?.countdown, 1);
  assert.equal(game.findBoardCard(0, other.instanceId)?.countdown, 4);
});

test("random named allied amulet delay chooses exactly one exact-name copy", () => {
  const game = readyGame("random-amulet-delay");
  const first = boardAmulet(game, "rings-a", "Rings of Moonlight", 1);
  const second = boardAmulet(game, "rings-b", "Rings of Moonlight", 1);
  const other = boardAmulet(game, "rings-other", "Rings of Moonlights", 1);

  playText(game, "Delay the count of a random allied Rings of Moonlight on the field by 2.", "delay-rings");

  const matching = [first, second].map(unit => game.findBoardCard(0, unit.instanceId)?.countdown);
  assert.equal(matching.reduce((sum, value) => sum + value, 0), 4);
  assert.deepEqual([...matching].sort((a, b) => a - b), [1, 3]);
  assert.equal(game.findBoardCard(0, other.instanceId)?.countdown, 1);
});

test("Engage can delay the source amulet Countdown through the generic adjustment grammar", () => {
  const game = readyGame("self-amulet-delay");
  const definition = card("babelon-style", {
    name: "Babelon-style Clock",
    type: "Amulet",
    cost: 0,
    keywords: ["Engage"],
    text: "Countdown (2)\nEngage: Delay the count of this amulet by 2."
  });
  const instance = installHandCard(game, definition);
  const play = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === instance.instanceId);
  assert.ok(play);
  game.dispatch(play);
  const amulet = game.findBoardCard(0, instance.instanceId);
  assert.equal(amulet?.countdown, 2);

  const engage = game.listLegalActions(0).find(item => item.type === "engage" && item.amuletInstanceId === amulet.instanceId);
  assert.ok(engage);
  game.dispatch(engage);

  assert.equal(game.findBoardCard(0, amulet.instanceId)?.countdown, 4);
});
