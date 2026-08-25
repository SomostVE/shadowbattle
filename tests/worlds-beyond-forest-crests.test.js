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
    class: "Forestcraft",
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
    seed: "forest-crest-test",
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

test("Titania Crest adds a Fairy at the start of each later personal turn", () => {
  const fairy = { id: 9401, name: "Fairy", class: "Forestcraft", type: "Follower", cost: 1, attack: 1, defense: 1, keywords: [], traits: [], text: "" };
  const game = readyGame([fairy]);
  const result = gainWorldsBeyondCrest(game, 0, "Titania, Queen of Fairies", { id: 9402, name: "Titania, Queen of Fairies" });
  const handBefore = game.players[0].hand.length;
  const cursor = game.eventSequence;

  game.endTurn(0);
  game.endTurn(1);

  assert.equal(result.crest.countdown, null, "Titania is a persistent Crest");
  assert.equal(game.players[0].hand.some(item => item.card?.name === "Fairy"), true);
  assert.equal(game.players[0].hand.length, handBefore + 2, "Titania adds Fairy and normal turn start draws one card");
  const activation = game.getEvents({ since: cursor, viewer: 0 }).find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === "Titania, Queen of Fairies");
  assert.equal(activation?.payload.action, "turn-start");
  assert.equal(activation?.payload.generated, true);
});

test("Thestae Crest gives +1/+1 to every follower remaining in deck at Combo 3", () => {
  const game = readyGame();
  gainWorldsBeyondCrest(game, 0, "Thestae, Anathema of Distortion", { id: 9501, name: "Thestae, Anathema of Distortion" });
  game.players[0].cardsPlayedThisTurn = 3;
  const deck = [...game.players[0].deck];
  const cursor = game.eventSequence;

  game.endTurn(0);

  assert.ok(deck.length > 0);
  assert.equal(deck.every(item => item.attackBonus === 1 && item.defenseBonus === 1), true);
  const activation = game.getEvents({ since: cursor, viewer: 1 }).find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === "Thestae, Anathema of Distortion");
  assert.deepEqual(activation?.payload.deckFollowerBuff, { attack: 1, defense: 1 });
  assert.equal("buffedCount" in (activation?.payload ?? {}), false, "public event must not leak hidden deck composition");
});

test("Thestae Crest does nothing below Combo 3", () => {
  const game = readyGame();
  gainWorldsBeyondCrest(game, 0, "Thestae, Anathema of Distortion", { id: 9511, name: "Thestae, Anathema of Distortion" });
  game.players[0].cardsPlayedThisTurn = 2;
  const first = game.players[0].deck[0];
  const cursor = game.eventSequence;

  game.endTurn(0);

  assert.equal(first.attackBonus, 0);
  assert.equal(first.defenseBonus, 0);
  assert.equal(game.getEvents({ since: cursor, viewer: 0 }).some(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === "Thestae, Anathema of Distortion"), false);
});

test("Great Hart Crest adds Deepwood Bounty at Combo 3 without exposing hidden hand state", () => {
  const bounty = { id: 9601, name: "Deepwood Bounty", class: "Forestcraft", type: "Spell", cost: 1, keywords: [], traits: [], text: "" };
  const game = readyGame([bounty]);
  gainWorldsBeyondCrest(game, 0, "Great Hart of the Glacial Realm", { id: 9602, name: "Great Hart of the Glacial Realm" });
  game.players[0].cardsPlayedThisTurn = 3;
  const cursor = game.eventSequence;

  game.endTurn(0);

  assert.equal(game.players[0].hand.some(item => item.card?.name === "Deepwood Bounty"), true);
  const activation = game.getEvents({ since: cursor, viewer: 1 }).find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === "Great Hart of the Glacial Realm");
  assert.equal(activation?.payload.generated, true);
  assert.equal(activation?.payload.generatedCard, "Deepwood Bounty");
  assert.equal(JSON.stringify(game.getSnapshot(1)).includes("Deepwood Bounty"), false, "opponent snapshot keeps generated hand identity hidden");
});
