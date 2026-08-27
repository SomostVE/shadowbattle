import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { baseText } from "../src/core/rulesets/svwb/v5/battle-engine-v5-text.js";

function card(id, extra = {}) {
  return {
    id,
    name: String(id),
    class: "Havencraft",
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 1,
    text: "",
    keywords: [],
    ...extra
  };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { cost: 9 }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "amulet-v6-test",
    firstPlayer: 0,
    players: [
      { name: "A", className: "Havencraft", deck: deck("A") },
      { name: "B", className: "Dragoncraft", deck: deck("B") }
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
  return instance;
}

function playInstalledAmulet(game, definition) {
  const instance = installHandCard(game, definition);
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === instance.instanceId);
  assert.ok(action, `expected ${definition.name} to be playable`);
  game.dispatch(action);
  return game.players[0].board.find(item => item.instanceId === instance.instanceId);
}

function engageAction(game, amulet) {
  return game.listLegalActions(0).find(item => item.type === "engage" && item.amuletInstanceId === amulet.instanceId);
}

test("printed Countdown is setup metadata, not an unsupported play effect", () => {
  const text = "Countdown (3)\nLast Words: Draw a card.";
  assert.equal(baseText(text), "");
  const source = { instanceId: "0:countdown", card: card("countdown", { type: "Amulet", text }) };
  assert.equal(getWorldsBeyondTriggerSupport(source, "play").supported, true);
});

test("Engage can advance its own Countdown by a fixed amount", () => {
  const game = readyGame();
  const amulet = playInstalledAmulet(game, card(701, {
    name: "Countdown Lever",
    type: "Amulet",
    cost: 0,
    keywords: ["Engage"],
    text: "Countdown (3)\nEngage: Advance this amulet's count by 2."
  }));
  assert.equal(amulet.countdown, 3);

  const action = engageAction(game, amulet);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(0, amulet.instanceId)?.countdown, 1);
  const tick = game.getEvents({ viewer: 0 }).findLast(event => event.type === BATTLE_EVENT.COUNTDOWN_TICK && event.payload.card?.instanceId === amulet.instanceId);
  assert.equal(tick?.payload.amount, 2);
  assert.equal(tick?.payload.reason, "engage");
  assert.equal(tick?.payload.advanced, true);
});

test("Engage Countdown reaching zero destroys the source and resolves Last Words", () => {
  const game = readyGame();
  const shadowsBefore = Number(game.players[0].resources.shadows ?? 0);
  const amulet = playInstalledAmulet(game, card(702, {
    name: "Final Bell",
    type: "Amulet",
    cost: 0,
    keywords: ["Engage"],
    text: "Countdown (1)\nEngage: Advance this amulet's count by 1.\nLast Words: Deal 2 damage to the enemy leader."
  }));

  game.dispatch(engageAction(game, amulet));

  assert.equal(game.findBoardCard(0, amulet.instanceId), null);
  assert.ok(game.players[0].cemetery.some(item => item.instanceId === amulet.instanceId));
  assert.equal(game.players[0].resources.shadows, shadowsBefore + 1);
  assert.equal(game.players[1].hp, 18);
  const events = game.getEvents({ viewer: 0 });
  const tick = events.findIndex(event => event.type === BATTLE_EVENT.COUNTDOWN_TICK && event.payload.card?.instanceId === amulet.instanceId && event.payload.reason === "engage");
  const destroyed = events.findIndex((event, index) => index > tick && event.type === BATTLE_EVENT.AMULET_DESTROYED && event.payload.card?.instanceId === amulet.instanceId);
  const lastWords = events.findIndex((event, index) => index > destroyed && event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "last-words");
  assert.ok(tick >= 0 && destroyed > tick && lastWords > destroyed);
});

test("Engage X can use the current number of Crests", () => {
  const game = readyGame();
  game.players[0].resources.crests = [
    { id: "crest:a", name: "A" },
    { id: "crest:b", name: "B" }
  ];
  const amulet = playInstalledAmulet(game, card(703, {
    name: "Crest Clock",
    type: "Amulet",
    cost: 0,
    keywords: ["Engage"],
    text: "Countdown (4)\nEngage: Advance this amulet's count by X. X is the number of crests you have."
  }));

  game.dispatch(engageAction(game, amulet));
  assert.equal(game.findBoardCard(0, amulet.instanceId)?.countdown, 2);
});

test("Engage Destroy this card resolves its other effect before self-destruction", () => {
  const game = readyGame();
  game.players[0].hp = 15;
  const shadowsBefore = Number(game.players[0].resources.shadows ?? 0);
  const amulet = playInstalledAmulet(game, card(704, {
    name: "Disposable Chapel",
    type: "Amulet",
    cost: 0,
    keywords: ["Engage"],
    text: "Engage: Restore 2 defense to your leader. Destroy this card."
  }));

  game.dispatch(engageAction(game, amulet));
  assert.equal(game.players[0].hp, 17);
  assert.equal(game.findBoardCard(0, amulet.instanceId), null);
  assert.ok(game.players[0].cemetery.some(item => item.instanceId === amulet.instanceId));
  assert.equal(game.players[0].resources.shadows, shadowsBefore + 1);

  const events = game.getEvents({ viewer: 0 });
  const heal = events.findIndex(event => event.type === BATTLE_EVENT.HEAL && event.payload.source?.instanceId === amulet.instanceId);
  const destroyed = events.findIndex((event, index) => index > heal && event.type === BATTLE_EVENT.AMULET_DESTROYED && event.payload.card?.instanceId === amulet.instanceId);
  assert.ok(heal >= 0 && destroyed > heal);
});
