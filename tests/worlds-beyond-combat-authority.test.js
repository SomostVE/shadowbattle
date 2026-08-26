import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  applyWorldsBeyondAction,
  listWorldsBeyondActions
} from "../src/core/rulesets/svwb/action-resolver.js";

function card(id) {
  return { id, name: id, class: "Neutral", type: "Follower", cost: 1, attack: 2, defense: 2, text: "", keywords: [] };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function begin() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "combat-authority",
    firstPlayer: 0,
    players: [{ name: "A", deck: deck("A") }, { name: "B", deck: deck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function putReadyFollower(game) {
  const source = card("ready-follower");
  const unit = {
    instanceId: "ready-follower-instance",
    owner: 0,
    cardId: source.id,
    card: source,
    attack: 2,
    defense: 2,
    maxDefense: 2,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true,
    playedTurn: game.turn - 1,
    evolved: false,
    superEvolved: false,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0
  };
  game.players[0].board.push(unit);
  game.players[0].resources.evolutionAvailable = true;
  game.players[0].resources.evolutionPoints = 2;
  return unit;
}

test("action-resolver exposes only non-combat actions while GameSession adds the V6 combat graph", () => {
  const game = begin();
  const unit = putReadyFollower(game);

  const nonCombat = listWorldsBeyondActions(game, 0);
  assert.equal(nonCombat.some(action => action.type === "attack"), false);

  const legal = game.listLegalActions(0);
  assert.ok(legal.some(action => action.type === "attack" && action.attackerInstanceId === unit.instanceId && action.target === "leader"));
  assert.ok(legal.some(action => action.type === "evolve" && action.followerInstanceId === unit.instanceId));
});

test("legacy applyWorldsBeyondAction attack entry delegates to the V6 combat resolver", () => {
  const game = begin();
  const unit = putReadyFollower(game);
  const attack = game.listLegalActions(0).find(action => action.type === "attack" && action.attackerInstanceId === unit.instanceId && action.target === "leader");
  assert.ok(attack);

  applyWorldsBeyondAction(game, attack);

  assert.equal(game.players[1].hp, 18);
  assert.equal(unit.attacksRemaining, 0);
});

test("a follower may evolve after attacking but cannot attack a second time", () => {
  const game = begin();
  const unit = putReadyFollower(game);
  const attack = game.listLegalActions(0).find(action => action.type === "attack" && action.attackerInstanceId === unit.instanceId && action.target === "leader");
  assert.ok(attack);
  game.dispatch(attack);

  const evolve = game.listLegalActions(0).find(action => action.type === "evolve" && action.followerInstanceId === unit.instanceId);
  assert.ok(evolve, "evolution remains legal after the follower used its attack");
  game.dispatch(evolve);

  assert.equal(unit.evolved, true);
  assert.equal(unit.attacksRemaining, 0);
  assert.equal(game.listLegalActions(0).some(action => action.type === "attack" && action.attackerInstanceId === unit.instanceId), false);
});
