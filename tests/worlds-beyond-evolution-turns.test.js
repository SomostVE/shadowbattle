import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

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
    keywords: []
  };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function begin() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "official-evolution-turns",
    firstPlayer: 0,
    players: [
      { name: "First", deck: deck("A") },
      { name: "Second", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  putFollower(game, 0, "first-evo-target");
  putFollower(game, 1, "second-evo-target");
  return game;
}

function putFollower(game, playerIndex, id) {
  const source = card(id);
  game.players[playerIndex].board.push({
    instanceId: `${id}-instance`,
    owner: playerIndex,
    cardId: source.id,
    card: source,
    attack: 2,
    defense: 2,
    maxDefense: 2,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true,
    playedTurn: 0,
    evolved: false,
    superEvolved: false,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0
  });
}

function advanceTo(game, playerIndex, personalTurn) {
  let guard = 40;
  while (guard-- > 0) {
    const player = game.players[playerIndex];
    if (game.activePlayer === playerIndex && player.personalTurn === personalTurn) return;
    game.endTurn(game.activePlayer);
  }
  throw new Error(`Could not reach player ${playerIndex} turn ${personalTurn}`);
}

function evolutionActions(game, playerIndex) {
  return game.listLegalActions(playerIndex).filter(action => action.type === "evolve");
}

function superEvolutionActions(game, playerIndex) {
  return game.listLegalActions(playerIndex).filter(action => action.type === "super-evolve");
}

test("official SVWB normal evolution unlocks on first player's turn 5 and second player's turn 4", () => {
  const game = begin();

  advanceTo(game, 1, 3);
  assert.equal(game.players[1].resources.evolutionAvailable, false);
  assert.equal(evolutionActions(game, 1).length, 0);

  advanceTo(game, 0, 4);
  assert.equal(game.players[0].resources.evolutionAvailable, false);
  assert.equal(evolutionActions(game, 0).length, 0);

  advanceTo(game, 1, 4);
  assert.equal(game.players[1].resources.evolutionAvailable, true);
  assert.ok(evolutionActions(game, 1).length > 0);

  advanceTo(game, 0, 5);
  assert.equal(game.players[0].resources.evolutionAvailable, true);
  assert.ok(evolutionActions(game, 0).length > 0);
});

test("official SVWB Super Evolution unlocks on first player's turn 7 and second player's turn 6", () => {
  const game = begin();

  advanceTo(game, 1, 5);
  assert.equal(game.players[1].resources.superEvolutionAvailable, false);
  assert.equal(superEvolutionActions(game, 1).length, 0);

  advanceTo(game, 0, 6);
  assert.equal(game.players[0].resources.superEvolutionAvailable, false);
  assert.equal(superEvolutionActions(game, 0).length, 0);

  advanceTo(game, 1, 6);
  assert.equal(game.players[1].resources.superEvolutionAvailable, true);
  assert.ok(superEvolutionActions(game, 1).length > 0);

  advanceTo(game, 0, 7);
  assert.equal(game.players[0].resources.superEvolutionAvailable, true);
  assert.ok(superEvolutionActions(game, 0).length > 0);
});
