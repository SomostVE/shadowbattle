import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function card(id, extra = {}) {
  return { id, name: id, type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function startedGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "strike-zones-test",
    firstPlayer: 0,
    players: [
      { name: "Human", deck: deck("A") },
      { name: "CPU", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function makeInstance(owner, source, suffix) {
  return {
    instanceId: `${owner}:${suffix}:${source.id}`,
    owner,
    cardId: source.id,
    card: source,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0
  };
}

function putSpellInHand(game, source) {
  const instance = makeInstance(0, source, "spell");
  game.players[0].hand.push(instance);
  return instance;
}

function putFollowerOnBoard(game, owner, source, suffix = "board") {
  const instance = makeInstance(owner, source, suffix);
  instance.attack = Number(source.attack ?? 0);
  instance.defense = Number(source.defense ?? 0);
  instance.maxDefense = Number(source.defense ?? 0);
  instance.attacksRemaining = 1;
  instance.canAttackFollowers = true;
  instance.canAttackLeader = true;
  instance.evolved = false;
  instance.superEvolved = false;
  game.players[owner].board.push(instance);
  return instance;
}

test("Strike resolves after attack declaration and before leader combat damage", () => {
  const game = startedGame();
  const striker = putFollowerOnBoard(game, 0, card("striker", {
    attack: 3,
    defense: 3,
    keywords: ["Storm"],
    text: "Storm\nStrike: Deal 2 damage to the enemy leader."
  }));

  const action = game.listLegalActions(0).find(item => item.type === "attack" && item.attackerInstanceId === striker.instanceId && item.target === "leader");
  assert.ok(action);
  game.dispatch(action);
  assert.equal(game.players[1].hp, 15);

  const events = game.getEvents({ viewer: 0 });
  const start = events.findIndex(event => event.type === BATTLE_EVENT.ATTACK_START && event.payload.attacker?.instanceId === striker.instanceId);
  const strike = events.findIndex((event, index) => index > start && event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "strike");
  const strikeDamage = events.findIndex((event, index) => index > strike && event.type === BATTLE_EVENT.LEADER_DAMAGE && event.payload.reason === "ability");
  const impact = events.findIndex((event, index) => index > strikeDamage && event.type === BATTLE_EVENT.ATTACK_IMPACT);
  const combatDamage = events.findIndex((event, index) => index > impact && event.type === BATTLE_EVENT.LEADER_DAMAGE && event.payload.reason === "damage");
  assert.ok(start >= 0 && strike > start && strikeDamage > strike && impact > strikeDamage && combatDamage > impact);
});

test("targeted Banish moves the follower to banished without triggering Last Words", () => {
  const game = startedGame();
  const spellCard = card("banish-spell", { type: "Spell", cost: 2, attack: 0, defense: 0, text: "Banish an enemy follower." });
  const spell = putSpellInHand(game, spellCard);
  const victim = putFollowerOnBoard(game, 1, card("last-words-victim", {
    attack: 2,
    defense: 2,
    text: "Last Words: Deal 5 damage to the enemy leader."
  }), "victim");

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId && item.targetInstanceId === victim.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, victim.instanceId), null);
  assert.ok(game.players[1].banished.some(item => item.instanceId === victim.instanceId));
  assert.equal(game.players[0].hp, 20);
  assert.ok(!game.getEvents({ viewer: 0 }).some(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "last-words" && event.payload.card?.instanceId === victim.instanceId));
});

test("targeted return moves a follower to its owner's hand and clears board-only evolution state", () => {
  const game = startedGame();
  const spellCard = card("return-spell", { type: "Spell", cost: 2, attack: 0, defense: 0, text: "Return an enemy follower to its owner's hand." });
  const spell = putSpellInHand(game, spellCard);
  const victim = putFollowerOnBoard(game, 1, card("return-victim", { attack: 4, defense: 4, text: "Last Words: Deal 5 damage to the enemy leader." }), "victim");
  victim.evolved = true;
  victim.superEvolved = true;
  victim.attack = 9;
  victim.defense = 8;
  victim.maxDefense = 8;
  victim.costDelta = -1;

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId && item.targetInstanceId === victim.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, victim.instanceId), null);
  const returned = game.players[1].hand.find(item => item.instanceId === victim.instanceId);
  assert.ok(returned);
  assert.equal(returned.evolved, undefined);
  assert.equal(returned.superEvolved, undefined);
  assert.equal(returned.attack, undefined);
  assert.equal(returned.costDelta, 0);
  assert.equal(game.players[0].hp, 20);
  assert.ok(!game.getEvents({ viewer: 0 }).some(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "last-words" && event.payload.card?.instanceId === victim.instanceId));
});

test("a returned card becomes a shadow when its owner's hand is already full", () => {
  const game = startedGame();
  while (game.players[1].hand.length < game.ruleset.maxHandSize) {
    const next = game.players[1].deck.shift();
    assert.ok(next);
    game.players[1].hand.push(next);
  }
  const spellCard = card("full-hand-return", { type: "Spell", cost: 2, attack: 0, defense: 0, text: "Return an enemy follower to its owner's hand." });
  const spell = putSpellInHand(game, spellCard);
  const victim = putFollowerOnBoard(game, 1, card("overflow-victim", { attack: 2, defense: 2 }), "overflow");

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId && item.targetInstanceId === victim.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[1].hand.length, game.ruleset.maxHandSize);
  assert.ok(game.players[1].cemetery.some(item => item.instanceId === victim.instanceId));
  const returnedEvent = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.CARD_RETURNED && event.payload.card?.instanceId === victim.instanceId);
  assert.equal(returnedEvent?.payload.handFull, true);
  assert.equal(returnedEvent?.payload.destination, "cemetery");
});
