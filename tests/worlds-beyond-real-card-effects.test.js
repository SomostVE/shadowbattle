import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function card(id, extra = {}) {
  return { id, name: id, type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], traits: [], ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function startedGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "real-card-effects-test",
    firstPlayer: 0,
    players: [
      { name: "Human", deck: deck("A") },
      { name: "CPU", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function boardFollower(owner, id, defense = 1) {
  const source = card(id, { attack: 1, defense });
  return {
    instanceId: `${owner}:manual:${id}`,
    owner,
    cardId: source.id,
    card: source,
    attack: 1,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
}

test("Codex: Fangs of Ardent Destruction damages followers on both sides", () => {
  const game = startedGame();
  const spell = {
    id: 90044320,
    name: "Fangs of Ardent Destruction",
    class: "Dragoncraft",
    type: "Spell",
    rarity: "Legendary",
    cost: 0,
    attack: 0,
    defense: 0,
    traits: [],
    keywords: [],
    text: "Deal 1 damage to all followers."
  };
  const spellInstance = game.players[0].hand[0];
  spellInstance.card = spell;
  spellInstance.cardId = spell.id;

  const allied = boardFollower(0, "allied-1-defense", 1);
  const enemy = boardFollower(1, "enemy-1-defense", 1);
  game.players[0].board.push(allied);
  game.players[1].board.push(enemy);

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spellInstance.instanceId);
  assert.ok(action, "Fangs of Ardent Destruction should be playable");
  game.dispatch(action);

  assert.equal(game.findBoardCard(0, allied.instanceId), null);
  assert.equal(game.findBoardCard(1, enemy.instanceId), null);
  assert.ok(game.players[0].cemetery.some(item => item.instanceId === allied.instanceId));
  assert.ok(game.players[1].cemetery.some(item => item.instanceId === enemy.instanceId));
  assert.ok(game.players[0].cemetery.some(item => item.instanceId === spellInstance.instanceId));
  assert.equal(game.players[0].resources.shadows, 2, "caster gets one Shadow for its destroyed follower and one for the spell");
  assert.equal(game.players[1].resources.shadows, 1, "opponent gets one Shadow for its destroyed follower");

  const damageEvents = game.getEvents({ viewer: 0 }).filter(event => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE && event.payload.reason === "ability");
  assert.equal(damageEvents.length, 2);
  assert.deepEqual(new Set(damageEvents.map(event => event.payload.targetPlayer)), new Set([0, 1]));
});

test("enemy-wide follower damage still resolves after the area-damage refactor", () => {
  const game = startedGame();
  const spell = card("enemy-aoe-spell", {
    type: "Spell",
    cost: 0,
    attack: 0,
    defense: 0,
    text: "Deal 1 damage to all enemy followers."
  });
  const spellInstance = game.players[0].hand[0];
  spellInstance.card = spell;
  spellInstance.cardId = spell.id;

  const allied = boardFollower(0, "allied-survivor", 1);
  const enemy = boardFollower(1, "enemy-dies", 1);
  game.players[0].board.push(allied);
  game.players[1].board.push(enemy);

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spellInstance.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.ok(game.findBoardCard(0, allied.instanceId));
  assert.equal(game.findBoardCard(1, enemy.instanceId), null);
  assert.equal(game.players[0].resources.shadows, 1, "only the spell enters the caster's cemetery");
  assert.equal(game.players[1].resources.shadows, 1);
});
