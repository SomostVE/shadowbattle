import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { hasWorldsBeyondKeyword } from "../src/core/rulesets/svwb/combat-readiness.js";

function card(id, extra = {}) {
  return {
    id,
    name: id,
    class: "Portalcraft",
    type: "Follower",
    cost: 1,
    attack: 2,
    defense: 2,
    text: "",
    keywords: [],
    traits: [],
    ...extra
  };
}

function deck(prefix, special = null) {
  const rows = Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
  if (special) rows[0] = special;
  return rows;
}

function begin(achimCard) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "enemy-exact-copy-v6",
    firstPlayer: 0,
    players: [
      { name: "Human", className: "Portalcraft", deck: deck("A", achimCard) },
      { name: "CPU", className: "Portalcraft", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  game.players[0].resources.evolutionAvailable = true;
  game.players[0].resources.evolutionPoints = 2;
  return game;
}

function forceBoardFollower(game, playerIndex, definition, options = {}) {
  const player = game.players[playerIndex];
  const instance = player.hand.shift() ?? player.deck.shift();
  assert.ok(instance);
  instance.card = definition;
  instance.cardId = definition.id;
  instance.type = definition.type;
  instance.attack = Number(options.attack ?? definition.attack ?? 0);
  instance.defense = Number(options.defense ?? definition.defense ?? 0);
  instance.maxDefense = Number(options.maxDefense ?? definition.defense ?? instance.defense);
  instance.playedTurn = game.turn - 1;
  instance.evolved = Boolean(options.evolved || options.superEvolved);
  instance.superEvolved = Boolean(options.superEvolved);
  instance.attacksRemaining = 1;
  instance.hasAttacked = false;
  instance.canAttackFollowers = true;
  instance.canAttackLeader = true;
  if (options.grantedKeywords) instance.grantedKeywords = [...options.grantedKeywords];
  if (options.suppressedKeywords) instance.suppressedKeywords = [...options.suppressedKeywords];
  player.board.push(instance);
  return instance;
}

const ACHIM_TEXT = "Evolve: Select an enemy follower on the field with 4 attack or less, banish it, and summon an exact copy of it.";

test("Achim only offers legal 4-attack-or-less targets and preserves an evolved target's live state", () => {
  const achimCard = card("achim", { name: "Achim, Lord of Despair", attack: 3, defense: 3, text: ACHIM_TEXT });
  const game = begin(achimCard);
  const achim = forceBoardFollower(game, 0, achimCard);
  const legal = forceBoardFollower(game, 1, card("legal", { attack: 4, defense: 6, keywords: ["Rush"] }), {
    attack: 4,
    defense: 3,
    maxDefense: 8,
    evolved: true,
    grantedKeywords: ["Ward"],
    suppressedKeywords: ["Rush"]
  });
  const illegal = forceBoardFollower(game, 1, card("illegal", { attack: 5, defense: 5 }), { attack: 5 });

  const actions = game.listLegalActions(0).filter(action =>
    action.type === "evolve" && action.followerInstanceId === achim.instanceId
  );
  assert.deepEqual(actions.map(action => action.targetInstanceId), [legal.instanceId]);

  game.dispatch(actions[0]);

  assert.ok(game.players[1].banished.some(item => item.instanceId === legal.instanceId));
  assert.ok(game.players[1].board.some(item => item.instanceId === illegal.instanceId));
  const copy = game.players[0].board.find(item => item.instanceId !== achim.instanceId);
  assert.ok(copy);
  assert.equal(copy.cardId, legal.cardId);
  assert.equal(copy.evolved, true);
  assert.equal(copy.superEvolved, false);
  assert.equal(copy.attack, 4);
  assert.equal(copy.defense, 3);
  assert.equal(copy.maxDefense, 8);
  assert.equal(hasWorldsBeyondKeyword(copy, "Ward"), true);
  assert.equal(hasWorldsBeyondKeyword(copy, "Rush"), false);
  assert.equal(copy.canAttackFollowers, true);
  assert.equal(copy.canAttackLeader, false);
});

test("Achim preserves Super Evo state and its same-turn protections on the exact copy", () => {
  const achimCard = card("achim-super", { name: "Achim, Lord of Despair", attack: 3, defense: 3, text: ACHIM_TEXT });
  const game = begin(achimCard);
  const achim = forceBoardFollower(game, 0, achimCard);
  const target = forceBoardFollower(game, 1, card("super-target", { attack: 4, defense: 7 }), {
    attack: 4,
    defense: 6,
    maxDefense: 9,
    superEvolved: true
  });

  const action = game.listLegalActions(0).find(item =>
    item.type === "evolve"
    && item.followerInstanceId === achim.instanceId
    && item.targetInstanceId === target.instanceId
  );
  assert.ok(action);
  game.dispatch(action);

  const copy = game.players[0].board.find(item => item.instanceId !== achim.instanceId);
  assert.ok(copy);
  assert.equal(copy.evolved, true);
  assert.equal(copy.superEvolved, true);
  assert.equal(copy.attack, 4);
  assert.equal(copy.defense, 6);
  assert.equal(copy.maxDefense, 9);
  assert.equal(copy.canAttackFollowers, true);
  assert.equal(copy.canAttackLeader, false);

  const beforeDefense = copy.defense;
  assert.equal(game.damageFollower(0, copy.instanceId, 99, { actor: 1, reason: "test" }), 0);
  assert.equal(copy.defense, beforeDefense);
  assert.equal(game.destroyFollower(0, copy.instanceId, { actor: 1, reason: "test", byAbility: true }), null);
  assert.ok(game.findBoardCard(0, copy.instanceId));
});
