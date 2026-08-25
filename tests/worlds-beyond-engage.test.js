import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondEngageInfo } from "../src/core/rulesets/svwb/engage.js";

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Havencraft",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: []
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "engage-test",
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

function installHandCard(game, card) {
  const instance = game.players[0].hand[0];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

test("Engage parser preserves the official optional cost syntax", () => {
  assert.deepEqual(getWorldsBeyondEngageInfo({ card: { type: "Amulet", text: "Engage (2): Draw 1 card." } }), {
    cost: 2,
    text: "Draw 1 card."
  });
  assert.deepEqual(getWorldsBeyondEngageInfo({ card: { type: "Amulet", text: "Engage: Draw 1 card." } }), {
    cost: 0,
    text: "Draw 1 card."
  });
});

test("Engage spends PP, resolves once per turn and resets on the owner's next turn", () => {
  const game = readyGame();
  game.players[0].hp = 14;
  const card = installHandCard(game, {
    id: 601,
    name: "Engage Clinic",
    class: "Havencraft",
    type: "Amulet",
    cost: 0,
    keywords: ["Engage"],
    text: "Engage (2): Restore 3 defense to your leader."
  });
  game.dispatch(game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === card.instanceId));
  const amulet = game.players[0].board[0];
  const action = game.listLegalActions(0).find(item => item.type === "engage" && item.amuletInstanceId === amulet.instanceId);
  assert.ok(action);
  assert.equal(action.cost, 2);

  const eventStart = game.events.length;
  game.dispatch(action);
  assert.equal(game.players[0].resources.pp, 8);
  assert.equal(game.players[0].hp, 17);
  assert.equal(amulet.engagedThisTurn, true);
  assert.equal(game.listLegalActions(0).some(item => item.type === "engage" && item.amuletInstanceId === amulet.instanceId), false);

  const types = game.events.slice(eventStart).map(event => event.type);
  assert.ok(types.indexOf(BATTLE_EVENT.ENGAGE) >= 0);
  assert.ok(types.indexOf(BATTLE_EVENT.ABILITY_TRIGGER) > types.indexOf(BATTLE_EVENT.ENGAGE));
  assert.ok(types.indexOf(BATTLE_EVENT.HEAL) > types.indexOf(BATTLE_EVENT.ABILITY_TRIGGER));

  game.endTurn(0);
  game.endTurn(1);
  assert.equal(amulet.engagedThisTurn, false);
  assert.ok(game.listLegalActions(0).some(item => item.type === "engage" && item.amuletInstanceId === amulet.instanceId));
});

test("targeted Engage creates one legal branch per target and resolves only the selected follower", () => {
  const game = readyGame();
  const card = installHandCard(game, {
    id: 602,
    name: "Engage Cannon",
    class: "Havencraft",
    type: "Amulet",
    cost: 0,
    keywords: ["Engage"],
    text: "Engage (1): Deal 2 damage to an enemy follower."
  });
  game.dispatch(game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === card.instanceId));
  const amulet = game.players[0].board[0];
  for (const [id, defense] of [["target-a", 4], ["target-b", 5]]) {
    game.players[1].board.push({
      instanceId: id,
      owner: 1,
      cardId: id,
      card: { id, name: id, class: "Dragoncraft", type: "Follower", attack: 1, defense, keywords: [] },
      attack: 1,
      defense,
      maxDefense: defense
    });
  }

  const actions = game.listLegalActions(0).filter(item => item.type === "engage" && item.amuletInstanceId === amulet.instanceId);
  assert.equal(actions.length, 2);
  assert.deepEqual(new Set(actions.map(action => action.targetInstanceId)), new Set(["target-a", "target-b"]));
  game.dispatch(actions.find(action => action.targetInstanceId === "target-b"));
  assert.equal(game.findBoardCard(1, "target-a").defense, 4);
  assert.equal(game.findBoardCard(1, "target-b").defense, 3);
});

test("Engage is not legal when its PP cost cannot be paid", () => {
  const game = readyGame();
  const card = installHandCard(game, {
    id: 603,
    name: "Expensive Engage",
    class: "Havencraft",
    type: "Amulet",
    cost: 0,
    keywords: ["Engage"],
    text: "Engage (4): Draw 1 card."
  });
  game.dispatch(game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === card.instanceId));
  game.players[0].resources.pp = 3;
  assert.equal(game.listLegalActions(0).some(action => action.type === "engage"), false);
});
