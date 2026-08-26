import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

const RAGING_LIGHTNING = Object.freeze({
  id: 10341310,
  name: "Raging Lightning",
  class: "Dragoncraft",
  type: "Spell",
  cost: 3,
  attack: 0,
  defense: 0,
  keywords: ["Overflow"],
  text: "Deal 5 damage to all followers with the highest defense. If you're in Overflow, deal 3 damage to all leaders with the highest defense."
});

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: []
  }));
}

function readyGame(maxPp) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: `raging-lightning-${maxPp}`,
    firstPlayer: 0,
    players: [
      { name: "Dragon", className: "Dragoncraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = maxPp;
  return game;
}

function replaceHandCard(game, card = RAGING_LIGHTNING) {
  const instance = game.players[0].hand[0];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

function follower(instanceId, owner, name, defense, attack = 1) {
  return {
    instanceId,
    owner,
    cardId: instanceId,
    card: { id: instanceId, name, type: "Follower", cost: 1, attack, defense, keywords: [] },
    attack,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
}

function abilityEvent(game) {
  return game.getEvents({ viewer: 0 }).find(event =>
    event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.name === "Raging Lightning"
  );
}

test("Raging Lightning damages only followers tied for the highest defense outside Overflow", () => {
  const game = readyGame(6);
  const spell = replaceHandCard(game);
  const alliedHigh = follower("allied-high", 0, "Allied High", 8);
  const alliedLow = follower("allied-low", 0, "Allied Low", 4);
  const enemyHigh = follower("enemy-high", 1, "Enemy High", 8);
  const enemyLow = follower("enemy-low", 1, "Enemy Low", 7);
  game.players[0].board.push(alliedHigh, alliedLow);
  game.players[1].board.push(enemyHigh, enemyLow);

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

  assert.equal(alliedHigh.defense, 3);
  assert.equal(enemyHigh.defense, 3);
  assert.equal(alliedLow.defense, 4);
  assert.equal(enemyLow.defense, 7);
  assert.equal(game.players[0].hp, 20);
  assert.equal(game.players[1].hp, 20);
  assert.equal(abilityEvent(game)?.payload.resolved, true);
  assert.match(abilityEvent(game)?.payload.text ?? "", /highest defense\.$/i);
  assert.doesNotMatch(abilityEvent(game)?.payload.text ?? "", /all leaders/i);
});

test("Raging Lightning resolves both highest-defense groups in Overflow", () => {
  const game = readyGame(7);
  const spell = replaceHandCard(game);
  const alliedHigh = follower("allied-high", 0, "Allied High", 5);
  const alliedLow = follower("allied-low", 0, "Allied Low", 4);
  const enemyHigh = follower("enemy-high", 1, "Enemy High", 5);
  const enemyLow = follower("enemy-low", 1, "Enemy Low", 2);
  game.players[0].board.push(alliedHigh, alliedLow);
  game.players[1].board.push(enemyHigh, enemyLow);
  game.players[0].hp = 15;
  game.players[1].hp = 12;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

  assert.equal(game.findBoardCard(0, alliedHigh.instanceId), null);
  assert.equal(game.findBoardCard(1, enemyHigh.instanceId), null);
  assert.equal(game.findBoardCard(0, alliedLow.instanceId)?.defense, 4);
  assert.equal(game.findBoardCard(1, enemyLow.instanceId)?.defense, 2);
  assert.equal(game.players[0].hp, 12);
  assert.equal(game.players[1].hp, 12);
  assert.equal(game.players[0].resources.shadows, 2, "allied follower + resolved spell each create one Shadow");
  assert.equal(game.players[1].resources.shadows, 1, "destroyed enemy follower creates one Shadow for its owner");
  assert.equal(abilityEvent(game)?.payload.resolved, true);
  assert.match(abilityEvent(game)?.payload.text ?? "", /all leaders with the highest defense/i);
});

test("Raging Lightning damages both tied leaders simultaneously and the active player loses on double lethal", () => {
  const game = readyGame(7);
  const spell = replaceHandCard(game);
  game.players[0].hp = 3;
  game.players[1].hp = 3;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

  assert.equal(game.players[0].hp, 0);
  assert.equal(game.players[1].hp, 0);
  assert.equal(game.winner, 1);
  assert.equal(game.endReason, "leader-defense-zero");
  const events = game.getEvents({ viewer: 0 });
  const leaderDamage = events.filter(event => event.type === BATTLE_EVENT.LEADER_DAMAGE);
  assert.equal(leaderDamage.length, 2);
  const matchEndIndex = events.findIndex(event => event.type === BATTLE_EVENT.MATCH_END);
  assert.ok(matchEndIndex > events.findLastIndex(event => event.type === BATTLE_EVENT.LEADER_DAMAGE));
});
