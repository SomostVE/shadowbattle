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
    seed: "burnite-heal-reaction-test",
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

function healingSpell(id) {
  return {
    id,
    name: `Healing Spell ${id}`,
    class: "Havencraft",
    type: "Spell",
    cost: 0,
    keywords: [],
    traits: [],
    text: "Restore 1 defense to your leader."
  };
}

function putInHand(game, slot, card) {
  const item = game.players[0].hand[slot];
  item.card = card;
  item.cardId = card.id;
  item.costDelta = 0;
  return item;
}

function play(game, item) {
  const action = game.listLegalActions(0).find(candidate => candidate.type === "play-card" && candidate.cardInstanceId === item.instanceId);
  assert.ok(action, `${item.card.name} should be playable`);
  game.dispatch(action);
}

test("Burnite Flame reacts to a zero-value heal while Ash waits for actual restored defense", () => {
  const game = readyGame();
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Flame", { id: 8921, name: "Burnite, Anathema of Flame" });
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Ash", { id: 8922, name: "Burnite, Anathema of Ash" });
  const first = putInHand(game, 0, healingSpell(8931));
  const second = putInHand(game, 1, healingSpell(8932));
  const third = putInHand(game, 2, healingSpell(8933));
  const cursor = game.eventSequence;

  assert.equal(game.players[0].hp, 20);
  play(game, first);
  assert.equal(game.players[0].hp, 19, "Flame reacts even though the healing action restored 0");

  play(game, second);
  assert.equal(game.players[0].hp, 19, "the second heal restores 1, then Ash reacts for 1 damage");

  play(game, third);
  assert.equal(game.players[0].hp, 20, "both Burnite heal reactions are exhausted for this turn");

  const activations = game.getEvents({ since: cursor, viewer: 0 })
    .filter(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.action === "after-heal");
  assert.deepEqual(activations.map(event => [event.payload.crest.name, event.payload.trigger]), [
    ["Burnite, Anathema of Flame", "healing-action"],
    ["Burnite, Anathema of Ash", "healing-restored"]
  ]);
});

test("Burnite heal reactions follow Crest acquisition order", () => {
  const game = readyGame();
  game.players[0].hp = 19;
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Ash", { id: 8961, name: "Burnite, Anathema of Ash" });
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Flame", { id: 8962, name: "Burnite, Anathema of Flame" });
  const heal = putInHand(game, 0, healingSpell(8963));
  const cursor = game.eventSequence;

  play(game, heal);

  const activations = game.getEvents({ since: cursor, viewer: 0 })
    .filter(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.action === "after-heal");
  assert.deepEqual(activations.map(event => event.payload.crest.name), [
    "Burnite, Anathema of Ash",
    "Burnite, Anathema of Flame"
  ]);
  assert.equal(game.players[0].hp, 18, "the restored defense is followed by both one-damage Crest reactions");
});

test("Burnite heal reaction limits reset naturally on the next personal turn", () => {
  const game = readyGame();
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Flame", { id: 8941, name: "Burnite, Anathema of Flame" });
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Ash", { id: 8942, name: "Burnite, Anathema of Ash" });
  const first = putInHand(game, 0, healingSpell(8951));
  play(game, first);

  game.endTurn(0);
  game.endTurn(1);
  assert.equal(game.activePlayer, 0);
  assert.equal(game.players[0].personalTurn, 2);
  const hpAfterBurniteStart = game.players[0].hp;
  const next = putInHand(game, 0, healingSpell(8952));
  const cursor = game.eventSequence;

  play(game, next);

  const activations = game.getEvents({ since: cursor, viewer: 0 })
    .filter(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.action === "after-heal");
  assert.deepEqual(activations.map(event => event.payload.crest.name), [
    "Burnite, Anathema of Flame",
    "Burnite, Anathema of Ash"
  ]);
  assert.equal(game.players[0].hp, hpAfterBurniteStart - 1, "heal 1 followed by two Burnite pings nets -1 defense");
});
