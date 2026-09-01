import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { applyWorldsBeyondCombatAction } from "../src/core/rulesets/svwb/combat-actions.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: []
  }));
}

function readyGame(seed = "opposing-follower-strike-v6") {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed,
    firstPlayer: 0,
    players: [
      { name: "A", deck: fillerDeck("A") },
      { name: "B", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function definition(id, { attack = 1, defense = 1, text = "", keywords = [] } = {}) {
  return { id, name: id, class: "Neutral", type: "Follower", cost: 1, attack, defense, text, keywords, traits: [] };
}

function boardFollower(game, card, owner, suffix, { playedTurn = 0 } = {}) {
  return {
    instanceId: `${card.id}-${owner}-${suffix}`,
    owner,
    cardId: card.id,
    card,
    attack: card.attack,
    defense: card.defense,
    maxDefense: card.defense,
    attackLimit: 1,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true,
    playedTurn,
    evolved: false,
    superEvolved: false
  };
}

function attackFollower(game, attacker, target) {
  return applyWorldsBeyondCombatAction(game, {
    type: "attack",
    player: 0,
    attackerInstanceId: attacker.instanceId,
    targetInstanceId: target.instanceId
  });
}

test("Victoria-style Follower Strike damages the opposing follower before normal combat", () => {
  const game = readyGame("victoria-order");
  const victoriaCard = definition("victoria-style", {
    attack: 2,
    defense: 5,
    keywords: ["Rush", "Strike"],
    text: "Rush\nFollower Strike: Deal X damage to the opposing follower. X is this follower's attack."
  });
  const targetCard = definition("target", { attack: 1, defense: 6 });
  const victoria = boardFollower(game, victoriaCard, 0, "victoria", { playedTurn: game.turn });
  const target = boardFollower(game, targetCard, 1, "target");
  game.registerCardDefinitions([victoriaCard, targetCard]);
  game.players[0].board.push(victoria);
  game.players[1].board.push(target);
  const support = getWorldsBeyondTriggerSupport(victoria, "strike", null, game.players[0]);
  const before = game.events.length;

  attackFollower(game, victoria, target);

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(target.defense, 2, "2 Strike damage resolves before the later 2 combat damage");
  assert.equal(victoria.defense, 4);
  const events = game.events.slice(before);
  const start = events.findIndex(event => event.type === BATTLE_EVENT.ATTACK_START);
  const abilityDamage = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE && event.payload?.reason === "ability");
  const impact = events.findIndex(event => event.type === BATTLE_EVENT.ATTACK_IMPACT);
  assert.ok(start >= 0 && abilityDamage > start && impact > abilityDamage);
});

test("lethal opposing-follower Strike damage destroys through the normal Shadow and Last Words pipeline before combat", () => {
  const game = readyGame("victoria-lethal");
  const token = { id: "last-word-token", name: "Last Word Token", class: "Neutral", type: "Follower", cost: 1, attack: 1, defense: 1, keywords: [], text: "" };
  const attackerCard = definition("lethal-striker", {
    attack: 3,
    defense: 5,
    keywords: ["Rush", "Strike"],
    text: "Rush\nFollower Strike: Deal 3 damage to the opposing follower."
  });
  const targetCard = definition("last-word-target", {
    attack: 9,
    defense: 3,
    text: "Last Words: Add a Last Word Token to your hand."
  });
  const attacker = boardFollower(game, attackerCard, 0, "attacker", { playedTurn: game.turn });
  const target = boardFollower(game, targetCard, 1, "target");
  game.registerCardDefinitions([attackerCard, targetCard, token]);
  game.players[0].board.push(attacker);
  game.players[1].board.push(target);
  const shadowsBefore = game.players[1].resources.shadows;

  attackFollower(game, attacker, target);

  assert.equal(game.findBoardCard(1, target.instanceId), null);
  assert.equal(attacker.defense, 5, "destroyed defender never deals normal counter damage");
  assert.equal(game.players[1].resources.shadows, shadowsBefore + 1);
  assert.equal(game.players[1].hand.some(item => item.card?.name === "Last Word Token"), true);
});

test("Medusa-style Follower Strike destroys the opposing follower before combat", () => {
  const game = readyGame("medusa-destroy");
  const medusaCard = definition("medusa-style", {
    attack: 1,
    defense: 4,
    keywords: ["Rush", "Strike"],
    text: "Rush\nCan attack 3 times per turn.\nFollower Strike: Destroy the opposing follower."
  });
  const targetCard = definition("medusa-target", { attack: 8, defense: 8 });
  const medusa = boardFollower(game, medusaCard, 0, "medusa", { playedTurn: game.turn });
  medusa.attackLimit = 3;
  medusa.attacksRemaining = 3;
  const target = boardFollower(game, targetCard, 1, "target");
  game.registerCardDefinitions([medusaCard, targetCard]);
  game.players[0].board.push(medusa);
  game.players[1].board.push(target);
  const support = getWorldsBeyondTriggerSupport(medusa, "strike", null, game.players[0]);

  attackFollower(game, medusa, target);

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(game.findBoardCard(1, target.instanceId), null);
  assert.equal(medusa.defense, 4);
  assert.equal(medusa.attacksRemaining, 2);
});

test("opposing-follower direct destruction respects ability-destruction immunity and combat then continues", () => {
  const game = readyGame("medusa-immunity");
  const medusaCard = definition("medusa-immune-test", {
    attack: 2,
    defense: 5,
    keywords: ["Rush", "Strike"],
    text: "Rush\nFollower Strike: Destroy the opposing follower."
  });
  const immuneCard = definition("immune-defender", {
    attack: 1,
    defense: 5,
    text: "Can't be destroyed by abilities."
  });
  const medusa = boardFollower(game, medusaCard, 0, "medusa", { playedTurn: game.turn });
  const immune = boardFollower(game, immuneCard, 1, "immune");
  game.registerCardDefinitions([medusaCard, immuneCard]);
  game.players[0].board.push(medusa);
  game.players[1].board.push(immune);

  attackFollower(game, medusa, immune);

  assert.ok(game.findBoardCard(1, immune.instanceId));
  assert.equal(immune.defense, 3, "normal combat damage still resolves after the failed ability destroy");
  assert.equal(medusa.defense, 4);
});

test("Follower Strike does not activate on a leader attack", () => {
  const game = readyGame("follower-strike-leader");
  const card = definition("follower-strike-only", {
    attack: 2,
    defense: 3,
    keywords: ["Strike"],
    text: "Follower Strike: Deal 9 damage to the opposing follower."
  });
  const attacker = boardFollower(game, card, 0, "leader-attacker", { playedTurn: game.turn - 1 });
  game.registerCardDefinitions([card]);
  game.players[0].board.push(attacker);
  const before = game.events.length;

  applyWorldsBeyondCombatAction(game, {
    type: "attack",
    player: 0,
    attackerInstanceId: attacker.instanceId,
    target: "leader"
  });

  assert.equal(game.players[1].hp, 18);
  const strikeTriggers = game.events.slice(before).filter(event =>
    event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.trigger === "strike"
  );
  assert.equal(strikeTriggers.length, 0);
});
