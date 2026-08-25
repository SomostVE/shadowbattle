import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { gainWorldsBeyondCrest } from "../src/core/rulesets/svwb/crests.js";

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
    seed: "crest-turn-start-test",
    firstPlayer: 0,
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function nextOwnTurn(game) {
  game.endTurn(0);
  if (game.phase === "main") game.endTurn(1);
}

test("Burnite Ash and Flame Crests damage their owner at start of turn in acquisition order", () => {
  const game = readyGame();
  game.players[0].hp = 12;
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Ash", { id: 8901, name: "Burnite, Anathema of Ash" });
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Flame", { id: 8902, name: "Burnite, Anathema of Flame" });
  const cursor = game.eventSequence;

  nextOwnTurn(game);

  assert.equal(game.players[0].hp, 9);
  const activations = game.getEvents({ since: cursor, viewer: 0 })
    .filter(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.action === "turn-start");
  assert.deepEqual(activations.map(event => [event.payload.crest.name, event.payload.selfDamage]), [
    ["Burnite, Anathema of Ash", 2],
    ["Burnite, Anathema of Flame", 1]
  ]);
});

test("a lethal Burnite start-of-turn Crest stops later simultaneous Crest resolution", () => {
  const game = readyGame();
  game.players[0].hp = 2;
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Ash", { id: 8911, name: "Burnite, Anathema of Ash" });
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Flame", { id: 8912, name: "Burnite, Anathema of Flame" });
  const cursor = game.eventSequence;

  nextOwnTurn(game);

  assert.equal(game.players[0].hp, 0);
  assert.equal(game.winner, 1);
  const activations = game.getEvents({ since: cursor, viewer: 0 })
    .filter(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.action === "turn-start");
  assert.deepEqual(activations.map(event => event.payload.crest.name), ["Burnite, Anathema of Ash"]);
});
