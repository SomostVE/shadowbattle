import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { returnBoardCardToHand } from "../src/core/zone-actions.js";
import {
  getWorldsBeyondTriggerSupport,
  resolveWorldsBeyondTrigger
} from "../src/core/rulesets/svwb/effect-resolver.js";
import {
  normalizeWorldsBeyondTurnCombatReadiness
} from "../src/core/rulesets/svwb/combat-readiness.js";
import { createWorldsBeyondExactCopyInstance } from "../src/core/rulesets/svwb/generated-cards.js";

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

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "dynamic-attack-limits-v6",
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

function boardFollower(card, owner = 0, suffix = "board") {
  return {
    instanceId: `${card.id}-${suffix}`,
    owner,
    cardId: card.id,
    card,
    attack: card.attack ?? 1,
    defense: card.defense ?? 1,
    maxDefense: card.defense ?? 1,
    attackLimit: 1,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true,
    playedTurn: 0,
    evolved: false,
    superEvolved: false
  };
}

test("Armes-style multiattack grant preserves attacks already spent and allows only the new total", () => {
  const game = readyGame();
  const definition = {
    id: "armes-style",
    name: "Armes Style",
    class: "Abysscraft",
    type: "Follower",
    cost: 3,
    attack: 1,
    defense: 5,
    keywords: ["Super-Evolve"],
    text: 'Super-Evolve: Give this follower "Can attack 3 times per turn."'
  };
  game.registerCardDefinitions([definition]);
  const source = boardFollower(definition);
  source.playedTurn = game.turn - 1;
  game.players[0].board.push(source);

  game.dispatch({ type: "attack", player: 0, attackerInstanceId: source.instanceId, target: "leader" });
  assert.equal(source.attacksRemaining, 0);

  const support = getWorldsBeyondTriggerSupport(source, "super-evolve");
  assert.equal(support.supported, true);
  const result = resolveWorldsBeyondTrigger(game, { trigger: "super-evolve", playerIndex: 0, source });

  assert.equal(result.unresolved, false);
  assert.equal(source.attackLimitOverride, 3);
  assert.equal(source.attackLimit, 3);
  assert.equal(source.attacksRemaining, 2, "one attack was already spent before the grant");

  game.dispatch({ type: "attack", player: 0, attackerInstanceId: source.instanceId, target: "leader" });
  game.dispatch({ type: "attack", player: 0, attackerInstanceId: source.instanceId, target: "leader" });
  assert.equal(source.attacksRemaining, 0);
  assert.throws(
    () => game.dispatch({ type: "attack", player: 0, attackerInstanceId: source.instanceId, target: "leader" }),
    /cannot attack/i
  );

  normalizeWorldsBeyondTurnCombatReadiness(game.players[0]);
  assert.equal(source.attackLimit, 3);
  assert.equal(source.attacksRemaining, 3, "the granted limit persists while the follower stays on the field");
});

test("Reno-style self grant supports a two-attack limit", () => {
  const game = readyGame();
  const definition = {
    id: "reno-style",
    name: "Reno Style",
    class: "Havencraft",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 2,
    keywords: ["Super-Evolve"],
    text: 'Super-Evolve: Give this follower "Can attack 2 times per turn."'
  };
  game.registerCardDefinitions([definition]);
  const source = boardFollower(definition);
  source.playedTurn = game.turn - 1;
  game.players[0].board.push(source);

  const result = resolveWorldsBeyondTrigger(game, { trigger: "super-evolve", playerIndex: 0, source });

  assert.equal(result.unresolved, false);
  assert.equal(source.attackLimitOverride, 2);
  assert.equal(source.attacksRemaining, 2);
});

test("Knightly Ardor-style mode grants multiattack to the leftmost matching class follower", () => {
  const game = readyGame();
  const neutral = boardFollower({
    id: "neutral-left",
    name: "Neutral Left",
    class: "Neutral",
    type: "Follower",
    attack: 1,
    defense: 1,
    keywords: []
  }, 0, "neutral");
  const firstSword = boardFollower({
    id: "first-sword",
    name: "First Sword",
    class: "Swordcraft",
    type: "Follower",
    attack: 1,
    defense: 1,
    keywords: []
  }, 0, "first");
  const secondSword = boardFollower({
    id: "second-sword",
    name: "Second Sword",
    class: "Swordcraft",
    type: "Follower",
    attack: 1,
    defense: 1,
    keywords: []
  }, 0, "second");
  game.players[0].board.push(neutral, firstSword, secondSword);

  const source = {
    instanceId: "knightly-ardor-style",
    owner: 0,
    cardId: "knightly-ardor-style",
    card: {
      id: "knightly-ardor-style",
      name: "Knightly Ardor Style",
      class: "Swordcraft",
      type: "Spell",
      cost: 1,
      keywords: [],
      text: 'Give the leftmost allied Swordcraft follower on the field "Can attack 2 times per turn."'
    }
  };

  const support = getWorldsBeyondTriggerSupport(source, "play");
  assert.equal(support.supported, true);
  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source });

  assert.equal(result.unresolved, false);
  assert.equal(neutral.attackLimitOverride, undefined);
  assert.equal(firstSword.attackLimitOverride, 2);
  assert.equal(firstSword.attacksRemaining, 2);
  assert.equal(secondSword.attackLimitOverride, undefined);
});

test("dynamic attack-limit grants are cleared when the follower returns to hand", () => {
  const game = readyGame();
  const definition = {
    id: "bounce-limit",
    name: "Bounce Limit",
    class: "Abysscraft",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 2,
    keywords: [],
    text: 'Super-Evolve: Give this follower "Can attack 3 times per turn."'
  };
  game.registerCardDefinitions([definition]);
  const source = boardFollower(definition);
  game.players[0].board.push(source);
  resolveWorldsBeyondTrigger(game, { trigger: "super-evolve", playerIndex: 0, source });
  assert.equal(source.attackLimitOverride, 3);

  const returned = returnBoardCardToHand(game, 0, source.instanceId, { actor: 0, reason: "test" });

  assert.ok(returned);
  assert.equal(returned.attackLimitOverride, undefined);
  assert.equal(returned.attackLimit, undefined);
});

test("exact board copies preserve a dynamic attack-limit grant", () => {
  const game = readyGame();
  const definition = {
    id: "copy-limit",
    name: "Copy Limit",
    class: "Abysscraft",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 2,
    keywords: []
  };
  game.registerCardDefinitions([definition]);
  const source = boardFollower(definition);
  source.attackLimitOverride = 3;
  source.attackLimit = 3;
  source.attacksRemaining = 2;

  const copy = createWorldsBeyondExactCopyInstance(game, 0, source, { preserveBoardState: true });

  assert.equal(copy.attackLimitOverride, 3);
  assert.equal(copy.attackLimit, 3);
});
