import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

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
    seed: "state-conditions-v6",
    firstPlayer: 0,
    players: [
      { name: "A", className: playerClass, deck: fillerDeck("A") },
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

function replaceHandCard(game, card, index = 0) {
  const instance = game.players[0].hand[index];
  instance.card = card;
  instance.cardId = card.id;
  game.registerCardDefinitions([card]);
  return instance;
}

function follower(instanceId, owner, { attack = 2, defense = 4, name = instanceId } = {}) {
  return {
    instanceId,
    owner,
    cardId: instanceId,
    card: { id: instanceId, name, type: "Follower", cost: 1, attack, defense, keywords: [], text: "" },
    attack,
    defense,
    maxDefense: defense,
    attacksRemaining: 1,
    canAttackFollowers: true,
    canAttackLeader: true,
    playedTurn: 0,
    evolved: false,
    superEvolved: false
  };
}

function amulet(instanceId, owner = 0) {
  return {
    instanceId,
    owner,
    cardId: instanceId,
    card: { id: instanceId, name: instanceId, type: "Amulet", cost: 1, keywords: [], text: "" },
    countdown: null,
    engagedThisTurn: false
  };
}

function zeroCostSpell(id, className = "Forestcraft") {
  return { id, name: id, class: className, type: "Spell", cost: 0, keywords: [], text: "" };
}

test("ability evolution gives +2/+2, spends no Evo point and does not trigger Evolve text", () => {
  const game = readyGame();
  const card = replaceHandCard(game, {
    id: "ability-evolver",
    name: "Ability Evolver",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 2,
    keywords: ["Fanfare", "Evolve"],
    text: "Fanfare: Evolve this follower.\n\nEvolve: Draw 1 card."
  });
  const pointsBefore = game.players[0].resources.evolutionPoints;
  const handBefore = game.players[0].hand.length;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const evolved = game.findBoardCard(0, card.instanceId);
  assert.equal(evolved.evolved, true);
  assert.equal(evolved.superEvolved, false);
  assert.equal(evolved.attack, 3);
  assert.equal(evolved.defense, 4);
  assert.equal(evolved.maxDefense, 4);
  assert.equal(game.players[0].resources.evolutionPoints, pointsBefore);
  assert.equal(game.players[0].evolutionActionUsed, false);
  assert.equal(game.players[0].hand.length, handBefore - 1, "ability Evo must not activate the Evolve Draw 1 text");
  assert.equal(game.getEvents({ viewer: 0 }).some(event => event.type === BATTLE_EVENT.EVOLVE && event.payload?.byAbility === true), true);
});

test("max-PP and leader-defense state conditions gate ability evolution", () => {
  const maxPpGame = readyGame();
  maxPpGame.players[0].resources.maxPp = 9;
  maxPpGame.players[0].resources.pp = 9;
  const maxPpCard = replaceHandCard(maxPpGame, {
    id: "max-pp-evolver",
    name: "Max PP Evolver",
    type: "Follower",
    cost: 0,
    attack: 2,
    defense: 2,
    keywords: ["Fanfare"],
    text: "Fanfare: If you have 10 max play points, evolve this follower."
  });
  maxPpGame.dispatch({ type: "play-card", player: 0, cardInstanceId: maxPpCard.instanceId });
  assert.equal(maxPpGame.findBoardCard(0, maxPpCard.instanceId).evolved, false);

  const leaderGame = readyGame();
  leaderGame.players[0].hp = 10;
  const leaderCard = replaceHandCard(leaderGame, {
    id: "leader-hp-evolver",
    name: "Leader HP Evolver",
    type: "Follower",
    cost: 0,
    attack: 2,
    defense: 2,
    keywords: ["Fanfare"],
    text: "Fanfare: If your leader's defense is 10 or less, evolve this follower."
  });
  leaderGame.dispatch({ type: "play-card", player: 0, cardInstanceId: leaderCard.instanceId });
  assert.equal(leaderGame.findBoardCard(0, leaderCard.instanceId).evolved, true);
});

test("allied-amulet threshold changes the legal target graph before play", () => {
  const inactive = readyGame();
  inactive.players[0].board.push(amulet("amulet-a"), amulet("amulet-b"));
  inactive.players[1].board.push(follower("enemy-a", 1));
  const inactiveCard = replaceHandCard(inactive, {
    id: "amulet-target-gate",
    name: "Amulet Target Gate",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: If there are at least 3 allied amulets on the field, select an enemy follower on the field and deal it 5 damage."
  });
  const inactiveActions = inactive.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === inactiveCard.instanceId);
  assert.equal(inactiveActions.some(action => action.targetInstanceId), false);

  const active = readyGame();
  active.players[0].board.push(amulet("amulet-a"), amulet("amulet-b"), amulet("amulet-c"));
  active.players[1].board.push(follower("enemy-a", 1));
  const activeCard = replaceHandCard(active, {
    id: "amulet-target-gate",
    name: "Amulet Target Gate",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: If there are at least 3 allied amulets on the field, select an enemy follower on the field and deal it 5 damage."
  });
  const activeActions = active.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === activeCard.instanceId);
  assert.equal(activeActions.some(action => action.targetInstanceId === "enemy-a"), true);
});

test("allied-amulet repeat override uses the active field count", () => {
  const inactive = readyGame();
  inactive.players[0].board.push(amulet("amulet-a"));
  const inactiveEnemy = follower("enemy-repeat", 1, { defense: 6 });
  inactive.players[1].board.push(inactiveEnemy);
  const inactiveCard = replaceHandCard(inactive, {
    id: "repeat-amulets",
    name: "Repeat Amulets",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Do this 1 time: \"Deal 2 damage to a random enemy follower.\" If there are at least 2 allied amulets on the field, do it 2 times instead."
  });
  inactive.dispatch({ type: "play-card", player: 0, cardInstanceId: inactiveCard.instanceId });
  assert.equal(inactiveEnemy.defense, 4);

  const active = readyGame();
  active.players[0].board.push(amulet("amulet-a"), amulet("amulet-b"));
  const activeEnemy = follower("enemy-repeat", 1, { defense: 6 });
  active.players[1].board.push(activeEnemy);
  const activeCard = replaceHandCard(active, {
    id: "repeat-amulets",
    name: "Repeat Amulets",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Do this 1 time: \"Deal 2 damage to a random enemy follower.\" If there are at least 2 allied amulets on the field, do it 2 times instead."
  });
  active.dispatch({ type: "play-card", player: 0, cardInstanceId: activeCard.instanceId });
  assert.equal(activeEnemy.defense, 2);
});

test("X is your Combo uses the current Combo including the card being played", () => {
  const game = readyGame({ playerClass: "Forestcraft" });
  const first = replaceHandCard(game, zeroCostSpell("setup-one"), 0);
  const second = replaceHandCard(game, zeroCostSpell("setup-two"), 1);
  const finisher = replaceHandCard(game, {
    id: "combo-x-finisher",
    name: "Combo X Finisher",
    class: "Forestcraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Combo", "Fanfare"],
    text: "Fanfare: Give this follower +X/+X. X is your Combo."
  }, 2);

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: first.instanceId });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: second.instanceId });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: finisher.instanceId });

  const followerInstance = game.findBoardCard(0, finisher.instanceId);
  assert.equal(game.players[0].cardsPlayedThisTurn, 3);
  assert.equal(followerInstance.attack, 4);
  assert.equal(followerInstance.defense, 4);
  assert.equal(followerInstance.maxDefense, 4);
});

test("X is your Combo can compile into a real multi-card draw", () => {
  const game = readyGame({ playerClass: "Forestcraft" });
  const first = replaceHandCard(game, zeroCostSpell("setup-one"), 0);
  const second = replaceHandCard(game, zeroCostSpell("setup-two"), 1);
  const drawSpell = replaceHandCard(game, {
    id: "combo-x-draw",
    name: "Combo X Draw",
    class: "Forestcraft",
    type: "Spell",
    cost: 0,
    keywords: ["Combo"],
    text: "Draw X cards. X is your Combo."
  }, 2);

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: first.instanceId });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: second.instanceId });
  const handBefore = game.players[0].hand.length;
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: drawSpell.instanceId });

  assert.equal(game.players[0].cardsPlayedThisTurn, 3);
  assert.equal(game.players[0].hand.length, handBefore - 1 + 3);
});

test("evolve then give it Barrier preserves printed effect order", () => {
  const game = readyGame();
  const card = replaceHandCard(game, {
    id: "evolve-barrier",
    name: "Evolve Barrier",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 2,
    keywords: ["Fanfare", "Barrier"],
    text: "Fanfare: Evolve this follower and give it Barrier."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const unit = game.findBoardCard(0, card.instanceId);
  assert.equal(unit.evolved, true);
  assert.equal(unit.barrierActive, true);
  const events = game.getEvents({ viewer: 0 });
  const evolveIndex = events.findIndex(event => event.type === BATTLE_EVENT.EVOLVE && event.payload?.card?.instanceId === unit.instanceId);
  const barrierIndex = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_BUFF && event.payload?.keywords?.includes("Barrier"));
  assert.ok(evolveIndex >= 0 && barrierIndex > evolveIndex, "Barrier must be granted after the ability evolution resolves");
  assert.equal(game.damageFollower(0, unit.instanceId, 3, { actor: 1, reason: "ability" }), 0);
  assert.equal(unit.defense, 4);
  assert.equal(unit.barrierActive, false);
});
