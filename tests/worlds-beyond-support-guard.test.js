import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

const FEROCIOUS_FLAME = Object.freeze({
  id: 10343310,
  name: "Ferocious Flame",
  class: "Dragoncraft",
  type: "Spell",
  cost: 1,
  attack: 0,
  defense: 0,
  keywords: ["Overflow"],
  text: "Select an allied follower on the field and deal it 1 damage. Deal 3 damage to a random enemy follower. If you're in Overflow, draw a Dragoncraft follower."
});

const FAN_OF_OTOHIME = Object.freeze({
  id: 10143210,
  name: "Fan of Otohime",
  class: "Dragoncraft",
  type: "Amulet",
  cost: 1,
  attack: 0,
  defense: 0,
  keywords: ["Engage", "Otohime's Bodyguard"],
  text: "Engage (3): Summon an Otohime's Bodyguard. Select a card in your hand and discard it."
});

const CONDITIONAL_UNSUPPORTED = Object.freeze({
  id: "conditional-unsupported",
  name: "Conditional Unsupported",
  class: "Dragoncraft",
  type: "Spell",
  cost: 1,
  attack: 0,
  defense: 0,
  keywords: ["Overflow"],
  text: "Draw a card. If you're in Overflow, summon a Test Token."
});

const FANGS = Object.freeze({
  id: 90044320,
  name: "Fangs of Ardent Destruction",
  class: "Dragoncraft",
  type: "Spell",
  cost: 0,
  attack: 0,
  defense: 0,
  keywords: [],
  text: "Deal 1 damage to all followers."
});

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: []
  }));
}

function readyGame(maxPp = 10) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: `support-guard-${maxPp}`,
    firstPlayer: 0,
    players: [
      { name: "Dragon", className: "Dragoncraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = maxPp;
  return game;
}

function replaceHandCard(game, card) {
  const instance = game.players[0].hand[0];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

function follower(instanceId, owner, name = "Follower", defense = 5) {
  return {
    instanceId,
    owner,
    cardId: instanceId,
    card: { id: instanceId, name, type: "Follower", cost: 1, attack: 1, defense, keywords: [] },
    attack: 1,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
}

test("Ferocious Flame is withheld until allied targeting and filtered draw are fully supported", () => {
  const game = readyGame(7);
  const spell = replaceHandCard(game, FEROCIOUS_FLAME);
  game.players[0].board.push(follower("ally", 0, "Ally"));
  game.players[1].board.push(follower("enemy", 1, "Enemy"));

  const support = getWorldsBeyondTriggerSupport(spell, "play", null, game.players[0]);
  assert.equal(support.supported, false);
  assert.match(`${support.text} ${support.residual}`, /allied follower|Dragoncraft follower/i);
  assert.equal(game.listLegalActions(0).some(action => action.type === "play-card" && action.cardInstanceId === spell.instanceId), false);

  const pp = game.players[0].resources.pp;
  const hand = game.players[0].hand.length;
  const cemetery = game.players[0].cemetery.length;
  const allyDefense = game.players[0].board[0].defense;
  const enemyDefense = game.players[1].board[0].defense;
  assert.throws(
    () => game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId }),
    /not fully supported/i
  );
  assert.equal(game.players[0].resources.pp, pp);
  assert.equal(game.players[0].hand.length, hand);
  assert.equal(game.players[0].cemetery.length, cemetery);
  assert.equal(game.players[0].board[0].defense, allyDefense);
  assert.equal(game.players[1].board[0].defense, enemyDefense);
});

test("Fan of Otohime Engage is withheld instead of discarding without summoning", () => {
  const game = readyGame();
  const amulet = {
    instanceId: "fan-of-otohime",
    owner: 0,
    cardId: FAN_OF_OTOHIME.id,
    card: FAN_OF_OTOHIME,
    engagedThisTurn: false
  };
  game.players[0].board.push(amulet);

  const support = getWorldsBeyondTriggerSupport(amulet, "engage", null, game.players[0]);
  assert.equal(support.supported, false);
  assert.match(support.residual, /Summon an Otohime's Bodyguard/i);
  assert.equal(game.listLegalActions(0).some(action => action.type === "engage" && action.amuletInstanceId === amulet.instanceId), false);

  const pp = game.players[0].resources.pp;
  const hand = game.players[0].hand.length;
  const cemetery = game.players[0].cemetery.length;
  assert.throws(
    () => game.dispatch({ type: "engage", player: 0, amuletInstanceId: amulet.instanceId }),
    /not fully supported/i
  );
  assert.equal(game.players[0].resources.pp, pp);
  assert.equal(game.players[0].hand.length, hand);
  assert.equal(game.players[0].cemetery.length, cemetery);
  assert.equal(amulet.engagedThisTurn, false);
});

test("an unsupported Overflow suffix blocks a spell only while that branch is active", () => {
  const inactive = readyGame(6);
  const inactiveSpell = replaceHandCard(inactive, CONDITIONAL_UNSUPPORTED);
  const inactiveSupport = getWorldsBeyondTriggerSupport(inactiveSpell, "play", null, inactive.players[0]);
  assert.equal(inactiveSupport.supported, true);
  assert.equal(inactiveSupport.residual, "");
  const legal = inactive.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === inactiveSpell.instanceId);
  assert.ok(legal);
  const handBefore = inactive.players[0].hand.length;
  inactive.dispatch(legal);
  assert.equal(inactive.players[0].hand.length, handBefore, "spell leaves hand while Draw a card replaces it");

  const active = readyGame(7);
  const activeSpell = replaceHandCard(active, CONDITIONAL_UNSUPPORTED);
  const activeSupport = getWorldsBeyondTriggerSupport(activeSpell, "play", null, active.players[0]);
  assert.equal(activeSupport.supported, false);
  assert.match(activeSupport.residual, /summon a Test Token/i);
  assert.equal(active.listLegalActions(0).some(action => action.type === "play-card" && action.cardInstanceId === activeSpell.instanceId), false);
});

test("the support guard preserves known fully supported real card text", () => {
  const game = readyGame();
  const spell = replaceHandCard(game, FANGS);
  game.players[0].board.push(follower("ally", 0, "Ally", 3));
  game.players[1].board.push(follower("enemy", 1, "Enemy", 3));

  const support = getWorldsBeyondTriggerSupport(spell, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.equal(support.residual, "");
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId);
  assert.ok(action);
  game.dispatch(action);
  assert.equal(game.players[0].board[0].defense, 2);
  assert.equal(game.players[1].board[0].defense, 2);
});
