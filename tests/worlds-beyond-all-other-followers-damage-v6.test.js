import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  destroyWorldsBeyondFollower,
  getWorldsBeyondTriggerSupport,
  resolveWorldsBeyondTrigger
} from "../src/core/rulesets/svwb/effect-resolver.js";

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

function readyGame(seed = "all-other-followers-damage-v6") {
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

function definition(id, { cost = 1, attack = 1, defense = 1, text = "", keywords = [] } = {}) {
  return { id, name: id, class: "Neutral", type: "Follower", cost, attack, defense, text, keywords, traits: [] };
}

function boardFollower(card, owner, suffix) {
  return {
    instanceId: `${card.id}-${owner}-${suffix}`,
    owner,
    cardId: card.id,
    card,
    attack: card.attack,
    defense: card.defense,
    maxDefense: card.defense,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true,
    evolved: false,
    superEvolved: false
  };
}

test("Lifestealer-style Evolve damages every other follower but never the source", () => {
  const game = readyGame("lifestealer-area");
  const sourceCard = definition("lifestealer-style", { attack: 3, defense: 5, text: "Evolve: Deal 1 damage to all other followers." });
  const alliedCard = definition("allied", { defense: 3 });
  const enemyCard = definition("enemy", { defense: 2 });
  const source = boardFollower(sourceCard, 0, "source");
  const allied = boardFollower(alliedCard, 0, "ally");
  const enemy = boardFollower(enemyCard, 1, "enemy");
  game.registerCardDefinitions([sourceCard, alliedCard, enemyCard]);
  game.players[0].board.push(source, allied);
  game.players[1].board.push(enemy);

  const support = getWorldsBeyondTriggerSupport(source, "evolve", null, game.players[0]);
  const result = resolveWorldsBeyondTrigger(game, { trigger: "evolve", playerIndex: 0, source });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(result.unresolved, false);
  assert.equal(source.defense, 5);
  assert.equal(allied.defense, 2);
  assert.equal(enemy.defense, 1);
});

test("all-other follower damage applies every hit before resolving lethal destruction", () => {
  const game = readyGame("all-other-atomic");
  const sourceCard = definition("area-source", { text: "Evolve: Deal 2 damage to all other followers." });
  const firstCard = definition("first", { defense: 1 });
  const secondCard = definition("second", { defense: 1 });
  const source = boardFollower(sourceCard, 0, "source");
  const first = boardFollower(firstCard, 0, "first");
  const second = boardFollower(secondCard, 1, "second");
  game.registerCardDefinitions([sourceCard, firstCard, secondCard]);
  game.players[0].board.push(source, first);
  game.players[1].board.push(second);
  const before = game.events.length;

  resolveWorldsBeyondTrigger(game, { trigger: "evolve", playerIndex: 0, source });

  const events = game.events.slice(before);
  const damageIndices = events.map((event, index) => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE ? index : -1).filter(index => index >= 0);
  const destroyIndices = events.map((event, index) => event.type === BATTLE_EVENT.FOLLOWER_DESTROYED ? index : -1).filter(index => index >= 0);
  assert.equal(damageIndices.length, 2);
  assert.equal(destroyIndices.length, 2);
  assert.ok(Math.max(...damageIndices) < Math.min(...destroyIndices), "all area hits must land before the first lethal destruction");
  assert.equal(game.players[0].cemetery.some(item => item.instanceId === first.instanceId), true);
  assert.equal(game.players[1].cemetery.some(item => item.instanceId === second.instanceId), true);
});

test("Supplicant-style current-cost condition omits Draw at printed cost 5", () => {
  const game = readyGame("supplicant-base-cost");
  const card = definition("supplicant-style", {
    cost: 5,
    defense: 2,
    text: "Fanfare: Deal 3 damage to all other followers. If this card's cost isn't 5, draw 2 cards."
  });
  const source = boardFollower(card, 0, "source");
  game.registerCardDefinitions([card]);
  game.players[0].board.push(source);
  const handBefore = game.players[0].hand.length;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(result.unresolved, false);
  assert.equal(game.players[0].hand.length, handBefore);
});

test("Supplicant-style current-cost condition draws when the live cost differs from 5", () => {
  const game = readyGame("supplicant-reduced-cost");
  const card = definition("supplicant-reduced", {
    cost: 5,
    defense: 2,
    text: "Fanfare: Deal 3 damage to all other followers. If this card's cost isn't 5, draw 2 cards."
  });
  const source = boardFollower(card, 0, "source");
  source.costDelta = -1;
  const enemyCard = definition("enemy-target", { defense: 5 });
  const enemy = boardFollower(enemyCard, 1, "enemy");
  game.registerCardDefinitions([card, enemyCard]);
  game.players[0].board.push(source);
  game.players[1].board.push(enemy);
  const handBefore = game.players[0].hand.length;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(result.unresolved, false);
  assert.equal(enemy.defense, 2);
  assert.equal(game.players[0].hand.length, handBefore + 2);
});
