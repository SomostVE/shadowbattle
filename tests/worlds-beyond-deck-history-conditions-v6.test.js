import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { hasWorldsBeyondKeyword } from "../src/core/rulesets/svwb/combat-readiness.js";

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
    text: ""
  }));
}

function readyGame({ playerClass = null } = {}) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "deck-history-conditions-v6",
    firstPlayer: 0,
    players: [
      { className: playerClass, deck: fillerDeck("A") },
      { deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, card, index = 0) {
  const instance = game.players[0].hand[index];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

function deckInstance(id, cardId = id) {
  return {
    instanceId: `deck:${id}`,
    owner: 0,
    cardId,
    card: {
      id: cardId,
      name: String(cardId),
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      keywords: [],
      text: ""
    }
  };
}

function enemyFollower(game, instanceId = "enemy-target", defense = 8) {
  const unit = {
    instanceId,
    owner: 1,
    cardId: instanceId,
    card: {
      id: instanceId,
      name: instanceId,
      type: "Follower",
      cost: 1,
      attack: 0,
      defense,
      keywords: [],
      text: ""
    },
    attack: 0,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[1].board.push(unit);
  return unit;
}

function highlanderCard(id = "highlander-target") {
  return {
    id,
    name: id,
    class: "Portalcraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare", "Rush"],
    text: "Fanfare: If there are no duplicates in your deck, select an enemy follower on the field and deal it 5 damage.\n\nRush"
  };
}

function historyStormCard(id = "history-storm") {
  return {
    id,
    name: id,
    class: "Dragoncraft",
    type: "Follower",
    cost: 0,
    attack: 2,
    defense: 2,
    keywords: ["Fanfare", "Storm"],
    text: "Fanfare: If an allied follower attacked a leader on your last turn, give this follower Storm."
  };
}

test("no-duplicates condition exposes its target only when the remaining deck is unique", () => {
  const unique = readyGame({ playerClass: "Portalcraft" });
  const uniqueSource = replaceHandCard(unique, highlanderCard());
  enemyFollower(unique);
  unique.players[0].deck = [deckInstance("u1"), deckInstance("u2"), deckInstance("u3")];
  const uniqueActions = unique.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === uniqueSource.instanceId);
  assert.equal(uniqueActions.some(action => action.targetInstanceId === "enemy-target"), true);

  const duplicate = readyGame({ playerClass: "Portalcraft" });
  const duplicateSource = replaceHandCard(duplicate, highlanderCard("highlander-duplicate"));
  enemyFollower(duplicate);
  duplicate.players[0].deck = [deckInstance("d1", "same"), deckInstance("d2", "same")];
  const duplicateActions = duplicate.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === duplicateSource.instanceId);
  assert.equal(duplicateActions.some(action => action.targetInstanceId), false, "inactive conditional target must not be required");
  assert.equal(duplicateActions.length, 1, "the follower itself remains playable when the condition is inactive");
});

test("no-duplicates condition resolves against the live remaining deck", () => {
  const game = readyGame({ playerClass: "Portalcraft" });
  const source = replaceHandCard(game, highlanderCard("live-highlander"));
  const target = enemyFollower(game, "live-highlander-target", 9);
  game.players[0].deck = [deckInstance("live-1"), deckInstance("live-2")];

  const action = game.listLegalActions(0).find(item => item.type === "play-card"
    && item.cardInstanceId === source.instanceId
    && item.targetInstanceId === target.instanceId);
  assert.ok(action);
  game.dispatch(action);
  assert.equal(game.findBoardCard(1, target.instanceId)?.defense, 4);
});

test("an attack on the current turn does not satisfy the previous-turn condition", () => {
  const game = readyGame({ playerClass: "Dragoncraft" });
  const setup = replaceHandCard(game, {
    id: "history-setup-storm",
    name: "History Setup Storm",
    class: "Dragoncraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 2,
    keywords: ["Storm"],
    text: "Storm"
  }, 0);
  const payoff = replaceHandCard(game, historyStormCard(), 1);

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: setup.instanceId });
  game.dispatch({ type: "attack", player: 0, attackerInstanceId: setup.instanceId, target: "leader" });
  assert.equal(game.players[0].attackedLeaderThisTurn, true);
  assert.equal(Boolean(game.players[0].attackedLeaderLastTurn), false);

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: payoff.instanceId });
  const follower = game.findBoardCard(0, payoff.instanceId);
  assert.equal(hasWorldsBeyondKeyword(follower, "Storm"), false);
});

test("leader-attack history rolls into the next personal turn and grants conditional Storm", () => {
  const game = readyGame({ playerClass: "Dragoncraft" });
  const setup = replaceHandCard(game, {
    id: "history-rollover-storm",
    name: "History Rollover Storm",
    class: "Dragoncraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 3,
    keywords: ["Storm"],
    text: "Storm"
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: setup.instanceId });
  game.dispatch({ type: "attack", player: 0, attackerInstanceId: setup.instanceId, target: "leader" });
  game.endTurn(0);
  game.endTurn(1);

  assert.equal(game.players[0].attackedLeaderLastTurn, true);
  assert.equal(game.players[0].attackedLeaderThisTurn, false);
  game.players[0].resources.pp = 10;
  const payoff = replaceHandCard(game, historyStormCard("history-next-turn"));
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: payoff.instanceId });
  const follower = game.findBoardCard(0, payoff.instanceId);
  assert.equal(hasWorldsBeyondKeyword(follower, "Storm"), true);
  assert.equal(game.listLegalActions(0).some(action => action.type === "attack"
    && action.attackerInstanceId === follower.instanceId
    && action.target === "leader"), true);
});

test("previous-turn leader attack can upgrade Codex-style repeated Fanfare resolution", () => {
  const game = readyGame({ playerClass: "Dragoncraft" });
  game.players[0].attackedLeaderLastTurn = true;
  const source = replaceHandCard(game, {
    id: "history-repeat",
    name: "History Repeat",
    class: "Dragoncraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Do this 1 time: \"Deal 4 damage to a random enemy follower.\" If an allied follower attacked a leader on your last turn, do it 2 times instead."
  });
  const target = enemyFollower(game, "history-repeat-target", 10);

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: source.instanceId });
  assert.equal(game.findBoardCard(1, target.instanceId)?.defense, 2, "the repeated body must resolve twice for 8 total damage");
});
