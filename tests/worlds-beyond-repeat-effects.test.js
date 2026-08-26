import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";

const REPEAT_TEXT = 'Do this 1 time: "Deal 2 damage to a random enemy follower." Combo (3) - Do it 2 times instead.';

function forestCard(id, extra = {}) {
  return {
    id,
    name: id,
    class: "Forestcraft",
    type: "Spell",
    cost: 1,
    attack: 0,
    defense: 0,
    text: "",
    keywords: [],
    ...extra
  };
}

function follower(id, defense = 5) {
  return {
    id,
    name: id,
    class: "Forestcraft",
    type: "Follower",
    cost: 1,
    attack: 1,
    defense,
    text: "",
    keywords: []
  };
}

function deck(prefix, special) {
  return [special, ...Array.from({ length: 39 }, (_, index) => follower(`${prefix}-${index}`))];
}

function begin(special, cardsPlayedThisTurn) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "repeat-effects",
    firstPlayer: 0,
    players: [
      { name: "Human", className: "Forestcraft", deck: deck("A", special) },
      { name: "CPU", className: "Forestcraft", deck: deck("B", follower("enemy-seed")) }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  game.players[0].cardsPlayedThisTurn = cardsPlayedThisTurn;
  game.players[0].resources.combo = cardsPlayedThisTurn;

  const spell = game.players[0].hand.find(item => item.cardId === special.id)
    ?? game.players[0].deck.find(item => item.cardId === special.id);
  assert.ok(spell);
  game.players[0].hand = game.players[0].hand.filter(item => item !== spell);
  game.players[0].deck = game.players[0].deck.filter(item => item !== spell);
  game.players[0].hand.push(spell);

  const enemy = game.players[1].hand.shift();
  enemy.card = follower("repeat-target", 5);
  enemy.cardId = enemy.card.id;
  enemy.attack = 1;
  enemy.defense = 5;
  enemy.maxDefense = 5;
  enemy.attacksRemaining = 0;
  enemy.canAttackFollowers = false;
  enemy.canAttackLeader = false;
  game.players[1].board.push(enemy);
  return { game, spell, enemy };
}

test("inactive Combo unwraps the default repeated action exactly once", () => {
  const result = evaluateWorldsBeyondClassCondition(
    REPEAT_TEXT,
    { className: "Forestcraft", cardsPlayedThisTurn: 1, resources: { maxPp: 4 } },
    { class: "Forestcraft" }
  );
  assert.equal(result.text, "Deal 2 damage to a random enemy follower.");
});

test("active Combo expands Do it 2 times instead into two executable effects", () => {
  const result = evaluateWorldsBeyondClassCondition(
    REPEAT_TEXT,
    { className: "Forestcraft", cardsPlayedThisTurn: 3, resources: { maxPp: 4 } },
    { class: "Forestcraft" }
  );
  assert.equal(result.text, "Deal 2 damage to a random enemy follower. Deal 2 damage to a random enemy follower.");
});

test("real Codex-style repeat spell deals 2 below Combo and 4 when the played card reaches Combo 3", () => {
  const special = forestCard("repeat-combo-spell", { keywords: ["Combo"], text: REPEAT_TEXT });

  const below = begin(special, 0);
  const belowAction = below.game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === below.spell.instanceId);
  assert.ok(belowAction);
  below.game.dispatch(belowAction);
  assert.equal(below.enemy.defense, 3);

  const active = begin(special, 2);
  const activeAction = active.game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === active.spell.instanceId);
  assert.ok(activeAction);
  active.game.dispatch(activeAction);
  assert.equal(active.enemy.defense, 1);
});
