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
    keywords: []
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "named-copy-board-grants-v6",
    firstPlayer: 0,
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

function replaceHandCard(game, card) {
  const instance = game.players[0].hand[0];
  instance.card = card;
  instance.cardId = card.id;
  game.registerCardDefinitions([card]);
  return instance;
}

function follower(instanceId, owner, { name, attack = 2, defense = 2 } = {}) {
  return {
    instanceId,
    owner,
    cardId: instanceId,
    card: { id: instanceId, name: name ?? instanceId, class: "Neutral", type: "Follower", cost: 1, attack, defense, keywords: [], traits: [] },
    attack,
    defense,
    maxDefense: defense,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true,
    playedTurn: 0,
    evolved: false,
    superEvolved: false
  };
}

test("named-copy allied stat buffs match exact card names and include the source", () => {
  const game = readyGame();
  const matching = follower("named-copy-matching", 0, { name: "Congregant of Entwining" });
  const other = follower("named-copy-other", 0, { name: "Congregant of Repose" });
  game.players[0].board.push(matching, other);
  const card = replaceHandCard(game, {
    id: "named-copy-buffer",
    name: "Congregant of Entwining",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Give all allied copies of Congregant of Entwining on the field +2/+3."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const source = game.players[0].board.find(unit => unit.cardId === "named-copy-buffer");
  assert.equal(matching.attack, 4);
  assert.equal(matching.defense, 5);
  assert.equal(source.attack, 3);
  assert.equal(source.defense, 4);
  assert.equal(other.attack, 2);
  assert.equal(other.defense, 2);
});

test("Garyu-style named-copy keyword grants resolve independent names", () => {
  const game = readyGame();
  const golden = follower("supreme-golden", 0, { name: "Supreme Golden Dragon" });
  const silver = follower("supreme-silver", 0, { name: "Supreme Silver Dragon" });
  const other = follower("supreme-other", 0, { name: "Supreme Bronze Dragon" });
  for (const unit of [golden, silver, other]) {
    unit.playedTurn = game.turn;
    unit.canAttackFollowers = false;
    unit.canAttackLeader = false;
  }
  game.players[0].board.push(golden, silver, other);
  const spell = replaceHandCard(game, {
    id: "garyu-style-grants",
    name: "Garyu Style Grants",
    type: "Spell",
    cost: 0,
    keywords: [],
    text: "Give all allied copies of Supreme Golden Dragon on the field Storm. Give all allied copies of Supreme Silver Dragon on the field Barrier."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

  assert.equal((golden.grantedKeywords ?? []).includes("Storm"), true);
  assert.equal(golden.canAttackLeader, true);
  assert.equal(silver.barrierActive, true);
  assert.equal((other.grantedKeywords ?? []).length, 0);
});
