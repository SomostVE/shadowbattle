import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { returnBoardCardToHand } from "../src/core/zone-actions.js";

const doomwright = {
  id: 10172320,
  name: "Doomwright Resurgence",
  class: "Portalcraft",
  type: "Spell",
  cost: 5,
  traits: [],
  keywords: [],
  text: "Select 2 Artifact followers in your hand that cost 5 or less, summon an exact copy of each, and give the exact copies \"At the end of your opponent's turn, destroy this card.\""
};

const artifactA = {
  id: 8101,
  name: "Artifact A",
  class: "Portalcraft",
  type: "Follower",
  cost: 4,
  attack: 2,
  defense: 3,
  traits: ["Artifact"],
  keywords: [],
  text: ""
};

const artifactB = {
  id: 8102,
  name: "Artifact B",
  class: "Portalcraft",
  type: "Follower",
  cost: 5,
  attack: 4,
  defense: 5,
  traits: ["Artifact"],
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
    seed: "opponent-turn-destroy-reset",
    firstPlayer: 0,
    cardCatalog: [doomwright, artifactA, artifactB],
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, slot, card) {
  const instance = game.players[0].hand[slot];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

test("a bounced Doomwright copy loses its temporary opponent-turn destruction marker", () => {
  const game = readyGame();
  const spell = replaceHandCard(game, 0, doomwright);
  const a = replaceHandCard(game, 1, artifactA);
  const b = replaceHandCard(game, 2, artifactB);
  const action = game.listLegalActions(0).find(item =>
    item.type === "play-card" &&
    item.cardInstanceId === spell.instanceId &&
    item.handCopyInstanceIds?.includes(a.instanceId) &&
    item.handCopyInstanceIds?.includes(b.instanceId)
  );
  assert.ok(action);

  game.dispatch(action);
  const copy = game.players[0].board.find(unit => unit.card.name === artifactA.name);
  assert.ok(copy);
  assert.equal(copy.destroyAtOpponentTurnEnd, true);

  const returned = returnBoardCardToHand(game, 0, copy.instanceId, { actor: 0, reason: "test-return" });
  assert.ok(returned);
  assert.equal(returned.destroyAtOpponentTurnEnd, undefined);

  const replay = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === returned.instanceId);
  assert.ok(replay);
  game.dispatch(replay);
  assert.ok(game.findBoardCard(0, returned.instanceId));

  game.endTurn(0);
  game.endTurn(1);

  assert.ok(game.findBoardCard(0, returned.instanceId), "replayed copy must survive the opponent turn end");
  assert.equal(game.players[0].board.filter(unit => unit.destroyAtOpponentTurnEnd).length, 0);
});
