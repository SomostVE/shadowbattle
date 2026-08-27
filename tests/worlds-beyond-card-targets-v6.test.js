import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

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
  return { id, name, class: className, type, cost, attack, defense, text, keywords };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { cost: 9 }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "card-targets-v6",
    firstPlayer: 0,
    players: [
      { name: "Human", className: "Portalcraft", deck: deck("A") },
      { name: "CPU", className: "Neutral", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function installHandCard(game, definition) {
  const instance = game.players[0].hand[0];
  instance.card = definition;
  instance.cardId = definition.id;
  return instance;
}

function boardFollower(game, owner, id, { attack = 2, defense = 6, aura = false, ambush = false } = {}) {
  const unit = {
    instanceId: `${owner}:${id}`,
    owner,
    cardId: id,
    card: card(id, { name: String(id), type: "Follower", attack, defense }),
    attack,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  if (aura) unit.aura = true;
  if (ambush) unit.ambush = true;
  game.players[owner].board.push(unit);
  return unit;
}

function boardAmulet(game, owner, id, { text = "", countdown = null } = {}) {
  const amulet = {
    instanceId: `${owner}:${id}`,
    owner,
    cardId: id,
    card: card(id, { name: String(id), type: "Amulet", attack: 0, defense: 0, text }),
    countdown,
    playedTurn: 0,
    engagedThisTurn: false
  };
  game.players[owner].board.push(amulet);
  return amulet;
}

function playActionsFor(game, instance) {
  return game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === instance.instanceId);
}

test("enemy card banish targets both followers and amulets and banish creates no Shadow", () => {
  const game = readyGame();
  const tears = installHandCard(game, card(10701310, {
    name: "Tears of Degradation",
    type: "Spell",
    cost: 4,
    text: "Select an enemy card on the field and banish it."
  }));
  const follower = boardFollower(game, 1, "enemy-follower");
  const amulet = boardAmulet(game, 1, "enemy-amulet", { text: "Last Words: Deal 5 damage to the enemy leader." });
  const enemyShadowsBefore = Number(game.players[1].resources.shadows ?? 0);
  const humanHpBefore = game.players[0].hp;

  const actions = playActionsFor(game, tears);
  assert.deepEqual(new Set(actions.map(action => action.targetInstanceId)), new Set([follower.instanceId, amulet.instanceId]));

  game.dispatch(actions.find(action => action.targetInstanceId === amulet.instanceId));

  assert.equal(game.findBoardCard(1, amulet.instanceId), null);
  assert.ok(game.players[1].banished.some(item => item.instanceId === amulet.instanceId));
  assert.ok(!game.players[1].cemetery.some(item => item.instanceId === amulet.instanceId));
  assert.equal(game.players[1].resources.shadows, enemyShadowsBefore);
  assert.equal(game.players[0].hp, humanHpBefore);

  const banished = game.events.findLast(event => event.type === BATTLE_EVENT.CARD_BANISHED && event.payload?.card?.instanceId === amulet.instanceId);
  assert.equal(banished?.payload.reason, "ability");
});

test("enemy card targeting keeps Aura and Ambush followers protected while allowing amulets", () => {
  const game = readyGame();
  const tears = installHandCard(game, card("tears-protection", {
    name: "Tears of Degradation",
    type: "Spell",
    cost: 4,
    text: "Select an enemy card on the field and banish it."
  }));
  const aura = boardFollower(game, 1, "aura-follower", { aura: true });
  const ambush = boardFollower(game, 1, "ambush-follower", { ambush: true });
  const amulet = boardAmulet(game, 1, "targetable-amulet");

  const actions = playActionsFor(game, tears);
  assert.deepEqual(actions.map(action => action.targetInstanceId), [amulet.instanceId]);
  assert.ok(!actions.some(action => action.targetInstanceId === aura.instanceId));
  assert.ok(!actions.some(action => action.targetInstanceId === ambush.instanceId));
});

test("Melodious Monody destroys an allied amulet through WB Last Words before its random damage", () => {
  const game = readyGame();
  const monody = installHandCard(game, card(90074310, {
    name: "Melodious Monody",
    className: "Portalcraft",
    type: "Spell",
    cost: 1,
    text: "Select an allied card on the field and destroy it. Deal 4 damage to a random enemy follower."
  }));
  const amulet = boardAmulet(game, 0, "last-words-amulet", { text: "Last Words: Draw a card." });
  const allyFollower = boardFollower(game, 0, "ally-follower");
  const enemy = boardFollower(game, 1, "damage-target", { defense: 9 });
  const shadowsBefore = Number(game.players[0].resources.shadows ?? 0);
  const handBefore = game.players[0].hand.length;

  const actions = playActionsFor(game, monody);
  assert.deepEqual(new Set(actions.map(action => action.targetInstanceId)), new Set([amulet.instanceId, allyFollower.instanceId]));

  game.dispatch(actions.find(action => action.targetInstanceId === amulet.instanceId));

  assert.equal(game.findBoardCard(0, amulet.instanceId), null);
  assert.ok(game.players[0].cemetery.some(item => item.instanceId === amulet.instanceId));
  assert.equal(game.findBoardCard(1, enemy.instanceId)?.defense, 5);
  assert.equal(game.players[0].resources.shadows, shadowsBefore + 2);
  assert.equal(game.players[0].hand.length, handBefore);

  const events = game.getEvents({ viewer: 0 });
  const destroyedIndex = events.findIndex(event => event.type === BATTLE_EVENT.AMULET_DESTROYED && event.payload.card?.instanceId === amulet.instanceId);
  const lastWordsIndex = events.findIndex((event, index) => index > destroyedIndex && event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "last-words" && event.payload.card?.instanceId === amulet.instanceId);
  const drawIndex = events.findIndex((event, index) => index > lastWordsIndex && event.type === BATTLE_EVENT.DRAW && event.payload?.reason === "ability");
  const damageIndex = events.findIndex((event, index) => index > lastWordsIndex && event.type === BATTLE_EVENT.FOLLOWER_DAMAGE && event.payload.target?.instanceId === enemy.instanceId);
  assert.ok(destroyedIndex >= 0 && lastWordsIndex > destroyedIndex && drawIndex > lastWordsIndex && damageIndex > drawIndex);
});

test("target plus Summon stays atomically unsupported until post-target summon ordering is migrated", () => {
  const game = readyGame();
  const soprano = installHandCard(game, card(10373310, {
    name: "Devastating Soprano",
    className: "Portalcraft",
    type: "Spell",
    cost: 2,
    text: "Select an allied card on the field and destroy it. Summon a White Psalm, New Revelation."
  }));
  const amulet = boardAmulet(game, 0, "soprano-target");

  const support = getWorldsBeyondTriggerSupport(soprano, "play", null, game.players[0]);
  assert.equal(support.supported, false);
  assert.match(support.residual, /Summon a White Psalm New Revelation/i);
  assert.equal(playActionsFor(game, soprano).length, 0);
  assert.ok(game.findBoardCard(0, amulet.instanceId));
});
