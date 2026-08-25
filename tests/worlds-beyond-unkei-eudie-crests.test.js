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

function readyGame(extraCards = []) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "unkei-eudie-crest-test",
    firstPlayer: 0,
    cardCatalog: extraCards,
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.registerCardDefinitions(extraCards);
  return game;
}

test("Unkei Crest adds Glittering Gold at turn end without revealing hand identity", () => {
  const gold = { id: 9701, name: "Glittering Gold", class: "Swordcraft", type: "Spell", cost: 1, keywords: [], traits: ["Loot"], text: "" };
  const game = readyGame([gold]);
  gainWorldsBeyondCrest(game, 0, "Unkei, Goldbloom", { id: 9702, name: "Unkei, Goldbloom" });
  const cursor = game.eventSequence;

  game.endTurn(0);

  assert.equal(game.players[0].hand.some(item => item.card?.name === "Glittering Gold"), true);
  assert.equal(JSON.stringify(game.getSnapshot(1)).includes("Glittering Gold"), false);
  const activation = game.getEvents({ since: cursor, viewer: 1 }).find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === "Unkei, Goldbloom");
  assert.equal(activation?.payload.generated, true);
  assert.equal(activation?.payload.generatedCard, "Glittering Gold");
});

test("Eudie Crest draws one card at turn end when hand size is five or less and keeps the draw private", () => {
  const game = readyGame();
  gainWorldsBeyondCrest(game, 0, "Eudie, Maiden Reborn", { id: 9801, name: "Eudie, Maiden Reborn" });
  const handBefore = game.players[0].hand.length;
  assert.ok(handBefore <= 5);
  const cursor = game.eventSequence;

  game.endTurn(0);

  assert.equal(game.players[0].hand.length, handBefore + 1);
  const ownerDraw = game.getEvents({ since: cursor, viewer: 0 }).find(event => event.type === BATTLE_EVENT.DRAW && event.actor === 0 && event.payload.reason === "crest");
  assert.ok(ownerDraw?.payload.cards?.[0]?.name);
  const opponentDraw = game.getEvents({ since: cursor, viewer: 1 }).find(event => event.type === BATTLE_EVENT.DRAW && event.actor === 0 && event.payload.reason === "crest");
  assert.equal(opponentDraw, undefined);
  const activation = game.getEvents({ since: cursor, viewer: 1 }).find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === "Eudie, Maiden Reborn");
  assert.equal(activation?.payload.drewCard, true);
});

test("Eudie Crest heals above five cards and its heal chains into both Burnite Crests", () => {
  const game = readyGame();
  game.players[0].hand.push(game.players[0].deck.shift());
  assert.ok(game.players[0].hand.length > 5);
  game.players[0].hp = 10;
  gainWorldsBeyondCrest(game, 0, "Eudie, Maiden Reborn", { id: 9901, name: "Eudie, Maiden Reborn" });
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Flame", { id: 9902, name: "Burnite, Anathema of Flame" });
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Ash", { id: 9903, name: "Burnite, Anathema of Ash" });
  const cursor = game.eventSequence;

  game.endTurn(0);

  assert.equal(game.players[0].hp, 9, "Eudie restores 1, then Flame and Ash each deal 1");
  const events = game.getEvents({ since: cursor, viewer: 0 });
  const heal = events.find(event => event.type === BATTLE_EVENT.HEAL && event.payload.reason === "eudie-crest");
  assert.equal(heal?.payload.amount, 1);
  const burnite = events.filter(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.action === "after-heal");
  assert.deepEqual(burnite.map(event => event.payload.crest.name), ["Burnite, Anathema of Flame", "Burnite, Anathema of Ash"]);
  const eudie = events.find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === "Eudie, Maiden Reborn");
  assert.equal(eudie?.payload.leaderHealing, 1);
});
