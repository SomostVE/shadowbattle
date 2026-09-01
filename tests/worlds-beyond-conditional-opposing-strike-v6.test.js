import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { applyWorldsBeyondCombatAction } from "../src/core/rulesets/svwb/combat-actions.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

const OKITA_STRIKE = 'Do this 1 time: "Deal 3 damage to the opposing follower." If this follower is evolved, do it 3 times instead.';

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

function readyGame(seed = "conditional-opposing-strike-v6") {
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

function boardFollower(card, owner, suffix, { playedTurn = 0, evolved = false } = {}) {
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
    evolved,
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

test("Okita-style repeated Strike expands once while the source is unevolved", () => {
  const result = evaluateWorldsBeyondClassCondition(
    OKITA_STRIKE,
    { resources: { maxPp: 10 }, cardsPlayedThisTurn: 0 },
    definition("okita-condition"),
    { source: { evolved: false } }
  );

  assert.equal(result.text, "Deal 3 damage to the opposing follower.");
});

test("Okita-style repeated Strike expands three times while the source is evolved", () => {
  const result = evaluateWorldsBeyondClassCondition(
    OKITA_STRIKE,
    { resources: { maxPp: 10 }, cardsPlayedThisTurn: 0 },
    definition("okita-condition"),
    { source: { evolved: true } }
  );

  assert.equal(
    result.text,
    "Deal 3 damage to the opposing follower. Deal 3 damage to the opposing follower. Deal 3 damage to the opposing follower."
  );
});

test("Rosé-style Follower Strike destroys an already damaged opposing follower before combat", () => {
  const game = readyGame("rose-damaged");
  const roseCard = definition("rose-style", {
    attack: 2,
    defense: 5,
    keywords: ["Rush", "Strike"],
    text: "Rush\nFollower Strike: If the opposing follower is damaged, destroy it."
  });
  const targetCard = definition("rose-damaged-target", { attack: 8, defense: 6 });
  const rose = boardFollower(roseCard, 0, "rose", { playedTurn: game.turn });
  const target = boardFollower(targetCard, 1, "target");
  target.defense = 5;
  game.registerCardDefinitions([roseCard, targetCard]);
  game.players[0].board.push(rose);
  game.players[1].board.push(target);

  const support = getWorldsBeyondTriggerSupport(rose, "strike", null, game.players[0]);
  attackFollower(game, rose, target);

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(game.findBoardCard(1, target.instanceId), null);
  assert.equal(rose.defense, 5, "destroyed defender never reaches normal combat damage");
});

test("Rosé-style Follower Strike leaves an undamaged opposing follower alone and combat continues", () => {
  const game = readyGame("rose-undamaged");
  const roseCard = definition("rose-style-undamaged", {
    attack: 2,
    defense: 5,
    keywords: ["Rush", "Strike"],
    text: "Rush\nFollower Strike: If the opposing follower is damaged, destroy it."
  });
  const targetCard = definition("rose-undamaged-target", { attack: 1, defense: 6 });
  const rose = boardFollower(roseCard, 0, "rose", { playedTurn: game.turn });
  const target = boardFollower(targetCard, 1, "target");
  game.registerCardDefinitions([roseCard, targetCard]);
  game.players[0].board.push(rose);
  game.players[1].board.push(target);

  attackFollower(game, rose, target);

  assert.ok(game.findBoardCard(1, target.instanceId));
  assert.equal(target.defense, 4, "only normal combat damage is applied");
  assert.equal(rose.defense, 4);
});

test("evolved Okita-style Follower Strike repeats opposing-follower damage three times before combat", () => {
  const game = readyGame("okita-evolved");
  const okitaCard = definition("okita-style", {
    attack: 2,
    defense: 5,
    keywords: ["Rush", "Strike"],
    text: `Rush\nFollower Strike: ${OKITA_STRIKE}`
  });
  const targetCard = definition("okita-target", { attack: 9, defense: 8 });
  const okita = boardFollower(okitaCard, 0, "okita", { playedTurn: game.turn, evolved: true });
  const target = boardFollower(targetCard, 1, "target");
  game.registerCardDefinitions([okitaCard, targetCard]);
  game.players[0].board.push(okita);
  game.players[1].board.push(target);

  const support = getWorldsBeyondTriggerSupport(okita, "strike", null, game.players[0]);
  attackFollower(game, okita, target);

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(game.findBoardCard(1, target.instanceId), null);
  assert.equal(okita.defense, 5, "the defender dies to repeated Strike damage before normal combat");
});
