import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { WORLDS_BEYOND_RULESET } from "../src/core/rulesets/worlds-beyond.js";

function card(id) {
  return {
    id,
    name: id,
    class: "Neutral",
    type: "Follower",
    cost: 1,
    attack: 2,
    defense: 2,
    text: "",
    keywords: [],
    traits: []
  };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "ability-evolution-lock-v6",
    firstPlayer: 0,
    players: [{ name: "A", deck: deck("A") }, { name: "B", deck: deck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function forceLockedFollower(game, id) {
  const player = game.players[0];
  const instance = player.hand.shift();
  assert.ok(instance);
  instance.card = card(id);
  instance.cardId = id;
  instance.attack = 2;
  instance.defense = 2;
  instance.maxDefense = 2;
  instance.attacksRemaining = 1;
  instance.hasAttacked = false;
  instance.canAttackFollowers = false;
  instance.canAttackLeader = false;
  instance.permanentAttackLock = true;
  instance.himekaBanishAtOwnTurnEnd = true;
  instance.himekaBanishActor = 1;
  player.board.push(instance);
  return instance;
}

test("ability Evo and Super Evo preserve a permanent Himeka-style attack lock", () => {
  const game = readyGame();
  const normal = forceLockedFollower(game, "locked-normal");
  const superEvolved = forceLockedFollower(game, "locked-super");

  assert.equal(WORLDS_BEYOND_RULESET.evolveFollowerByAbility(game, 0, normal), true);
  assert.equal(WORLDS_BEYOND_RULESET.superEvolveFollowerByAbility(game, 0, superEvolved), true);

  assert.equal(normal.evolved, true);
  assert.equal(normal.attack, 4);
  assert.equal(normal.canAttackFollowers, false);
  assert.equal(normal.canAttackLeader, false);
  assert.equal(normal.permanentAttackLock, true);

  assert.equal(superEvolved.evolved, true);
  assert.equal(superEvolved.superEvolved, true);
  assert.equal(superEvolved.attack, 5);
  assert.equal(superEvolved.canAttackFollowers, false);
  assert.equal(superEvolved.canAttackLeader, false);
  assert.equal(superEvolved.permanentAttackLock, true);
});

test("manual Evo and Super Evo preserve a permanent Himeka-style attack lock", () => {
  for (const [type, bonus, availabilityKey, pointsKey] of [
    ["evolve", 2, "evolutionAvailable", "evolutionPoints"],
    ["super-evolve", 3, "superEvolutionAvailable", "superEvolutionPoints"]
  ]) {
    const game = readyGame();
    const follower = forceLockedFollower(game, `manual-${type}`);
    const player = game.players[0];
    player.resources[availabilityKey] = true;
    player.resources[pointsKey] = 2;

    game.dispatch({ type, player: 0, followerInstanceId: follower.instanceId });

    assert.equal(follower.evolved, true);
    assert.equal(follower.superEvolved, type === "super-evolve");
    assert.equal(follower.attack, 2 + bonus);
    assert.equal(follower.canAttackFollowers, false);
    assert.equal(follower.canAttackLeader, false);
    assert.equal(follower.permanentAttackLock, true);
  }
});
