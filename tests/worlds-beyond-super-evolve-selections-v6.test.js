import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function card(id, extra = {}) {
  return {
    id,
    name: String(id),
    class: "Neutral",
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 1,
    traits: [],
    keywords: [],
    text: "",
    ...extra
  };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { name: `${prefix} ${index}`, cost: 9 }));
}

function readyGame(catalog = []) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "super-evolve-selections-v6",
    firstPlayer: 0,
    cardCatalog: catalog,
    players: [{ name: "A", deck: deck("A") }, { name: "B", deck: deck("B") }]
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

function boardFollower(game, owner, definition, instanceId) {
  const follower = {
    instanceId,
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
  game.players[owner].board.push(follower);
  return follower;
}

function replaceDeckCard(game, index, definition) {
  const instance = game.players[0].deck[index];
  instance.card = definition;
  instance.cardId = definition.id;
  return instance;
}

test("additive Super Evo exposes independent Evo and Super Evo targets", () => {
  const sourceDef = card("dual-target-super", {
    name: "Dual Target Super",
    cost: 4,
    attack: 3,
    defense: 4,
    text: "Evolve: Select an enemy follower on the field and deal it 1 damage.\n\nSuper-Evolve: Select an enemy follower on the field and deal it 2 damage."
  });
  const enemyDef = card("dual-target-enemy", { name: "Dual Target Enemy", defense: 6 });
  const game = readyGame([sourceDef, enemyDef]);
  const source = boardFollower(game, 0, sourceDef, "source-dual-target");
  const enemyA = boardFollower(game, 1, enemyDef, "enemy-a");
  const enemyB = boardFollower(game, 1, enemyDef, "enemy-b");

  const actions = game.listLegalActions(0).filter(action => action.type === "super-evolve" && action.followerInstanceId === source.instanceId);
  assert.equal(actions.length, 4);
  const split = actions.find(action => action.evolveTargetInstanceId === enemyA.instanceId && action.superEvolveTargetInstanceId === enemyB.instanceId);
  assert.ok(split, "the action graph contains the A-then-B target combination");

  game.dispatch(split);

  assert.equal(game.findBoardCard(1, enemyA.instanceId)?.defense, 5);
  assert.equal(game.findBoardCard(1, enemyB.instanceId)?.defense, 4);
  assert.equal(source.superEvolved, true);
});

test("a selected Super Evo mode does not hide the preceding natural Evo text", () => {
  const sourceDef = card("super-mode-after-evo", {
    name: "Super Mode After Evo",
    cost: 4,
    attack: 3,
    defense: 4,
    text: "Evolve: Draw a card.\n\nSuper-Evolve: Select a Mode to activate.\n1. Restore 2 defense to your leader.\n2. Deal 2 damage to a random enemy follower."
  });
  const drawDef = card("natural-evo-draw", { name: "Natural Evo Draw" });
  const game = readyGame([sourceDef, drawDef]);
  const source = boardFollower(game, 0, sourceDef, "source-super-mode");
  replaceDeckCard(game, 0, drawDef);
  game.players[0].hp = 10;

  const actions = game.listLegalActions(0).filter(action => action.type === "super-evolve" && action.followerInstanceId === source.instanceId);
  assert.equal(actions.length, 2);
  const heal = actions.find(action => action.superEvolveMode?.modeIndex === 1);
  assert.ok(heal);
  const deckBefore = game.players[0].deck.length;

  game.dispatch(heal);

  assert.equal(deckBefore - game.players[0].deck.length, 1, "natural Evo draw resolves first");
  assert.equal(game.players[0].hp, 12, "selected Super Evo mode resolves afterwards");
});

test("optional Super Evo selection no longer skips the natural Evo effect", () => {
  const sourceDef = card("optional-super-after-evo", {
    name: "Optional Super After Evo",
    cost: 4,
    attack: 3,
    defense: 4,
    text: "Evolve: Draw a card.\n\nSuper-Evolve: Select another allied card on the field. If you selected one, destroy it and draw 2 cards."
  });
  const allyDef = card("optional-super-ally", { name: "Optional Super Ally", defense: 3 });
  const game = readyGame([sourceDef, allyDef]);
  const source = boardFollower(game, 0, sourceDef, "source-optional-super");
  const ally = boardFollower(game, 0, allyDef, "optional-super-ally-instance");
  const actions = game.listLegalActions(0).filter(action => action.type === "super-evolve" && action.followerInstanceId === source.instanceId);
  const targeted = actions.find(action => action.superEvolveOptionalAlliedCardInstanceId === ally.instanceId);
  assert.ok(targeted);
  const deckBefore = game.players[0].deck.length;

  game.dispatch(targeted);

  assert.equal(game.findBoardCard(0, ally.instanceId), null);
  assert.equal(deckBefore - game.players[0].deck.length, 3, "Evo draws 1, then Super Evo selection draws 2");
});
