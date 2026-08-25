import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_PHASE, GameSession } from "../src/core/game-session.js";
import { GAME_IDS } from "../src/core/game-catalog.js";

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({ id: `${prefix}-${index + 1}`, name: `${prefix} ${index + 1}`, cost: index % 10 }));
}

function session(options = {}) {
  return new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "game-session-test",
    firstPlayer: 0,
    players: [
      { name: "Human", deck: deck("A") },
      { name: "CPU", deck: deck("B") }
    ],
    ...options
  });
}

test("SVWB GameSession starts with deterministic four-card hands and hidden opponent information", () => {
  const game = session();
  game.start();
  assert.equal(game.phase, GAME_PHASE.MULLIGAN);
  assert.equal(game.players[0].hand.length, 4);
  assert.equal(game.players[1].hand.length, 4);
  assert.equal(game.players[0].deck.length, 36);
  assert.equal(game.players[1].deck.length, 36);

  const humanView = game.getSnapshot(0);
  assert.ok(humanView.players[0].hand.every(Boolean));
  assert.ok(humanView.players[1].hand.every(card => card === null));

  const replay = session();
  replay.start();
  assert.deepEqual(
    game.players.map(player => player.hand.map(card => card.cardId)),
    replay.players.map(player => player.hand.map(card => card.cardId))
  );
});

test("mulligan replaces selected cards without immediately redrawing the same instances", () => {
  const game = session();
  game.start();
  const replaced = game.players[0].hand.slice(0, 2).map(card => card.instanceId);
  game.submitMulligan(0, replaced);
  assert.equal(game.players[0].hand.length, 4);
  assert.ok(game.players[0].hand.every(card => !replaced.includes(card.instanceId)));
  assert.equal(game.players[0].deck.length, 36);
});

test("after both mulligans the first turn starts, refreshes PP and draws a card", () => {
  const game = session();
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);

  assert.equal(game.phase, GAME_PHASE.MAIN);
  assert.equal(game.activePlayer, 0);
  assert.equal(game.players[0].personalTurn, 1);
  assert.equal(game.players[0].resources.pp, 1);
  assert.equal(game.players[0].resources.maxPp, 1);
  assert.equal(game.players[0].hand.length, 5);
  assert.equal(game.players[1].resources.bonusPpAvailable, true);

  const types = game.getEvents({ viewer: 0 }).map(event => event.type);
  assert.ok(types.includes(BATTLE_EVENT.MULLIGAN_COMPLETE));
  assert.ok(types.includes(BATTLE_EVENT.TURN_START));
  assert.ok(types.includes(BATTLE_EVENT.DRAW));
});

test("end turn hands control to the opponent and rejects out-of-turn control", () => {
  const game = session();
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);

  assert.throws(() => game.endTurn(1), /not player 1's turn/);
  game.endTurn(0);
  assert.equal(game.activePlayer, 1);
  assert.equal(game.players[1].personalTurn, 1);
  assert.equal(game.players[1].resources.pp, 1);
  assert.equal(game.players[1].hand.length, 5);
});

test("owner-only draw events do not leak hidden card data", () => {
  const game = session();
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);

  const playerZeroEvents = game.getEvents({ viewer: 0 });
  const playerOneOpening = playerZeroEvents.find(event => event.type === BATTLE_EVENT.OPENING_DRAW && event.actor === 1);
  assert.equal(playerOneOpening, undefined);

  const spectatorEvents = game.getEvents({ viewer: null });
  assert.ok(spectatorEvents.every(event => event.visibility === "public"));
});

test("Worlds Beyond gives both players two Evo and two Super Evo points", () => {
  const game = session();
  game.start();
  assert.equal(game.players[0].resources.evolutionPoints, 2);
  assert.equal(game.players[1].resources.evolutionPoints, 2);
  assert.equal(game.players[0].resources.superEvolutionPoints, 2);
  assert.equal(game.players[1].resources.superEvolutionPoints, 2);
});

test("second player can consume Bonus PP once before turn six", () => {
  const game = session();
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.endTurn(0);
  assert.equal(game.players[1].resources.pp, 1);
  game.useBonusPp(1);
  assert.equal(game.players[1].resources.pp, 2);
  assert.equal(game.players[1].resources.bonusPpUses, 1);
  assert.equal(game.players[1].resources.bonusPpAvailable, false);
  assert.throws(() => game.useBonusPp(1), /not available/);
});
