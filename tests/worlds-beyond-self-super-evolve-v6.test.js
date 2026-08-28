import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { stripWorldsBeyondGenericEffectText } from "../src/core/rulesets/svwb/generic-effects.js";

function card(id, {
  name = String(id),
  className = "Swordcraft",
  type = "Follower",
  cost = 0,
  attack = 1,
  defense = 1,
  text = "",
  keywords = []
} = {}) {
  return { id, name, class: className, type, cost, attack, defense, text, keywords, traits: [] };
}

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, {
    name: `${prefix} ${index}`,
    className: "Neutral",
    cost: 9
  }));
}

function readyGame(cardCatalog = []) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "self-super-evolve-v6",
    firstPlayer: 0,
    cardCatalog,
    players: [
      { name: "A", className: "Swordcraft", deck: fillerDeck("A") },
      { name: "B", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 8;
  game.players[0].resources.maxPp = 8;
  return game;
}

function replaceHandCard(game, definition, index = 0) {
  const instance = game.players[0].hand[index];
  instance.card = definition;
  instance.cardId = definition.id;
  game.registerCardDefinitions([definition]);
  return instance;
}

function playAction(game, source, predicate = () => true) {
  return game.listLegalActions(0).find(action =>
    action.type === "play-card" &&
    action.cardInstanceId === source.instanceId &&
    predicate(action)
  );
}

test("generic effect grammar distinguishes Super-evolve from normal Evolve", () => {
  const superResidual = stripWorldsBeyondGenericEffectText("Super-evolve this follower.");
  const normalResidual = stripWorldsBeyondGenericEffectText("Evolve this follower.");

  assert.doesNotMatch(superResidual, /Super-/i);
  assert.equal(superResidual.replace(/[\s.;,:!?]/g, ""), "");
  assert.equal(normalResidual.replace(/[\s.;,:!?]/g, ""), "");
});

test("ability Super-Evolution gives +3/+3, spends no SEP and still triggers natural evolution text", () => {
  const game = readyGame();
  const source = replaceHandCard(game, card("ability-super-evolver", {
    name: "Ability Super Evolver",
    attack: 1,
    defense: 2,
    keywords: ["Fanfare"],
    text: "Fanfare: Super-evolve this follower.\n\nWhen this follower evolves, Draw 1 card."
  }));
  const sepBefore = game.players[0].resources.superEvolutionPoints;
  const handBefore = game.players[0].hand.length;

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  const evolved = game.findBoardCard(0, source.instanceId);
  assert.equal(evolved.evolved, true);
  assert.equal(evolved.superEvolved, true);
  assert.equal(evolved.attack, 4);
  assert.equal(evolved.defense, 5);
  assert.equal(evolved.maxDefense, 5);
  assert.equal(game.players[0].resources.superEvolutionPoints, sepBefore);
  assert.equal(game.players[0].evolutionActionUsed, false);
  assert.equal(game.players[0].hand.length, handBefore, "play one then natural evolution Draw 1 should restore hand size");

  const superEvent = game.getEvents({ viewer: 0 }).find(event =>
    event.type === BATTLE_EVENT.SUPER_EVOLVE && event.payload?.card?.instanceId === source.instanceId
  );
  assert.equal(superEvent?.payload?.byAbility, true);
});

test("played follower does not count itself toward its Rally Fanfare", () => {
  const game = readyGame();
  game.players[0].resources.rally = 19;
  const source = replaceHandCard(game, card("gildaria-rally-19", {
    name: "Gildaria Rally 19",
    attack: 3,
    defense: 3,
    keywords: ["Fanfare", "Rally"],
    text: "Fanfare: Rally (20) - Super-evolve this follower."
  }));

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  const follower = game.findBoardCard(0, source.instanceId);
  assert.equal(follower.evolved, false);
  assert.equal(follower.superEvolved, false);
  assert.equal(game.players[0].resources.rally, 20);
});

test("Rally 20 can Super-Evolve the played follower before its own Rally increment", () => {
  const game = readyGame();
  game.players[0].resources.rally = 20;
  const source = replaceHandCard(game, card("gildaria-rally-20", {
    name: "Gildaria Rally 20",
    attack: 3,
    defense: 3,
    keywords: ["Fanfare", "Rally"],
    text: "Fanfare: Rally (20) - Super-evolve this follower."
  }));
  const sepBefore = game.players[0].resources.superEvolutionPoints;

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  const follower = game.findBoardCard(0, source.instanceId);
  assert.equal(follower.evolved, true);
  assert.equal(follower.superEvolved, true);
  assert.equal(follower.attack, 6);
  assert.equal(follower.defense, 6);
  assert.equal(game.players[0].resources.rally, 21);
  assert.equal(game.players[0].resources.superEvolutionPoints, sepBefore);
});

test("Golden Knight Mode 1 exposes and resolves self Super-Evolution without Enhance 9", () => {
  const goldenKnight = card(10423110, {
    name: "Golden Knight, True King's Blade",
    cost: 1,
    attack: 4,
    defense: 4,
    keywords: ["Fanfare", "Mode", "Enhance"],
    text: "Fanfare: Select a Mode to activate.\n1. Super-evolve this follower.\n2. Deal 4 damage to all enemy followers.\n3. Restore 4 defense to your leader.\nEnhance (9): Activate all of them instead."
  });
  const game = readyGame([goldenKnight]);
  const source = replaceHandCard(game, goldenKnight);
  const sepBefore = game.players[0].resources.superEvolutionPoints;

  const modeOne = playAction(game, source, action => action.playMode?.modeIndex === 1);
  assert.ok(modeOne, "Mode 1 must remain an explicit legal action below Enhance 9");
  game.dispatch(modeOne);

  const follower = game.findBoardCard(0, source.instanceId);
  assert.equal(follower.evolved, true);
  assert.equal(follower.superEvolved, true);
  assert.equal(follower.attack, 7);
  assert.equal(follower.defense, 7);
  assert.equal(game.players[0].resources.superEvolutionPoints, sepBefore);
});
