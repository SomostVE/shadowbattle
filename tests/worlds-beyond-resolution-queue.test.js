import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { gainWorldsBeyondCrest } from "../src/core/rulesets/svwb/crests.js";

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: [],
    traits: [],
    text: ""
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "v6-resolution-queue",
    firstPlayer: 0,
    players: [{ name: "A", deck: deck("A") }, { name: "B", deck: deck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

test("SVWB event reactions use GameSession's native queue instead of patching emit", () => {
  const game = readyGame();
  assert.equal(Object.prototype.hasOwnProperty.call(game, "emit"), false);
  assert.deepEqual(game.getResolutionState(), { pending: 0, processing: false, nextId: game.getResolutionState().nextId, maxSteps: 512 });
});

test("heal reactions resolve after HEAL in deterministic event order and drain completely", () => {
  const game = readyGame();
  game.players[0].hp = 19;
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Flame", { id: 99001, name: "Burnite, Anathema of Flame" });
  const cursor = game.eventSequence;

  game.emit(BATTLE_EVENT.HEAL, {
    actor: 0,
    payload: { targetPlayer: 0, amount: 1, hp: 20, reason: "qa-v6" }
  });

  const relevant = game.getEvents({ since: cursor, viewer: 0 })
    .filter(event => [BATTLE_EVENT.HEAL, BATTLE_EVENT.CREST_ACTIVATE, BATTLE_EVENT.LEADER_DAMAGE].includes(event.type));
  assert.deepEqual(relevant.map(event => event.type), [
    BATTLE_EVENT.HEAL,
    BATTLE_EVENT.CREST_ACTIVATE,
    BATTLE_EVENT.LEADER_DAMAGE
  ]);
  assert.equal(game.players[0].hp, 18);
  assert.equal(game.getResolutionState().pending, 0);
  assert.equal(game.getResolutionState().processing, false);
});
