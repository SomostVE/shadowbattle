import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function card(id, extra = {}) {
  return {
    id,
    name: id,
    class: "Forestcraft",
    type: "Follower",
    cost: 1,
    attack: 2,
    defense: 2,
    text: "",
    keywords: [],
    ...extra
  };
}

function deck(prefix, special = null) {
  const rows = Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
  if (special) rows[0] = special;
  return rows;
}

function begin(special = null) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "targeted-evolution",
    firstPlayer: 0,
    players: [
      { name: "Human", className: "Forestcraft", deck: deck("A", special) },
      { name: "CPU", className: "Forestcraft", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function findInstance(game, playerIndex, cardId) {
  return [...game.players[playerIndex].hand, ...game.players[playerIndex].deck].find(item => item.cardId === cardId) ?? null;
}

function forceIntoHand(game, playerIndex, cardId) {
  const instance = findInstance(game, playerIndex, cardId);
  assert.ok(instance, `missing ${cardId}`);
  const player = game.players[playerIndex];
  player.hand = player.hand.filter(item => item !== instance);
  player.deck = player.deck.filter(item => item !== instance);
  player.hand.push(instance);
  return instance;
}

function enemyFollower(game, id, defense = 5) {
  const player = game.players[1];
  const instance = player.hand.shift() ?? player.deck.shift();
  assert.ok(instance);
  instance.card = card(id, { class: "Neutral", attack: 2, defense });
  instance.cardId = id;
  instance.attack = 2;
  instance.defense = defense;
  instance.maxDefense = defense;
  instance.attacksRemaining = 0;
  instance.hasAttacked = false;
  instance.canAttackFollowers = false;
  instance.canAttackLeader = false;
  instance.playedTurn = game.turn;
  player.board.push(instance);
  return instance;
}

function evolutionFollower(game, source) {
  const instance = forceIntoHand(game, 0, source.id);
  game.players[0].hand = game.players[0].hand.filter(item => item !== instance);
  instance.attack = Number(source.attack ?? 0);
  instance.defense = Number(source.defense ?? 0);
  instance.maxDefense = Number(source.defense ?? 0);
  instance.attacksRemaining = 1;
  instance.hasAttacked = false;
  instance.canAttackFollowers = true;
  instance.canAttackLeader = true;
  instance.playedTurn = game.turn - 1;
  instance.evolved = false;
  instance.superEvolved = false;
  game.players[0].board.push(instance);
  game.players[0].resources.evolutionAvailable = true;
  game.players[0].resources.evolutionPoints = 2;
  game.players[0].resources.superEvolutionAvailable = false;
  return instance;
}

test("Codex-style Combo Fanfare can set the selected enemy follower defense to 1", () => {
  const source = card("set-defense-fanfare", {
    keywords: ["Combo", "Fanfare"],
    text: "Fanfare: Combo (3) - Select an enemy follower on the field and set its defense to 1."
  });
  const game = begin(source);
  const hand = forceIntoHand(game, 0, source.id);
  game.players[0].cardsPlayedThisTurn = 2;
  game.players[0].resources.combo = 2;
  const first = enemyFollower(game, "first-target", 5);
  const second = enemyFollower(game, "second-target", 6);

  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === hand.instanceId);
  assert.equal(actions.length, 2);
  const chosen = actions.find(action => action.targetInstanceId === second.instanceId);
  assert.ok(chosen);
  game.dispatch(chosen);

  assert.equal(first.defense, 5);
  assert.equal(second.defense, 1);
  assert.equal(second.maxDefense, 1);
  const trigger = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.cardId === source.id);
  assert.equal(trigger?.payload.resolved, true);
  assert.equal(trigger?.payload.targetKind, "set-defense");
  assert.equal(trigger?.payload.target?.instanceId, second.instanceId);
});

test("targeted Evolve creates one legal evolution branch per enemy follower and resolves the chosen target", () => {
  const source = card("targeted-evolve", {
    attack: 3,
    defense: 3,
    keywords: ["Evolve"],
    text: "Evolve: Draw a card. Select an enemy follower on the field and deal it 1 damage."
  });
  const game = begin(source);
  const unit = evolutionFollower(game, source);
  const first = enemyFollower(game, "evolve-first", 5);
  const second = enemyFollower(game, "evolve-second", 5);
  const handBefore = game.players[0].hand.length;

  const actions = game.listLegalActions(0).filter(action => action.type === "evolve" && action.followerInstanceId === unit.instanceId);
  assert.equal(actions.length, 2);
  assert.deepEqual(new Set(actions.map(action => action.targetInstanceId)), new Set([first.instanceId, second.instanceId]));
  const chosen = actions.find(action => action.targetInstanceId === second.instanceId);
  assert.ok(chosen);
  game.dispatch(chosen);

  assert.equal(unit.evolved, true);
  assert.equal(unit.attack, 5);
  assert.equal(unit.defense, 5);
  assert.equal(first.defense, 5);
  assert.equal(second.defense, 4);
  assert.equal(game.players[0].hand.length, handBefore + 1);
  const trigger = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "evolve" && event.payload.card?.instanceId === unit.instanceId);
  assert.equal(trigger?.payload.resolved, true);
  assert.equal(trigger?.payload.target?.instanceId, second.instanceId);
});

test("a targeted Evolve remains legal without enemy followers and still resolves its non-targeted Draw", () => {
  const source = card("targeted-evolve-empty-board", {
    attack: 3,
    defense: 3,
    keywords: ["Evolve"],
    text: "Evolve: Draw a card. Select an enemy follower on the field and deal it 1 damage."
  });
  const game = begin(source);
  const unit = evolutionFollower(game, source);
  game.players[1].board = [];
  const handBefore = game.players[0].hand.length;

  const actions = game.listLegalActions(0).filter(action => action.type === "evolve" && action.followerInstanceId === unit.instanceId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].targetInstanceId, undefined);
  game.dispatch(actions[0]);

  assert.equal(unit.evolved, true);
  assert.equal(game.players[0].hand.length, handBefore + 1);
});
