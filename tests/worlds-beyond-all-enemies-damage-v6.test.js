import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport, resolveWorldsBeyondTrigger } from "../src/core/rulesets/svwb/effect-resolver.js";

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

function readyGame(seed = "all-enemies-damage-v6") {
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

function boardFollower(card, owner = 0, suffix = "board") {
  return {
    instanceId: `${card.id}-${suffix}`,
    owner,
    cardId: card.id,
    card,
    attack: card.attack ?? 1,
    defense: card.defense ?? 1,
    maxDefense: card.defense ?? 1,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true,
    playedTurn: 0,
    evolved: false,
    superEvolved: false
  };
}

test("Spiked Dragon-style evolve damages the enemy leader and every enemy follower", () => {
  const game = readyGame("spiked-dragon-style");
  const sourceCard = {
    id: "spiked-style",
    name: "Spiked Style",
    class: "Dragoncraft",
    type: "Follower",
    cost: 6,
    attack: 5,
    defense: 6,
    keywords: [],
    text: "When this follower evolves, deal 3 damage to all enemies."
  };
  const allyCard = { id: "ally", name: "Ally", class: "Neutral", type: "Follower", cost: 1, attack: 1, defense: 5, keywords: [] };
  const enemyCard = { id: "enemy", name: "Enemy", class: "Neutral", type: "Follower", cost: 1, attack: 1, defense: 5, keywords: [] };
  game.registerCardDefinitions([sourceCard, allyCard, enemyCard]);
  const source = boardFollower(sourceCard);
  source.evolved = true;
  const ally = boardFollower(allyCard, 0, "ally");
  const enemyA = boardFollower(enemyCard, 1, "a");
  const enemyB = boardFollower(enemyCard, 1, "b");
  game.players[0].board.push(source, ally);
  game.players[1].board.push(enemyA, enemyB);
  const enemyHp = game.players[1].hp;

  const support = getWorldsBeyondTriggerSupport(source, "evolve", null, game.players[0]);
  const result = resolveWorldsBeyondTrigger(game, { trigger: "evolve", playerIndex: 0, source });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(result.unresolved, false);
  assert.equal(game.players[1].hp, enemyHp - 3);
  assert.equal(enemyA.defense, 2);
  assert.equal(enemyB.defense, 2);
  assert.equal(ally.defense, 5, "all enemies must not touch allied followers");
  assert.equal(source.defense, 6);
});

test("all-enemies damage resolves leader damage before lethal follower destruction", () => {
  const game = readyGame("all-enemies-order");
  const sourceCard = {
    id: "all-enemies-order-source",
    name: "All Enemies Order Source",
    class: "Dragoncraft",
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 1,
    keywords: [],
    text: "Evolve: Deal 3 damage to all enemies."
  };
  const enemyCard = { id: "fragile-enemy", name: "Fragile Enemy", class: "Neutral", type: "Follower", cost: 1, attack: 1, defense: 2, keywords: [] };
  game.registerCardDefinitions([sourceCard, enemyCard]);
  const source = boardFollower(sourceCard);
  source.evolved = true;
  const enemy = boardFollower(enemyCard, 1, "fragile");
  game.players[0].board.push(source);
  game.players[1].board.push(enemy);
  const before = game.events.length;

  resolveWorldsBeyondTrigger(game, { trigger: "evolve", playerIndex: 0, source });

  assert.equal(game.players[1].board.some(unit => unit.instanceId === enemy.instanceId), false);
  assert.equal(game.players[1].cemetery.some(unit => unit.instanceId === enemy.instanceId), true);
  const events = game.events.slice(before);
  const leaderDamage = events.findIndex(event => event.type === BATTLE_EVENT.LEADER_DAMAGE);
  const destroyed = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_DESTROYED);
  assert.ok(leaderDamage >= 0);
  assert.ok(destroyed > leaderDamage, "all damage is applied before follower death processing");
});

test("Quiet Encouragement-style Combo replacement keeps base all-enemies damage below Combo 3", () => {
  const game = readyGame("quiet-base");
  const card = {
    id: "quiet-style-base",
    name: "Quiet Style Base",
    class: "Forestcraft",
    type: "Spell",
    cost: 3,
    keywords: [],
    text: "Deal 1 damage to all enemies. Combo (3) - Deal 2 damage instead."
  };
  const enemyCard = { id: "quiet-enemy", name: "Quiet Enemy", class: "Neutral", type: "Follower", cost: 1, attack: 1, defense: 4, keywords: [] };
  game.registerCardDefinitions([card, enemyCard]);
  const source = { instanceId: "quiet-style-base-instance", owner: 0, cardId: card.id, card };
  const enemy = boardFollower(enemyCard, 1, "base");
  game.players[1].board.push(enemy);
  game.players[0].cardsPlayedThisTurn = 2;
  game.players[0].resources.combo = 2;
  const hp = game.players[1].hp;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(game.players[1].hp, hp - 1);
  assert.equal(enemy.defense, 3);
});

test("Quiet Encouragement-style Combo replacement upgrades the same all-enemies effect", () => {
  const game = readyGame("quiet-combo");
  const card = {
    id: "quiet-style-combo",
    name: "Quiet Style Combo",
    class: "Forestcraft",
    type: "Spell",
    cost: 3,
    keywords: [],
    text: "Deal 1 damage to all enemies. Combo (3) - Deal 2 damage instead."
  };
  const enemyCard = { id: "quiet-combo-enemy", name: "Quiet Combo Enemy", class: "Neutral", type: "Follower", cost: 1, attack: 1, defense: 4, keywords: [] };
  game.registerCardDefinitions([card, enemyCard]);
  const source = { instanceId: "quiet-style-combo-instance", owner: 0, cardId: card.id, card };
  const enemy = boardFollower(enemyCard, 1, "combo");
  game.players[1].board.push(enemy);
  game.players[0].cardsPlayedThisTurn = 3;
  game.players[0].resources.combo = 3;
  const hp = game.players[1].hp;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(result.unresolved, false);
  assert.equal(game.players[1].hp, hp - 2);
  assert.equal(enemy.defense, 2);
});
