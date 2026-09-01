import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
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

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "full-defense-restore-v6",
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

test("Azurifrit-style Super-Evolve restores first and repeated area damage respects Super-Evo protection", () => {
  const game = readyGame();
  const definition = {
    id: "azurifrit-style",
    name: "Azurifrit Style",
    class: "Dragoncraft",
    type: "Follower",
    cost: 7,
    attack: 7,
    defense: 10,
    keywords: ["Ward", "Super-Evolve"],
    text: 'Super-Evolve: Fully restore the defense of this follower. Do this 3 times: "Deal 2 damage to all followers."'
  };
  const enemyDefinition = {
    id: "area-target",
    name: "Area Target",
    class: "Neutral",
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 10,
    keywords: []
  };
  game.registerCardDefinitions([definition, enemyDefinition]);
  const source = boardFollower(definition);
  source.defense = 3;
  source.maxDefense = 10;
  source.superEvolved = true;
  const enemy = boardFollower(enemyDefinition, 1, "enemy");
  game.players[0].board.push(source);
  game.players[1].board.push(enemy);

  const support = getWorldsBeyondTriggerSupport(source, "super-evolve", null, game.players[0]);
  const result = resolveWorldsBeyondTrigger(game, { trigger: "super-evolve", playerIndex: 0, source });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(result.unresolved, false);
  assert.equal(source.defense, 10, "Super-Evo protection prevents its own three area-damage waves after the restore");
  assert.equal(enemy.defense, 4, "the repeated area damage still resolves three times against other followers");
});

test("leading full restore resolves before a following area-damage clause", () => {
  const game = readyGame();
  const definition = {
    id: "restore-order-style",
    name: "Restore Order Style",
    class: "Dragoncraft",
    type: "Follower",
    cost: 3,
    attack: 3,
    defense: 10,
    keywords: [],
    text: "At the end of your turn, fully restore the defense of this follower. Deal 2 damage to all followers."
  };
  game.registerCardDefinitions([definition]);
  const source = boardFollower(definition);
  source.defense = 3;
  source.maxDefense = 10;
  game.players[0].board.push(source);

  const support = getWorldsBeyondTriggerSupport(source, "turn-end");
  const result = resolveWorldsBeyondTrigger(game, { trigger: "turn-end", playerIndex: 0, source });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(result.unresolved, false);
  assert.equal(source.defense, 8, "restore to 10 must occur before the later 2-damage effect");
});

test("Supplicant-style turn-end restores the leader by the follower's actual restored amount", () => {
  const game = readyGame();
  const definition = {
    id: "supplicant-style",
    name: "Supplicant Style",
    class: "Dragoncraft",
    type: "Follower",
    cost: 3,
    attack: 2,
    defense: 5,
    keywords: ["Rush", "Ward"],
    text: "Rush\nWard\nAt the end of your turn, fully restore the defense of this follower and restore the same amount to your leader."
  };
  game.registerCardDefinitions([definition]);
  const source = boardFollower(definition);
  source.defense = 2;
  source.maxDefense = 5;
  game.players[0].board.push(source);
  game.players[0].hp = 14;
  game.players[0].maxHp = 20;
  const beforeEvents = game.events.length;

  const support = getWorldsBeyondTriggerSupport(source, "turn-end");
  const result = resolveWorldsBeyondTrigger(game, { trigger: "turn-end", playerIndex: 0, source });

  assert.equal(support.supported, true);
  assert.equal(result.unresolved, false);
  assert.equal(source.defense, 5);
  assert.equal(game.players[0].hp, 17, "leader restores the same 3 defense actually restored to the follower");
  const heals = game.events.slice(beforeEvents).filter(event => event.type === BATTLE_EVENT.HEAL);
  assert.equal(heals.length, 1);
  assert.equal(heals[0].payload.requestedAmount, 3);
  assert.equal(heals[0].payload.amount, 3);
});

test("same-amount leader restoration uses the actual follower restore and respects leader cap", () => {
  const game = readyGame();
  const definition = {
    id: "supplicant-cap-style",
    name: "Supplicant Cap Style",
    class: "Dragoncraft",
    type: "Follower",
    cost: 3,
    attack: 2,
    defense: 6,
    keywords: [],
    text: "At the end of your turn, fully restore the defense of this follower and restore the same amount to your leader."
  };
  game.registerCardDefinitions([definition]);
  const source = boardFollower(definition);
  source.defense = 1;
  source.maxDefense = 6;
  game.players[0].board.push(source);
  game.players[0].hp = 19;
  game.players[0].maxHp = 20;

  const result = resolveWorldsBeyondTrigger(game, { trigger: "turn-end", playerIndex: 0, source });

  assert.equal(result.unresolved, false);
  assert.equal(source.defense, 6);
  assert.equal(game.players[0].hp, 20);
  const heal = [...game.events].reverse().find(event => event.type === BATTLE_EVENT.HEAL);
  assert.equal(heal.payload.requestedAmount, 5);
  assert.equal(heal.payload.amount, 1, "leader cap changes healed amount, not the copied restore request");
});
