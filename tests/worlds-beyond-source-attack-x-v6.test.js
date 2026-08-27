import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function fillerDeck(prefix, className = "Neutral") {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: className,
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: [],
    text: ""
  }));
}

function readyGame(className = "Forestcraft") {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "source-attack-x-v6",
    firstPlayer: 0,
    players: [
      { className, deck: fillerDeck("A", className) },
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
  instance.attackBonus = 0;
  instance.defenseBonus = 0;
  return instance;
}

function enemyFollower(game, { id = "enemy-target", attack = 1, defense = 10 } = {}) {
  const unit = {
    instanceId: id,
    owner: 1,
    cardId: id,
    card: { id, name: id, class: "Neutral", type: "Follower", cost: 1, attack, defense, keywords: [], text: "" },
    attack,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[1].board.push(unit);
  return unit;
}

test("Frostbow Sniper uses its current attack for Fanfare target damage", () => {
  const game = readyGame("Forestcraft");
  const source = replaceHandCard(game, {
    id: 10713110,
    name: "Frostbow Sniper",
    class: "Forestcraft",
    type: "Follower",
    cost: 0,
    attack: 4,
    defense: 4,
    keywords: ["Fanfare", "Combo"],
    text: "Fanfare: Select an enemy follower on the field and deal it X damage. X is this follower's attack.\n\nAt the end of your turn, Combo (3) - Draw a card."
  });
  const target = enemyFollower(game, { defense: 9 });

  const action = game.listLegalActions(0).find(item => item.type === "play-card"
    && item.cardInstanceId === source.instanceId
    && item.targetInstanceId === target.instanceId);
  assert.ok(action);
  assert.equal(action.targetAmount, 4);

  game.dispatch(action);
  assert.equal(game.findBoardCard(1, target.instanceId)?.defense, 5);
  const trigger = game.events.findLast(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.card?.name === "Frostbow Sniper");
  assert.match(trigger?.payload?.text ?? "", /deal it 4 damage/i);
  assert.doesNotMatch(trigger?.payload?.text ?? "", /is this follower's attack/i);
});

test("Thestae uses source attack for -0/-X before increasing Combo", () => {
  const game = readyGame("Forestcraft");
  const source = replaceHandCard(game, {
    id: 10714110,
    name: "Thestae, Anathema of Distortion",
    class: "Forestcraft",
    type: "Follower",
    cost: 0,
    attack: 5,
    defense: 5,
    keywords: ["Fanfare", "Combo", "Evolve"],
    text: "Fanfare: Select an enemy follower on the field and give it -0/-X. X is this follower's attack. Increase your Combo by 1.\n\nEvolve: Gain Crest: Thestae, Anathema of Distortion."
  });
  const target = enemyFollower(game, { defense: 8 });

  const action = game.listLegalActions(0).find(item => item.type === "play-card"
    && item.cardInstanceId === source.instanceId
    && item.targetInstanceId === target.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, target.instanceId)?.defense, 3);
  assert.equal(game.players[0].cardsPlayedThisTurn, 2);
  assert.equal(game.players[0].resources.combo, 2);
});

test("Runeblade Conductor includes hand Spellboost stat bonuses when resolving X", () => {
  const game = readyGame("Runecraft");
  const source = replaceHandCard(game, {
    id: 10131110,
    name: "Runeblade Conductor",
    class: "Runecraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare", "On Spellboost"],
    text: "On Spellboost: Give this follower +1/+1.\n\nFanfare: Select an enemy follower on the field and deal it X damage. X is this follower's attack."
  });
  source.spellboost = 3;
  source.attackBonus = 3;
  source.defenseBonus = 3;
  const target = enemyFollower(game, { defense: 7 });

  const action = game.listLegalActions(0).find(item => item.type === "play-card"
    && item.cardInstanceId === source.instanceId
    && item.targetInstanceId === target.instanceId);
  assert.ok(action);
  assert.equal(action.targetAmount, 4);
  game.dispatch(action);

  assert.equal(game.findBoardCard(0, source.instanceId)?.attack, 4);
  assert.equal(game.findBoardCard(1, target.instanceId)?.defense, 3);
});

test("Suframare evaluates X from its attack at turn-end rather than from base attack", () => {
  const game = readyGame("Runecraft");
  const recipient = game.players[0].hand[0];
  recipient.card = {
    id: "spellboost-recipient",
    name: "Spellboost Recipient",
    class: "Runecraft",
    type: "Follower",
    cost: 5,
    attack: 1,
    defense: 1,
    keywords: ["On Spellboost"],
    text: "On Spellboost: Reduce the cost of this card by 1."
  };
  recipient.cardId = recipient.card.id;
  recipient.spellboost = 0;

  const source = {
    instanceId: "suframare-board",
    owner: 0,
    cardId: 10431120,
    card: {
      id: 10431120,
      name: "Suframare, Wandering Tutor",
      class: "Runecraft",
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      keywords: ["Evolve"],
      text: "At the end of your turn, spellboost your hand X times. X is this follower's attack.\n\nEvolve: Give this follower \"Can't attack followers or leaders.\""
    },
    attack: 4,
    defense: 1,
    maxDefense: 1,
    playedTurn: 0,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[0].board.push(source);

  game.endTurn(0);

  assert.equal(recipient.spellboost, 4);
  const trigger = game.events.find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.card?.name === "Suframare, Wandering Tutor");
  assert.match(trigger?.payload?.text ?? "", /spellboost your hand 4 times/i);
});
