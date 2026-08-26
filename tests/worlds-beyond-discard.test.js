import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

const SPILLING_RED = Object.freeze({
  id: 10642310,
  name: "Spilling Red",
  class: "Dragoncraft",
  type: "Spell",
  cost: 1,
  attack: 0,
  defense: 0,
  traits: [],
  keywords: [],
  text: "Select a card in your hand and discard it. Select an enemy follower on the field and destroy it."
});

function filler(id, extra = {}) {
  return { id, name: id, class: "Dragoncraft", type: "Follower", cost: 9, attack: 1, defense: 1, traits: [], keywords: [], text: "", ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => filler(`${prefix}-${index}`));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "spilling-red-test",
    firstPlayer: 0,
    cardCatalog: [SPILLING_RED],
    players: [
      { name: "Human", className: "Dragoncraft", deck: deck("A") },
      { name: "CPU", className: "Dragoncraft", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(instance, card) {
  instance.card = card;
  instance.cardId = card.id;
  instance.costDelta = 0;
  instance.attackBonus = 0;
  instance.defenseBonus = 0;
  return instance;
}

function enemyFollower(game, { id = "enemy", defense = 3 } = {}) {
  const card = filler(id, { cost: 2, attack: 2, defense });
  const unit = {
    instanceId: `1:manual:${id}`,
    owner: 1,
    cardId: card.id,
    card,
    attack: card.attack,
    defense: card.defense,
    maxDefense: card.defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[1].board.push(unit);
  return unit;
}

function spillingSetup({ withDiscard = true, withTarget = true } = {}) {
  const game = readyGame();
  const spell = replaceHandCard(game.players[0].hand[0], SPILLING_RED);
  const discard = replaceHandCard(game.players[0].hand[1], filler("discard-me", { cost: 7, attack: 5, defense: 5 }));
  game.players[0].hand = withDiscard ? [spell, discard] : [spell];
  const target = withTarget ? enemyFollower(game) : null;
  return { game, spell, discard, target };
}

test("Spilling Red is not legal unless both Codex selections are available", () => {
  const noDiscard = spillingSetup({ withDiscard: false, withTarget: true });
  assert.equal(noDiscard.game.listLegalActions(0).some(action => action.type === "play-card" && action.cardInstanceId === noDiscard.spell.instanceId), false);

  const noTarget = spillingSetup({ withDiscard: true, withTarget: false });
  assert.equal(noTarget.game.listLegalActions(0).some(action => action.type === "play-card" && action.cardInstanceId === noTarget.spell.instanceId), false);
});

test("Spilling Red legal actions explicitly bind both the discard and enemy target", () => {
  const { game, spell, discard, target } = spillingSetup();
  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === spell.instanceId);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].discardInstanceId, discard.instanceId);
  assert.equal(actions[0].targetInstanceId, target.instanceId);
  assert.equal(actions[0].targetKind, "destroy");
});

test("Spilling Red rejects a missing discard before paying PP or moving cards", () => {
  const { game, spell } = spillingSetup();
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId);
  const malformed = { ...action };
  delete malformed.discardInstanceId;
  delete malformed.discardCardId;
  const ppBefore = game.players[0].resources.pp;
  const handBefore = game.players[0].hand.map(item => item.instanceId);
  const cemeteryBefore = game.players[0].cemetery.length;

  assert.throws(() => game.dispatch(malformed), /requires a card to discard/i);
  assert.equal(game.players[0].resources.pp, ppBefore);
  assert.deepEqual(game.players[0].hand.map(item => item.instanceId), handBefore);
  assert.equal(game.players[0].cemetery.length, cemeteryBefore);
});

test("Spilling Red discards first, destroys the selected follower and counts cemetery Shadows exactly once", () => {
  const { game, spell, discard, target } = spillingSetup();
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId && item.discardInstanceId === discard.instanceId && item.targetInstanceId === target.instanceId);
  assert.ok(action);

  game.dispatch(action);

  assert.equal(game.players[0].resources.pp, 9);
  assert.equal(game.players[0].hand.some(item => item.instanceId === spell.instanceId), false);
  assert.equal(game.players[0].hand.some(item => item.instanceId === discard.instanceId), false);
  assert.ok(game.players[0].cemetery.some(item => item.instanceId === spell.instanceId));
  assert.ok(game.players[0].cemetery.some(item => item.instanceId === discard.instanceId));
  assert.equal(game.findBoardCard(1, target.instanceId), null);
  assert.ok(game.players[1].cemetery.some(item => item.instanceId === target.instanceId));
  assert.equal(game.players[0].resources.shadows, 2, "the discarded card and resolved spell each create one Shadow");
  assert.equal(game.players[1].resources.shadows, 1, "the destroyed enemy follower creates one Shadow for its owner");

  const events = game.getEvents({ viewer: 0 });
  const ability = events.findIndex(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.instanceId === spell.instanceId);
  const discarded = events.findIndex(event => event.type === BATTLE_EVENT.CARD_DISCARDED && event.payload.card?.instanceId === discard.instanceId);
  const destroyed = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_DESTROYED && event.payload.card?.instanceId === target.instanceId);
  assert.ok(ability >= 0 && discarded > ability && destroyed > discarded);
  assert.equal(events[ability].payload.resolved, true);
  assert.equal(events[ability].payload.discard?.instanceId, discard.instanceId);
  assert.equal(events[ability].payload.target?.instanceId, target.instanceId);
});
