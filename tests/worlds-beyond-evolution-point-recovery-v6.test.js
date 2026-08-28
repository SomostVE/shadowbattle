import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function card(id, {
  name = String(id),
  className = "Neutral",
  type = "Follower",
  cost = 1,
  attack = 1,
  defense = 1,
  text = "",
  keywords = []
} = {}) {
  return { id, name, class: className, type, cost, attack, defense, text, keywords, traits: [] };
}

const DEPLETIVE_ELD_SIGHT = card(10653310, {
  name: "Depletive Eld Sight",
  className: "Abysscraft",
  type: "Spell",
  cost: 3,
  attack: 0,
  defense: 0,
  keywords: ["Mode"],
  text: "Select a Mode to activate.\n1. Recover 1 evolution point.\n2. Deal 2 damage to all enemy followers."
});

const ITSURUGI_TAKETSUMI = card(10854110, {
  name: "Itsurugi & Taketsumi, Brothers",
  className: "Abysscraft",
  cost: 5,
  attack: 4,
  defense: 4,
  keywords: ["Fanfare", "Mode", "Evolve"],
  text: "Fanfare: Select a Mode to activate.\n1. Deal 4 damage to the enemy leader. Restore 4 defense to your leader.\n2. Deal 5 damage to all enemy followers. Recover 1 evolution point.\n\nEvolve: Select a Mode to activate.\n1. Draw 2 cards.\n2. Recover 2 play points."
});

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, {
    name: `${prefix} ${index}`,
    cost: 9
  }));
}

function readyGame(cardCatalog = []) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "evolution-point-recovery-v6",
    firstPlayer: 0,
    cardCatalog,
    players: [
      { name: "Abyss", className: "Abysscraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, definition) {
  const instance = game.players[0].hand[0];
  instance.card = definition;
  instance.cardId = definition.id;
  return instance;
}

function boardFollower(game, owner, definition, suffix = "board") {
  const unit = {
    instanceId: `${owner}:${definition.id}:${suffix}`,
    owner,
    cardId: definition.id,
    card: definition,
    attack: Number(definition.attack ?? 0),
    defense: Number(definition.defense ?? 0),
    maxDefense: Number(definition.defense ?? 0),
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0,
    evolved: false,
    superEvolved: false,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[owner].board.push(unit);
  return unit;
}

function playActions(game, source) {
  return game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
}

test("Depletive Eld Sight exposes both supported modes and recovers one evolution point", () => {
  const game = readyGame([DEPLETIVE_ELD_SIGHT]);
  const source = replaceHandCard(game, DEPLETIVE_ELD_SIGHT);
  game.players[0].resources.evolutionPoints = 0;

  const actions = playActions(game, source);
  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map(action => action.playMode?.modeIndex).sort((a, b) => a - b), [1, 2]);
  const recovery = actions.find(action => action.playMode?.modeIndex === 1);
  assert.ok(recovery);
  game.dispatch(recovery);

  assert.equal(game.players[0].resources.evolutionPoints, 1);
});

test("evolution point recovery is capped by the ruleset's starting EP reserve", () => {
  const game = readyGame([DEPLETIVE_ELD_SIGHT]);
  const source = replaceHandCard(game, DEPLETIVE_ELD_SIGHT);
  game.players[0].resources.evolutionPoints = 2;

  const recovery = playActions(game, source).find(action => action.playMode?.modeIndex === 1);
  assert.ok(recovery);
  game.dispatch(recovery);

  assert.equal(game.players[0].resources.evolutionPoints, 2);
});

test("Itsurugi and Taketsumi mode 2 resolves area damage before recovering an evolution point", () => {
  const game = readyGame([ITSURUGI_TAKETSUMI]);
  const source = replaceHandCard(game, ITSURUGI_TAKETSUMI);
  game.players[0].resources.evolutionPoints = 0;
  const enemy = boardFollower(game, 1, card("itsurugi-target", {
    name: "Itsurugi Target",
    defense: 6
  }), "target");

  const actions = playActions(game, source);
  assert.equal(actions.length, 2);
  const mode2 = actions.find(action => action.playMode?.modeIndex === 2);
  assert.ok(mode2);
  game.dispatch(mode2);

  assert.equal(game.findBoardCard(1, enemy.instanceId)?.defense, 1);
  assert.equal(game.players[0].resources.evolutionPoints, 1);
  assert.equal(game.players[1].hp, 20, "unselected leader-damage mode must not leak into mode 2");
});
