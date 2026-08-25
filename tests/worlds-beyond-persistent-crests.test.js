import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { gainWorldsBeyondCrest } from "../src/core/rulesets/svwb/crests.js";

function fillerDeck(prefix) {
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
    seed: "persistent-crest-test",
    firstPlayer: 0,
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

test("persistent Crests stay active with null Countdown across multiple personal turns", () => {
  const game = readyGame();
  const name = "Mjerrabaine, Great Manifest";
  const result = gainWorldsBeyondCrest(game, 0, name, { id: 8991, name });
  const cursor = game.eventSequence;

  assert.equal(result.crest.countdown, null);

  for (let cycle = 0; cycle < 3; cycle += 1) {
    game.endTurn(0);
    game.endTurn(1);
    assert.equal(game.activePlayer, 0);
    assert.equal(game.players[0].resources.crests.length, 1);
    assert.equal(game.players[0].resources.crests[0].name, name);
    assert.equal(game.players[0].resources.crests[0].countdown, null);
  }

  const crestLifecycle = game.getEvents({ since: cursor, viewer: 0 }).filter(event =>
    (event.type === BATTLE_EVENT.CREST_TICK || event.type === BATTLE_EVENT.CREST_EXPIRED)
    && event.payload?.crest?.name === name
  );
  assert.deepEqual(crestLifecycle, []);
  assert.equal(game.getSnapshot(0).players[0].resources.crests[0].countdown, null);
});
