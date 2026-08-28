import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function card(id, { name = id, type = "Follower", cost = 1, attack = 1, defense = 1, text = "", keywords = [] } = {}) {
  return { id, name, type, cost, attack, defense, text, keywords };
}

function deck(prefix, firstCard) {
  return [firstCard, ...Array.from({ length: 39 }, (_, index) => card(`${prefix}-${index}`, { name: `${prefix} ${index}` }))];
}

function begin(targetedCard) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "targeting-test",
    firstPlayer: 0,
    players: [
      { name: "Human", deck: deck("A", targetedCard) },
      { name: "CPU", deck: deck("B", card("enemy-anchor", { name: "Enemy Anchor", attack: 2, defense: 5 })) }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function forceCardIntoHand(game, sourceCard) {
  const instance = game.players[0].deck.find(item => item.cardId === sourceCard.id) ?? game.players[0].hand.find(item => item.cardId === sourceCard.id);
  assert.ok(instance, `missing ${sourceCard.id}`);
  game.players[0].deck = game.players[0].deck.filter(item => item !== instance);
  game.players[0].hand = game.players[0].hand.filter(item => item !== instance);
  game.players[0].hand.push(instance);
  return instance;
}

function forceEnemyFollower(game, { defense = 5 } = {}) {
  const instance = game.players[1].hand[0];
  game.players[1].hand.shift();
  instance.card = { ...instance.card, type: "Follower", attack: 2, defense };
  instance.attack = 2;
  instance.defense = defense;
  instance.maxDefense = defense;
  instance.attacksRemaining = 0;
  instance.canAttackFollowers = false;
  instance.canAttackLeader = false;
  game.players[1].board.push(instance);
  return instance;
}

test("targeted damage creates one legal play branch per enemy follower and resolves the chosen target", () => {
  const spell = card("targeted-damage", { name: "Precise Bolt", type: "Spell", cost: 2, text: "Deal 3 damage to an enemy follower." });
  const game = begin(spell);
  const spellInstance = forceCardIntoHand(game, spell);
  const first = forceEnemyFollower(game, { defense: 5 });
  const second = forceEnemyFollower(game, { defense: 4 });

  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === spellInstance.instanceId);
  assert.equal(actions.length, 2);
  assert.deepEqual(new Set(actions.map(action => action.targetInstanceId)), new Set([first.instanceId, second.instanceId]));

  game.dispatch(actions.find(action => action.targetInstanceId === second.instanceId));
  assert.equal(game.findBoardCard(1, first.instanceId).defense, 5);
  assert.equal(game.findBoardCard(1, second.instanceId).defense, 1);

  const trigger = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.cardId === spell.id);
  assert.equal(trigger?.payload.resolved, true);
  assert.equal(trigger?.payload.target?.instanceId, second.instanceId);
});

test("follower-or-leader damage creates an explicit leader branch without changing the follower branch", () => {
  const spell = card("follower-or-leader-damage", {
    name: "Gilded Blade Pattern",
    type: "Spell",
    cost: 2,
    text: "Select an enemy follower on the field or the enemy leader and deal it 3 damage."
  });
  const game = begin(spell);
  const spellInstance = forceCardIntoHand(game, spell);
  const follower = forceEnemyFollower(game, { defense: 6 });
  const enemyHpBefore = game.players[1].hp;

  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === spellInstance.instanceId);
  assert.equal(actions.length, 2);
  assert.ok(actions.some(action => action.targetInstanceId === follower.instanceId));
  const leaderAction = actions.find(action => action.targetInstanceId !== follower.instanceId);
  assert.ok(leaderAction);
  assert.match(leaderAction.targetInstanceId, /^leader:1$/);

  game.dispatch(leaderAction);

  assert.equal(game.players[1].hp, enemyHpBefore - 3);
  assert.equal(game.findBoardCard(1, follower.instanceId)?.defense, 6);
  const trigger = game.getEvents({ viewer: 0 }).findLast(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.cardId === spell.id);
  assert.equal(trigger?.payload.resolved, true);
  assert.equal(trigger?.payload.target?.type, "leader");
  assert.equal(trigger?.payload.target?.playerIndex, 1);
});

test("follower-or-leader damage remains playable with an empty enemy board because the leader is a legal target", () => {
  const spell = card("leader-only-target", {
    name: "Ravening Tentacles Pattern",
    type: "Spell",
    cost: 2,
    text: "Select an enemy follower or the enemy leader and deal it 2 damage."
  });
  const game = begin(spell);
  const spellInstance = forceCardIntoHand(game, spell);
  const enemyHpBefore = game.players[1].hp;

  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === spellInstance.instanceId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].targetInstanceId, "leader:1");

  game.dispatch(actions[0]);
  assert.equal(game.players[1].hp, enemyHpBefore - 2);
});

test("a targeted destroy spell cannot be played without a legal enemy target", () => {
  const spell = card("targeted-destroy", { name: "Clean Removal", type: "Spell", cost: 2, text: "Select an enemy follower and destroy it." });
  const game = begin(spell);
  const spellInstance = forceCardIntoHand(game, spell);
  const noTargetActions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === spellInstance.instanceId);
  assert.equal(noTargetActions.length, 0);

  const target = forceEnemyFollower(game, { defense: 9 });
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spellInstance.instanceId && item.targetInstanceId === target.instanceId);
  assert.ok(action);
  game.dispatch(action);
  assert.equal(game.findBoardCard(1, target.instanceId), null);
});

test("targeted follower Fanfare can still be played when there is no legal enemy target", () => {
  const follower = card("targeted-fanfare", { name: "Target Hunter", type: "Follower", cost: 2, attack: 2, defense: 2, text: "Fanfare: Deal 2 damage to an enemy follower." });
  const game = begin(follower);
  const instance = forceCardIntoHand(game, follower);
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === instance.instanceId);
  assert.ok(action);
  assert.equal(action.targetInstanceId, undefined);
  game.dispatch(action);
  assert.ok(game.findBoardCard(0, instance.instanceId));
});
