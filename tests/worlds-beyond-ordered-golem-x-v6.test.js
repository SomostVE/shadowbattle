import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

const CLAY_GOLEM = Object.freeze({
  id: 90031110,
  name: "Clay Golem",
  class: "Runecraft",
  type: "Follower",
  cost: 1,
  attack: 2,
  defense: 2,
  traits: ["Golem"],
  keywords: [],
  text: ""
});

const EMMYLOU = Object.freeze({
  id: 10132120,
  name: "Emmylou, Witch of Wonder",
  class: "Runecraft",
  type: "Follower",
  cost: 5,
  attack: 4,
  defense: 4,
  traits: [],
  keywords: ["Spellboost", "Evolve"],
  text: "On Spellboost: Reduce the cost of this card by 1.\n\nEvolve: Summon a Clay Golem. Deal X damage to all enemy followers. X is the number of allied Golem followers on the field."
});

function card(id, { name = String(id), type = "Follower", cost = 9, attack = 1, defense = 1, traits = [] } = {}) {
  return { id, name, class: "Runecraft", type, cost, attack, defense, traits, keywords: [], text: "" };
}

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { name: `${prefix} ${index}` }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "ordered-golem-x-v6",
    firstPlayer: 0,
    cardCatalog: [EMMYLOU, CLAY_GOLEM],
    players: [
      { name: "A", className: "Runecraft", deck: fillerDeck("A") },
      { name: "B", className: "Runecraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  game.players[0].resources.evolutionAvailable = true;
  game.players[0].resources.evolutionPoints = 2;
  return game;
}

function replaceHandCard(game, definition, index = 0) {
  const instance = game.players[0].hand[index];
  instance.card = definition;
  instance.cardId = definition.id;
  instance.costDelta = 0;
  instance.spellboost = 0;
  game.registerCardDefinitions([definition]);
  return instance;
}

function boardFollower(game, owner, definition, suffix) {
  const unit = {
    instanceId: `${owner}:manual:${suffix}`,
    owner,
    cardId: definition.id,
    card: definition,
    attack: definition.attack,
    defense: definition.defense,
    maxDefense: definition.defense,
    evolved: false,
    superEvolved: false,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[owner].board.push(unit);
  game.registerCardDefinitions([definition]);
  return unit;
}

function playEmmylou(game) {
  const source = replaceHandCard(game, EMMYLOU);
  const play = game.listLegalActions(0).find(action =>
    action.type === "play-card" && action.cardInstanceId === source.instanceId
  );
  assert.ok(play);
  game.dispatch(play);
  return source;
}

function evolveEmmylou(game, source) {
  const evolve = game.listLegalActions(0).find(action =>
    action.type === "evolve" && action.followerInstanceId === source.instanceId
  );
  assert.ok(evolve, "Emmylou's supported Evolve must remain a legal action");
  game.dispatch(evolve);
}

test("Emmylou ordered Golem-count Evolve is structurally supported", () => {
  const game = readyGame();
  const source = replaceHandCard(game, EMMYLOU);
  const support = getWorldsBeyondTriggerSupport(source, "evolve", null, game.players[0]);

  assert.equal(support.supported, true);
  assert.equal(support.residual, "");
  assert.match(support.text, /Summon a Clay Golem/i);
  assert.match(support.text, /equal to the number of allied Golem followers/i);
  assert.doesNotMatch(support.text, /\bX\b/);
});

test("Emmylou summons before evaluating X, so an empty Golem board deals 1", () => {
  const game = readyGame();
  const source = playEmmylou(game);
  const enemy = boardFollower(game, 1, card("enemy-one", { defense: 5 }), "enemy-one");

  evolveEmmylou(game, source);

  assert.equal(game.players[0].board.filter(unit => unit.card?.name === "Clay Golem").length, 1);
  assert.equal(game.findBoardCard(1, enemy.instanceId)?.defense, 4);

  const events = game.getEvents({ viewer: 0 });
  const abilityIndex = events.findIndex(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.card?.instanceId === source.instanceId);
  const summonIndex = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_ENTER && event.payload?.card?.name === "Clay Golem");
  const damageIndex = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE && event.payload?.target?.instanceId === enemy.instanceId);
  assert.ok(abilityIndex >= 0 && summonIndex > abilityIndex && damageIndex > summonIndex);
});

test("Emmylou counts existing Golem followers plus the Clay Golem she actually summons", () => {
  const game = readyGame();
  const source = playEmmylou(game);
  boardFollower(game, 0, card("golem-a", { name: "Golem A", traits: ["Golem"] }), "golem-a");
  boardFollower(game, 0, card("golem-b", { name: "Golem B", traits: ["Golem"] }), "golem-b");
  boardFollower(game, 0, card("not-golem", { name: "Not a Golem" }), "not-golem");
  const enemy = boardFollower(game, 1, card("enemy-three", { defense: 6 }), "enemy-three");

  evolveEmmylou(game, source);

  assert.equal(game.findBoardCard(1, enemy.instanceId)?.defense, 3);
  assert.equal(game.players[0].board.filter(unit => unit.card?.traits?.includes("Golem")).length, 3);
});

test("Emmylou full-board Evolve counts only Golems that actually remain on the field", () => {
  const game = readyGame();
  const source = playEmmylou(game);
  boardFollower(game, 0, card("golem-a", { name: "Golem A", traits: ["Golem"] }), "golem-a");
  boardFollower(game, 0, card("golem-b", { name: "Golem B", traits: ["Golem"] }), "golem-b");
  boardFollower(game, 0, card("plain-a", { name: "Plain A" }), "plain-a");
  boardFollower(game, 0, card("plain-b", { name: "Plain B" }), "plain-b");
  assert.equal(game.players[0].board.length, 5);
  const enemy = boardFollower(game, 1, card("enemy-full", { defense: 6 }), "enemy-full");

  evolveEmmylou(game, source);

  assert.equal(game.players[0].board.length, 5);
  assert.equal(game.players[0].board.some(unit => unit.card?.name === "Clay Golem"), false);
  assert.equal(game.findBoardCard(1, enemy.instanceId)?.defense, 4);
});
