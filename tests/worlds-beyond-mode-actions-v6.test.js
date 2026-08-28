import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { getSimpleWorldsBeyondModeChoices } from "../src/core/rulesets/svwb/mode-selection.js";

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

const GLITTERING_GOLD = card(90021350, {
  name: "Glittering Gold",
  className: "Swordcraft",
  type: "Spell",
  cost: 0,
  attack: 0,
  defense: 0,
  text: "Select a Mode to activate.\n1. Draw a card.\n2. Deal 2 damage to a random enemy follower."
});

const MODE_EVOLVER = card("mode-evolver", {
  name: "Mode Evolver",
  className: "Abysscraft",
  cost: 2,
  attack: 2,
  defense: 2,
  text: "Evolve: Select a Mode to activate.\n1. Draw 2 cards.\n2. Restore 2 defense to your leader."
});

const REPLICATE_EVOLVER = card("replicate-evolver", {
  name: "Replicate Evolver",
  className: "Abysscraft",
  cost: 3,
  attack: 3,
  defense: 3,
  text: "Fanfare: Select a Mode to activate.\n1. Deal 3 damage to a random enemy follower.\n2. Restore 2 defense to your leader.\n\nEvolve: Replicate the effects of this card's Fanfare ability."
});

const CONDITIONAL_MODE = card("conditional-mode", {
  name: "Conditional Mode",
  className: "Havencraft",
  type: "Spell",
  cost: 1,
  attack: 0,
  defense: 0,
  text: "Select a Mode to activate. If there's an allied card on the field with a base cost of 6 or more, activate all of them instead.\n1. Deal 3 damage to a random enemy follower.\n2. Restore 2 defense to your leader."
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
    seed: "mode-actions-v6",
    firstPlayer: 0,
    cardCatalog,
    players: [
      { name: "Human", className: "Abysscraft", deck: fillerDeck("A") },
      { name: "CPU", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  const player = game.players[0];
  player.resources.pp = 10;
  player.resources.maxPp = 10;
  player.resources.evolutionAvailable = true;
  player.resources.superEvolutionAvailable = true;
  player.resources.evolutionPoints = 2;
  player.resources.superEvolutionPoints = 2;
  return game;
}

function replaceInstance(instance, definition) {
  instance.card = definition;
  instance.cardId = definition.id;
  return instance;
}

function handCard(game, definition) {
  return replaceInstance(game.players[0].hand[0], definition);
}

function deckCard(game, index, definition) {
  return replaceInstance(game.players[0].deck[index], definition);
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
    attacksRemaining: 1,
    canAttackFollowers: true,
    canAttackLeader: false
  };
  game.players[owner].board.push(unit);
  return unit;
}

function evolutionModes(game, follower, type = "evolve") {
  return game.listLegalActions(0).filter(action => action.type === type && action.followerInstanceId === follower.instanceId);
}

test("simple mode parser expands choices but rejects conditional activate-all grammar", () => {
  const simple = getSimpleWorldsBeyondModeChoices(GLITTERING_GOLD.text, gameLikePlayer());
  assert.equal(simple.length, 2);
  assert.deepEqual(simple.map(mode => mode.selectedModeIndices), [[1], [2]]);

  const conditional = getSimpleWorldsBeyondModeChoices(CONDITIONAL_MODE.text, gameLikePlayer());
  assert.deepEqual(conditional, []);
});

test("play action graph exposes both simple Glittering Gold modes", () => {
  const game = readyGame([GLITTERING_GOLD]);
  const source = handCard(game, GLITTERING_GOLD);
  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);

  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map(action => action.playMode.modeIndex).sort((a, b) => a - b), [1, 2]);
});

test("Glittering Gold selected draw mode resolves only the selected branch", () => {
  const drawDefinition = card("gold-draw", { name: "Gold Draw" });
  const game = readyGame([GLITTERING_GOLD]);
  const source = handCard(game, GLITTERING_GOLD);
  deckCard(game, 0, drawDefinition);
  const enemy = boardFollower(game, 1, card("gold-enemy", { name: "Gold Enemy", defense: 5 }), "enemy");

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId && item.playMode?.modeIndex === 1);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].hand.some(item => item.card?.name === "Gold Draw"), true);
  assert.equal(game.findBoardCard(1, enemy.instanceId)?.defense, 5);
});

test("evolution action graph exposes one action per supported simple mode", () => {
  const game = readyGame([MODE_EVOLVER]);
  const follower = boardFollower(game, 0, MODE_EVOLVER, "source");
  const actions = evolutionModes(game, follower);

  assert.equal(actions.length, 2);
  assert.equal(new Set(actions.map(action => action.evolutionModeKey)).size, 2);
  assert.deepEqual(actions.map(action => action.evolutionMode.modeIndex).sort((a, b) => a - b), [1, 2]);
});

test("chosen evolution mode resolves without leaking the unselected branch", () => {
  const drawA = card("mode-draw-a", { name: "Mode Draw A" });
  const drawB = card("mode-draw-b", { name: "Mode Draw B" });
  const game = readyGame([MODE_EVOLVER]);
  const follower = boardFollower(game, 0, MODE_EVOLVER, "source");
  deckCard(game, 0, drawA);
  deckCard(game, 1, drawB);
  game.players[0].hp = 10;

  const healAction = evolutionModes(game, follower).find(action => action.evolutionMode?.modeIndex === 2);
  assert.ok(healAction);
  game.dispatch(healAction);

  assert.equal(game.players[0].hp, 12);
  assert.equal(game.players[0].hand.some(item => item.card?.name === "Mode Draw A"), false);
  assert.equal(follower.evolved, true);
  assert.equal(game.players[0].resources.evolutionPoints, 1);
});

test("Evolve replicate-Fanfare exposes and resolves the selected Fanfare mode", () => {
  const game = readyGame([REPLICATE_EVOLVER]);
  const follower = boardFollower(game, 0, REPLICATE_EVOLVER, "source");
  const enemy = boardFollower(game, 1, card("replicate-enemy", { name: "Replicate Enemy", defense: 6 }), "enemy");
  game.players[0].hp = 10;
  game.rng = () => 0;

  const actions = evolutionModes(game, follower);
  assert.equal(actions.length, 2);
  const damageAction = actions.find(action => action.evolutionMode?.modeIndex === 1);
  assert.ok(damageAction);
  game.dispatch(damageAction);

  assert.equal(game.findBoardCard(1, enemy.instanceId)?.defense, 3);
  assert.equal(game.players[0].hp, 10);
});

test("conditional activate-all mode text remains structurally unsupported", () => {
  const game = readyGame([CONDITIONAL_MODE]);
  const source = handCard(game, CONDITIONAL_MODE);
  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, false);
  assert.match(support.residual, /select a mode/i);
});

function gameLikePlayer() {
  return {
    className: "Neutral",
    board: [],
    resources: { pp: 10 },
    pp: 10
  };
}
