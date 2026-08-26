import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";

function card(id, extra = {}) {
  return { id, name: id, type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], traits: [], ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function startedGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "repeated-effects-test",
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

function boardFollower(owner, id, defense = 7) {
  const source = card(id, { defense });
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

test("standalone Do this 3 times expands without a class-condition branch", () => {
  const result = evaluateWorldsBeyondClassCondition(
    'Do this 3 times: "Deal 2 damage to all followers."',
    { resources: { shadows: 0, maxPp: 1 }, cardsPlayedThisTurn: 0 },
    card("repeat-card", { class: "Dragoncraft" })
  );

  assert.equal(result.active, true);
  assert.equal(result.text, "Deal 2 damage to all followers. Deal 2 damage to all followers. Deal 2 damage to all followers.");
});

test("Codex-style repeated Fanfare resolves the repeated body three times", () => {
  const game = startedGame();
  const repeatedFollower = card("codex-repeat-follower", {
    class: "Dragoncraft",
    cost: 0,
    attack: 5,
    defense: 7,
    keywords: ["Fanfare"],
    text: 'Fanfare: Do this 3 times: "Deal 2 damage to all followers."'
  });
  const source = game.players[0].hand[0];
  source.card = repeatedFollower;
  source.cardId = repeatedFollower.id;

  const enemy = boardFollower(1, "repeat-enemy", 7);
  game.players[1].board.push(enemy);

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId);
  assert.ok(action);
  game.dispatch(action);

  const liveSource = game.findBoardCard(0, source.instanceId);
  const liveEnemy = game.findBoardCard(1, enemy.instanceId);
  assert.ok(liveSource);
  assert.ok(liveEnemy);
  assert.equal(liveSource.defense, 1);
  assert.equal(liveEnemy.defense, 1);
});
