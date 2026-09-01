import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { returnBoardCardToHand } from "../src/core/zone-actions.js";

const SINCIRO = {
  id: "sinciro-bounce",
  name: "Sinciro, Heir to Usurpation",
  class: "Swordcraft",
  type: "Follower",
  cost: 0,
  attack: 2,
  defense: 2,
  traits: [],
  keywords: [],
  text: "Fuse: Loot cards\nFanfare: Deal X damage to all enemies. X is the number of differently named cards Fused to this card."
};

const LOOT_A = {
  id: "loot-a",
  name: "Gilded Goblet",
  class: "Swordcraft",
  type: "Spell",
  cost: 1,
  traits: ["Loot"],
  keywords: [],
  text: ""
};

const LOOT_B = {
  id: "loot-b",
  name: "Gilded Boots",
  class: "Swordcraft",
  type: "Spell",
  cost: 1,
  traits: ["Loot"],
  keywords: [],
  text: ""
};

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    traits: [],
    keywords: [],
    text: ""
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "fuse-bounce-reset",
    firstPlayer: 0,
    cardCatalog: [SINCIRO, LOOT_A, LOOT_B],
    players: [
      { name: "A", deck: fillerDeck("A") },
      { name: "B", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, slot, definition) {
  const instance = game.players[0].hand[slot];
  instance.card = definition;
  instance.cardId = definition.id;
  instance.costDelta = 0;
  instance.attackBonus = 0;
  instance.defenseBonus = 0;
  return instance;
}

test("a Fuse follower returned to hand loses Fuse history and may Fuse again", () => {
  const game = readyGame();
  const sinciro = replaceHandCard(game, 0, SINCIRO);
  const lootA = replaceHandCard(game, 1, LOOT_A);
  const lootB = replaceHandCard(game, 2, LOOT_B);

  const fuse = game.listLegalActions(0).find(action =>
    action.type === "fuse" &&
    action.targetInstanceId === sinciro.instanceId &&
    action.materialInstanceIds.length === 1 &&
    action.materialInstanceIds[0] === lootA.instanceId
  );
  assert.ok(fuse);
  game.dispatch(fuse);
  assert.equal(sinciro.fusedThisTurn, true);
  assert.deepEqual(sinciro.fusedNames, [LOOT_A.name]);
  assert.equal(sinciro.x, 1);

  const play = game.listLegalActions(0).find(action =>
    action.type === "play-card" && action.cardInstanceId === sinciro.instanceId
  );
  assert.ok(play);
  game.dispatch(play);
  assert.equal(game.findBoardCard(0, sinciro.instanceId), sinciro);

  const returned = returnBoardCardToHand(game, 0, sinciro.instanceId, { actor: 1, reason: "test-return" });
  assert.equal(returned, sinciro);
  assert.equal(returned.fusedThisTurn, false);
  assert.deepEqual(returned.fusedCards, []);
  assert.deepEqual(returned.fusedNames, []);
  assert.equal(Object.prototype.hasOwnProperty.call(returned, "x"), false);

  const fuseAgain = game.listLegalActions(0).find(action =>
    action.type === "fuse" &&
    action.targetInstanceId === returned.instanceId &&
    action.materialInstanceIds.includes(lootB.instanceId)
  );
  assert.ok(fuseAgain, "the returned card should be a fresh Fuse target in hand");
});
