import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { resolveWorldsBeyondPostDrawHandX } from "../src/core/rulesets/svwb/post-draw-hand-x.js";

const DEEPWOOD = Object.freeze({
  id: 10111130,
  name: "Deepwood Fairy Beast",
  class: "Forestcraft",
  type: "Follower",
  cost: 1,
  attack: 4,
  defense: 4,
  traits: [],
  keywords: ["Fanfare"],
  text: "Fanfare: Draw a card. Restore X defense to your leader. X is the number of cards in your hand."
});

function filler(id) {
  return {
    id,
    name: String(id),
    class: "Forestcraft",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    traits: [],
    keywords: [],
    text: ""
  };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => filler(`${prefix}-${index}`));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "post-draw-hand-x-v6",
    firstPlayer: 0,
    cardCatalog: [DEEPWOOD],
    players: [
      { name: "A", className: "Forestcraft", deck: deck("A") },
      { name: "B", className: "Forestcraft", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, definition, index = 0) {
  const instance = game.players[0].hand[index];
  instance.card = definition;
  instance.cardId = definition.id;
  instance.costDelta = 0;
  game.registerCardDefinitions([definition]);
  return instance;
}

function setHandSize(game, size) {
  const player = game.players[0];
  while (player.hand.length < size) player.hand.push(player.deck.shift());
  if (player.hand.length > size) player.hand = player.hand.slice(0, size);
  return player.hand.length;
}

function playAction(game, source) {
  const action = game.listLegalActions(0).find(item =>
    item.type === "play-card" && item.cardInstanceId === source.instanceId
  );
  assert.ok(action, "Deepwood must expose a supported play action");
  return action;
}

test("Deepwood post-draw hand-size X is structurally supported", () => {
  const game = readyGame();
  const source = replaceHandCard(game, DEEPWOOD);
  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);

  assert.equal(support.supported, true);
  assert.equal(support.residual, "");
  assert.match(support.text, /Draw a card/i);
  assert.match(support.text, /Restore defense to your leader equal to the number of cards in your hand/i);
  assert.doesNotMatch(support.text, /\bX\b/);
});

test("Deepwood follows the official nine-card ruling and heals after drawing", () => {
  const game = readyGame();
  const source = replaceHandCard(game, DEEPWOOD);
  setHandSize(game, 9);
  game.players[0].hp = 1;

  game.dispatch(playAction(game, source));

  assert.equal(game.players[0].hand.length, 9);
  assert.equal(game.players[0].hp, 10);

  const events = game.getEvents({ viewer: 0 });
  const abilityIndex = events.findIndex(event =>
    event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.card?.instanceId === source.instanceId
  );
  const drawIndex = events.findIndex((event, index) => index > abilityIndex && event.type === BATTLE_EVENT.DRAW);
  const healIndex = events.findIndex((event, index) =>
    index > drawIndex && event.type === BATTLE_EVENT.HEAL && event.payload?.source?.instanceId === source.instanceId
  );
  assert.ok(abilityIndex >= 0 && drawIndex > abilityIndex && healIndex > drawIndex);
  assert.equal(events[healIndex].payload.requestedAmount, 9);
  assert.equal(events[healIndex].payload.amount, 9);
});

test("Deepwood reads the smaller live hand size after its draw", () => {
  const game = readyGame();
  const source = replaceHandCard(game, DEEPWOOD);
  setHandSize(game, 3);
  game.players[0].hp = 1;

  game.dispatch(playAction(game, source));

  assert.equal(game.players[0].hand.length, 3);
  assert.equal(game.players[0].hp, 4);
  const heal = game.getEvents({ viewer: 0 }).find(event =>
    event.type === BATTLE_EVENT.HEAL && event.payload?.source?.instanceId === source.instanceId
  );
  assert.equal(heal?.payload?.requestedAmount, 3);
});

test("post-draw hand X preprocessing stays narrow to the migrated one-card draw grammar", () => {
  const drawTwo = "Draw 2 cards. Restore X defense to your leader. X is the number of cards in your hand.";
  const addFirst = "Add a Fairy to your hand. Restore X defense to your leader. X is the number of cards in your hand.";

  assert.equal(resolveWorldsBeyondPostDrawHandX(drawTwo), drawTwo);
  assert.equal(resolveWorldsBeyondPostDrawHandX(addFirst), addFirst);
});
