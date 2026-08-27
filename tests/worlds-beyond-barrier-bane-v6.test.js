import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: [],
    text: ""
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "barrier-bane-v6",
    firstPlayer: 0,
    players: [
      { deck: fillerDeck("A") },
      { deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function follower(instanceId, owner, {
  attack = 0,
  defense = 4,
  keywords = [],
  text = "",
  evolved = false,
  superEvolved = false,
  barrierActive = undefined
} = {}) {
  const unit = {
    instanceId,
    owner,
    cardId: instanceId,
    card: {
      id: instanceId,
      name: instanceId,
      type: "Follower",
      attack,
      defense,
      keywords,
      text
    },
    attack,
    defense,
    maxDefense: defense,
    evolved,
    superEvolved,
    attacksRemaining: 1,
    canAttackFollowers: true,
    canAttackLeader: true
  };
  if (barrierActive !== undefined) unit.barrierActive = barrierActive;
  return unit;
}

test("Barrier is consumed by a zero-damage ability hit", () => {
  const game = readyGame();
  const target = follower("zero-ability-barrier", 1, {
    attack: 2,
    defense: 5,
    keywords: ["Barrier"],
    text: "Barrier",
    barrierActive: true
  });
  game.players[1].board.push(target);

  const dealt = game.damageFollower(1, target.instanceId, 0, {
    actor: 0,
    reason: "ability",
    resolveDeath: false
  });

  assert.equal(dealt, 0);
  assert.equal(target.defense, 5);
  assert.equal(target.barrierActive, false);
});

test("Barrier is consumed by combat even when the attacker has zero attack", () => {
  const game = readyGame();
  const attacker = follower("zero-combat-attacker", 0, {
    attack: 0,
    defense: 4,
    keywords: ["Storm"],
    text: "Storm"
  });
  const target = follower("zero-combat-barrier", 1, {
    attack: 0,
    defense: 5,
    keywords: ["Barrier"],
    text: "Barrier",
    barrierActive: true
  });
  attacker.playedTurn = game.turn;
  target.playedTurn = game.turn;
  game.players[0].board.push(attacker);
  game.players[1].board.push(target);

  game.dispatch({
    type: "attack",
    player: 0,
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: target.instanceId
  });

  assert.equal(game.findBoardCard(1, target.instanceId)?.defense, 5);
  assert.equal(target.barrierActive, false);
});

test("Bane destroys a follower even when the Bane attacker has zero attack", () => {
  const game = readyGame();
  const attacker = follower("zero-bane-attacker", 0, {
    attack: 0,
    defense: 4,
    keywords: ["Storm", "Bane"],
    text: "Storm\nBane"
  });
  const target = follower("zero-bane-target", 1, { attack: 0, defense: 5 });
  attacker.playedTurn = game.turn;
  target.playedTurn = game.turn;
  game.players[0].board.push(attacker);
  game.players[1].board.push(target);

  game.dispatch({
    type: "attack",
    player: 0,
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: target.instanceId
  });

  assert.equal(game.findBoardCard(1, target.instanceId), null);
  assert.equal(game.players[1].cemetery.some(card => card.instanceId === target.instanceId), true);
});

test("Bane destroys a Barrier follower even though Barrier reduces combat damage to zero", () => {
  const game = readyGame();
  const attacker = follower("bane-barrier-attacker", 0, {
    attack: 3,
    defense: 4,
    keywords: ["Storm", "Bane"],
    text: "Storm\nBane"
  });
  const target = follower("bane-barrier-target", 1, {
    attack: 0,
    defense: 8,
    keywords: ["Barrier"],
    text: "Barrier",
    barrierActive: true
  });
  attacker.playedTurn = game.turn;
  target.playedTurn = game.turn;
  game.players[0].board.push(attacker);
  game.players[1].board.push(target);

  game.dispatch({
    type: "attack",
    player: 0,
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: target.instanceId
  });

  assert.equal(game.findBoardCard(1, target.instanceId), null);
  const destroyed = game.players[1].cemetery.find(card => card.instanceId === target.instanceId);
  assert.ok(destroyed);
  assert.equal(destroyed.defense, 8, "Barrier prevented the numerical combat damage");
  assert.equal(destroyed.barrierActive, false, "Barrier was consumed before Bane destroyed the follower");
});

test("defender Bane cannot destroy a Super-Evolved attacker during its controller's turn", () => {
  const game = readyGame();
  const attacker = follower("super-evo-vs-bane", 0, {
    attack: 2,
    defense: 6,
    evolved: true,
    superEvolved: true
  });
  const defender = follower("bane-defender", 1, {
    attack: 1,
    defense: 5,
    keywords: ["Bane"],
    text: "Bane"
  });
  attacker.playedTurn = game.turn;
  defender.playedTurn = game.turn;
  game.players[0].board.push(attacker);
  game.players[1].board.push(defender);

  game.dispatch({
    type: "attack",
    player: 0,
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: defender.instanceId
  });

  const live = game.findBoardCard(0, attacker.instanceId);
  assert.ok(live);
  assert.equal(live.defense, 6, "Super Evolution also prevented the defender's combat damage");
});
