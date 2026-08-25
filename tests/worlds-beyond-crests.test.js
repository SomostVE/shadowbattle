import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  WORLDS_BEYOND_CREST_LIMIT,
  gainWorldsBeyondCrest,
  getWorldsBeyondCrestCountdown,
  runWorldsBeyondCrestTurnStart
} from "../src/core/rulesets/svwb/crests.js";

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
    traits: [],
    text: ""
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "crest-test",
    firstPlayer: 0,
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function putInHand(game, slot, card) {
  const item = game.players[0].hand[slot];
  item.card = card;
  item.cardId = card.id;
  return item;
}

test("Worlds Beyond Crest limit and duplicate rules match V5", () => {
  const game = readyGame();
  const accepted = [];
  for (let index = 0; index < WORLDS_BEYOND_CREST_LIMIT + 1; index += 1) {
    accepted.push(gainWorldsBeyondCrest(game, 0, `QA Crest ${index}`, { id: 8000 + index, name: `QA Crest ${index}` }).gained);
  }
  assert.deepEqual(accepted, [true, true, true, true, true, false]);
  assert.equal(gainWorldsBeyondCrest(game, 0, "QA Crest 0", { id: 9000 }).reason, "duplicate");
  assert.equal(game.players[0].resources.crests.length, 5);
});

test("known V5 Crest countdowns are preserved while persistent Crests stay null", () => {
  assert.equal(getWorldsBeyondCrestCountdown("Supplicant of Repose"), 4);
  assert.equal(getWorldsBeyondCrestCountdown("Octrice, Hollowness Manifest"), 8);
  assert.equal(getWorldsBeyondCrestCountdown("Lilanthim, Anathema of Predation"), 1);
  assert.equal(getWorldsBeyondCrestCountdown("Mjerrabaine, Great Manifest"), null);
  assert.equal(getWorldsBeyondCrestCountdown("Milteo & Luzen"), null);
});

test("Crests do not tick on the turn they are gained", () => {
  const game = readyGame();
  const result = gainWorldsBeyondCrest(game, 0, "Supplicant of Repose", { id: 8101, name: "Supplicant of Repose" });
  assert.equal(result.crest.countdown, 4);
  const cursor = game.eventSequence;

  runWorldsBeyondCrestTurnStart(game, 0);
  assert.equal(result.crest.countdown, 4);
  assert.equal(game.getEvents({ since: cursor, viewer: 0 }).some(event => event.type === BATTLE_EVENT.CREST_TICK), false);

  game.players[0].personalTurn += 1;
  runWorldsBeyondCrestTurnStart(game, 0);
  assert.equal(result.crest.countdown, 3);
});

test("Crest start effects resolve in acquisition order before Countdown and expiration", () => {
  const game = readyGame();
  const first = gainWorldsBeyondCrest(game, 0, "Gildaria, Anathema of Attunement", { id: 8201, name: "Gildaria, Anathema of Attunement" }).crest;
  const second = gainWorldsBeyondCrest(game, 0, "Lilanthim, Anathema of Predation", { id: 8202, name: "Lilanthim, Anathema of Predation" }).crest;
  game.players[0].personalTurn += 1;
  const callbackOrder = [];
  const cursor = game.eventSequence;

  runWorldsBeyondCrestTurnStart(game, 0, {
    beforeTick(crest) { callbackOrder.push(`start:${crest.name}`); },
    onExpire(crest) { callbackOrder.push(`expire:${crest.name}`); }
  });

  assert.deepEqual(callbackOrder, [
    `start:${first.name}`,
    `start:${second.name}`,
    `expire:${first.name}`,
    `expire:${second.name}`
  ]);
  assert.equal(game.players[0].resources.crests.length, 0);

  const events = game.getEvents({ since: cursor, viewer: 0 });
  assert.deepEqual(events.map(event => event.type), [
    BATTLE_EVENT.CREST_TICK,
    BATTLE_EVENT.CREST_TICK,
    BATTLE_EVENT.CREST_EXPIRED,
    BATTLE_EVENT.CREST_EXPIRED
  ]);
  assert.deepEqual(events.filter(event => event.type === BATTLE_EVENT.CREST_TICK).map(event => event.payload.crest.name), [first.name, second.name]);
});

test("Gain Crest card text creates a real public Crest through GameSession", () => {
  const game = readyGame();
  const card = {
    id: 8301,
    name: "QA Crest Spell",
    class: "Havencraft",
    type: "Spell",
    cost: 0,
    keywords: [],
    traits: [],
    text: "Gain Crest: Supplicant of Repose."
  };
  const item = putInHand(game, 0, card);
  const play = game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === item.instanceId);
  assert.ok(play);
  game.dispatch(play);

  assert.equal(game.players[0].resources.crests.length, 1);
  assert.equal(game.players[0].resources.crests[0].name, "Supplicant of Repose");
  assert.equal(game.players[0].resources.crests[0].countdown, 4);
  assert.equal(game.getEvents({ viewer: 0 }).some(event => event.type === BATTLE_EVENT.CREST_GAINED), true);
});
