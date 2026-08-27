import test from "node:test";
import assert from "node:assert/strict";
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
    seed: "ability-destruction-immunity-v6",
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

function boardFollower(game, owner, definition) {
  const unit = {
    instanceId: `${owner}:${definition.id}`,
    owner,
    cardId: definition.id,
    card: definition,
    attack: Number(definition.attack ?? 0),
    defense: Number(definition.defense ?? 0),
    maxDefense: Number(definition.defense ?? 0),
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[owner].board.push(unit);
  return unit;
}

function playActionsFor(game, instance) {
  return game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === instance.instanceId);
}

const LISHENNA_TEXT = "Fanfare: Add a Melodious Monody to your hand.\n\nCan't be destroyed by abilities.\n\nEvolve: Summon a White Psalm, New Revelation.";

test("Lishenna passive destruction immunity is excluded from Fanfare support text", () => {
  const game = readyGame();
  const lishenna = {
    instanceId: "lishenna-preview",
    cardId: 10374120,
    card: card(10374120, {
      name: "Lishenna, Melody Manifest",
      className: "Portalcraft",
      type: "Follower",
      cost: 4,
      attack: 3,
      defense: 4,
      text: LISHENNA_TEXT
    })
  };

  const support = getWorldsBeyondTriggerSupport(lishenna, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.equal(support.text, "Add a Melodious Monody to your hand.");
  assert.doesNotMatch(support.text, /destroyed by abilities|Evolve:/i);
});

test("Melodious Monody can select Lishenna, fails to destroy her, then still deals 4 damage", () => {
  const game = readyGame();
  const monody = installHandCard(game, card(90074310, {
    name: "Melodious Monody",
    className: "Portalcraft",
    type: "Spell",
    cost: 1,
    text: "Select an allied card on the field and destroy it. Deal 4 damage to a random enemy follower."
  }));
  const lishenna = boardFollower(game, 0, card(10374120, {
    name: "Lishenna, Melody Manifest",
    className: "Portalcraft",
    attack: 3,
    defense: 4,
    text: LISHENNA_TEXT
  }));
  const enemy = boardFollower(game, 1, card("enemy", { attack: 2, defense: 9 }));
  const shadowsBefore = Number(game.players[0].resources.shadows ?? 0);

  const action = playActionsFor(game, monody).find(item => item.targetInstanceId === lishenna.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.ok(game.findBoardCard(0, lishenna.instanceId));
  assert.equal(game.findBoardCard(1, enemy.instanceId)?.defense, 5);
  assert.equal(game.players[0].resources.shadows, shadowsBefore + 1);
  assert.ok(!game.players[0].cemetery.some(item => item.instanceId === lishenna.instanceId));
});

test("a direct enemy Destroy ability resolves but cannot destroy an immune follower", () => {
  const game = readyGame();
  const destroySpell = installHandCard(game, card("direct-destroy", {
    name: "Direct Destroy",
    type: "Spell",
    cost: 2,
    text: "Select an enemy follower on the field and destroy it."
  }));
  const immune = boardFollower(game, 1, card("immune-target", {
    attack: 2,
    defense: 3,
    text: "Can't be destroyed by abilities."
  }));
  const targetShadowsBefore = Number(game.players[1].resources.shadows ?? 0);

  const action = playActionsFor(game, destroySpell).find(item => item.targetInstanceId === immune.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.ok(game.findBoardCard(1, immune.instanceId));
  assert.equal(game.players[1].resources.shadows, targetShadowsBefore);
  assert.ok(!game.players[1].cemetery.some(item => item.instanceId === immune.instanceId));
});

test("lethal ability damage still destroys a follower with direct-destruction immunity", () => {
  const game = readyGame();
  const damageSpell = installHandCard(game, card("lethal-damage", {
    name: "Lethal Damage",
    type: "Spell",
    cost: 2,
    text: "Select an enemy follower on the field and deal it 5 damage."
  }));
  const immune = boardFollower(game, 1, card("damage-immune-target", {
    attack: 2,
    defense: 4,
    text: "Can't be destroyed by abilities."
  }));
  const targetShadowsBefore = Number(game.players[1].resources.shadows ?? 0);

  const action = playActionsFor(game, damageSpell).find(item => item.targetInstanceId === immune.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, immune.instanceId), null);
  assert.ok(game.players[1].cemetery.some(item => item.instanceId === immune.instanceId));
  assert.equal(game.players[1].resources.shadows, targetShadowsBefore + 1);
});

test("defense reduction to zero still destroys a follower with direct-destruction immunity", () => {
  const game = readyGame();
  const debuffSpell = installHandCard(game, card("lethal-debuff", {
    name: "Lethal Debuff",
    type: "Spell",
    cost: 2,
    text: "Select an enemy follower on the field and give it -0/-4."
  }));
  const immune = boardFollower(game, 1, card("debuff-immune-target", {
    attack: 2,
    defense: 4,
    text: "Can't be destroyed by abilities."
  }));
  const targetShadowsBefore = Number(game.players[1].resources.shadows ?? 0);

  const action = playActionsFor(game, debuffSpell).find(item => item.targetInstanceId === immune.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, immune.instanceId), null);
  assert.ok(game.players[1].cemetery.some(item => item.instanceId === immune.instanceId));
  assert.equal(game.players[1].resources.shadows, targetShadowsBefore + 1);
});
