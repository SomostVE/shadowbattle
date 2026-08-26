import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { hasWorldsBeyondKeyword } from "../src/core/rulesets/svwb/combat-readiness.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: [],
    text: ""
  }));
}

function readyGame({ playerClass = null, enemyClass = null } = {}) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "combat-readiness",
    firstPlayer: 0,
    players: [
      { className: playerClass, deck: fillerDeck("A") },
      { className: enemyClass, deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, card, index = 0) {
  const instance = game.players[0].hand[index];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

function attacksFor(game, instanceId) {
  return game.listLegalActions(0).filter(action => action.type === "attack" && action.attackerInstanceId === instanceId);
}

function staticStormCard(id, name = "Static Storm") {
  return { id, name, type: "Follower", cost: 0, attack: 3, defense: 5, keywords: ["Storm"], text: "Storm" };
}

test("a normal follower cannot attack on the turn it enters play", () => {
  const game = readyGame();
  const card = replaceHandCard(game, { id: 20001, name: "Normal Follower", type: "Follower", cost: 0, attack: 3, defense: 3, keywords: [], text: "" });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board[0];

  assert.equal(follower.playedTurn, game.turn);
  assert.equal(follower.canAttackFollowers, false);
  assert.equal(follower.canAttackLeader, false);
  assert.deepEqual(attacksFor(game, follower.instanceId), []);
  assert.throws(
    () => game.dispatch({ type: "attack", player: 0, attackerInstanceId: follower.instanceId, target: "leader" }),
    /cannot attack the enemy leader yet/
  );
});

test("Beyond Codex keyword indexes do not activate conditional combat abilities", () => {
  const conditional = {
    card: {
      keywords: ["Combo", "Fanfare", "Storm"],
      text: "Fanfare: Combo (3) - Give this follower Storm."
    }
  };
  assert.equal(hasWorldsBeyondKeyword(conditional, "Storm"), false);
  assert.equal(hasWorldsBeyondKeyword({ card: { keywords: ["Storm"], text: "Storm\nFanfare: Draw 1 card." } }, "Storm"), true);
  assert.equal(hasWorldsBeyondKeyword({ card: { keywords: ["Storm"], text: "" } }, "Storm"), true, "metadata remains a fallback for definitions without rules text");
});

test("conditional Storm becomes active only after its Combo requirement resolves", () => {
  const conditionalStorm = {
    id: 20002,
    name: "Codex Conditional Storm",
    class: "Forestcraft",
    type: "Follower",
    cost: 0,
    attack: 2,
    defense: 2,
    keywords: ["Combo", "Fanfare", "Storm"],
    text: "Fanfare: Combo (3) - Give this follower Storm."
  };

  const early = readyGame({ playerClass: "Forestcraft" });
  const earlyCard = replaceHandCard(early, conditionalStorm);
  early.dispatch({ type: "play-card", player: 0, cardInstanceId: earlyCard.instanceId });
  const earlyFollower = early.players[0].board[0];
  assert.deepEqual(attacksFor(early, earlyFollower.instanceId), [], "Combo 1 must not receive Storm");
  assert.equal(earlyFollower.grantedKeywords?.includes("Storm") ?? false, false);

  const active = readyGame({ playerClass: "Forestcraft" });
  const first = replaceHandCard(active, { id: 20003, name: "Setup One", class: "Forestcraft", type: "Spell", cost: 0, keywords: [], text: "" }, 0);
  const second = replaceHandCard(active, { id: 20004, name: "Setup Two", class: "Forestcraft", type: "Spell", cost: 0, keywords: [], text: "" }, 1);
  const finisher = replaceHandCard(active, conditionalStorm, 2);
  active.dispatch({ type: "play-card", player: 0, cardInstanceId: first.instanceId });
  active.dispatch({ type: "play-card", player: 0, cardInstanceId: second.instanceId });
  active.dispatch({ type: "play-card", player: 0, cardInstanceId: finisher.instanceId });
  const activeFollower = active.findBoardCard(0, finisher.instanceId);
  const actions = attacksFor(active, activeFollower.instanceId);
  assert.equal(activeFollower.grantedKeywords.includes("Storm"), true);
  assert.equal(actions.some(action => action.target === "leader"), true, "the third card itself counts toward Combo 3");
});

test("a conditional Ward mention does not block an otherwise legal leader attack", () => {
  const game = readyGame();
  const storm = replaceHandCard(game, staticStormCard(20005));
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: storm.instanceId });
  const attacker = game.findBoardCard(0, storm.instanceId);

  game.players[1].board.push({
    instanceId: "conditional-ward",
    owner: 1,
    cardId: 20006,
    card: {
      id: 20006,
      name: "Conditional Ward Index",
      type: "Follower",
      attack: 1,
      defense: 4,
      keywords: ["Fanfare", "Ward"],
      text: "Fanfare: Give another allied follower Ward."
    },
    attack: 1,
    defense: 4,
    maxDefense: 4,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  });

  assert.equal(attacksFor(game, attacker.instanceId).some(action => action.target === "leader"), true);
  assert.doesNotThrow(() => game.dispatch({ type: "attack", player: 0, attackerInstanceId: attacker.instanceId, target: "leader" }));
});

test("a conditional Bane mention does not destroy a combat attacker", () => {
  const game = readyGame();
  const storm = replaceHandCard(game, staticStormCard(20007));
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: storm.instanceId });
  const attacker = game.findBoardCard(0, storm.instanceId);

  game.players[1].board.push({
    instanceId: "conditional-bane",
    owner: 1,
    cardId: 20008,
    card: {
      id: 20008,
      name: "Conditional Bane Index",
      type: "Follower",
      attack: 1,
      defense: 5,
      keywords: ["Fanfare", "Bane"],
      text: "Fanfare: Give another allied follower Bane."
    },
    attack: 1,
    defense: 5,
    maxDefense: 5,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  });

  game.dispatch({ type: "attack", player: 0, attackerInstanceId: attacker.instanceId, targetInstanceId: "conditional-bane" });
  assert.ok(game.findBoardCard(0, attacker.instanceId), "the attacker survives because the defender did not actually have Bane");
  assert.equal(game.findBoardCard(0, attacker.instanceId).defense, 4);
});

test("mentioning combat keywords in ability prose does not grant them", () => {
  for (const keyword of ["Storm", "Rush", "Ward", "Bane", "Drain"]) {
    const unit = {
      card: {
        keywords: [keyword],
        text: `Fanfare: Give another allied follower ${keyword}.`
      }
    };
    assert.equal(hasWorldsBeyondKeyword(unit, keyword), false, `${keyword} must not be inferred from effect prose or Codex indexing`);
  }
});

test("Rush can attack followers immediately but not the enemy leader", () => {
  const game = readyGame();
  game.players[1].board.push({
    instanceId: "enemy-target",
    owner: 1,
    cardId: 20009,
    card: { id: 20009, name: "Enemy Target", type: "Follower", attack: 1, defense: 3, keywords: [], text: "" },
    attack: 1,
    defense: 3,
    maxDefense: 3,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  });
  const card = replaceHandCard(game, { id: 20010, name: "Rush Tester", type: "Follower", cost: 0, attack: 2, defense: 2, keywords: ["Rush"], text: "Rush" });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board[0];
  const attacks = attacksFor(game, follower.instanceId);

  assert.equal(attacks.some(action => action.target === "leader"), false);
  assert.equal(attacks.some(action => action.targetInstanceId === "enemy-target"), true);
});

test("a normal follower becomes attack-ready on its controller's next turn", () => {
  const game = readyGame();
  const card = replaceHandCard(game, { id: 20011, name: "Next Turn Tester", type: "Follower", cost: 0, attack: 2, defense: 2, keywords: [], text: "" });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const instanceId = game.players[0].board[0].instanceId;

  game.endTurn(0);
  game.endTurn(1);

  const follower = game.findBoardCard(0, instanceId);
  assert.equal(follower.canAttackFollowers, true);
  assert.equal(follower.canAttackLeader, true);
  assert.equal(attacksFor(game, instanceId).some(action => action.target === "leader"), true);
});

test("permanent attack locks survive the normal turn refresh", () => {
  const game = readyGame();
  const card = replaceHandCard(game, { id: 20012, name: "Locked Tester", type: "Follower", cost: 0, attack: 4, defense: 4, keywords: [], text: "" });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });
  const follower = game.players[0].board[0];
  follower.permanentAttackLock = true;
  follower.canAttackFollowers = false;
  follower.canAttackLeader = false;

  game.endTurn(0);
  game.endTurn(1);

  assert.equal(follower.attacksRemaining, 0);
  assert.equal(follower.canAttackFollowers, false);
  assert.equal(follower.canAttackLeader, false);
  assert.deepEqual(attacksFor(game, follower.instanceId), []);
});
