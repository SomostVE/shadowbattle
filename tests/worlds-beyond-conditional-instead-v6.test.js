import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";

function card(id, { name = String(id), className = "Forestcraft", type = "Follower", cost = 1, attack = 1, defense = 1, text = "", keywords = [] } = {}) {
  return { id, name, class: className, type, cost, attack, defense, text, keywords };
}

function deck(prefix, firstCard) {
  return [firstCard, ...Array.from({ length: 39 }, (_, index) => card(`${prefix}-${index}`, { name: `${prefix} ${index}` }))];
}

function begin(sourceCard) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "conditional-instead-v6",
    firstPlayer: 0,
    players: [
      { name: "Human", deck: deck("A", sourceCard) },
      { name: "CPU", deck: deck("B", card("enemy-anchor", { name: "Enemy Anchor", className: "Forestcraft", attack: 2, defense: 5 })) }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].className = "Forestcraft";
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function forceCardIntoHand(game, sourceCard) {
  const instance = game.players[0].deck.find(item => item.cardId === sourceCard.id) ?? game.players[0].hand.find(item => item.cardId === sourceCard.id);
  assert.ok(instance, `missing ${sourceCard.id}`);
  game.players[0].deck = game.players[0].deck.filter(item => item !== instance);
  game.players[0].hand = game.players[0].hand.filter(item => item !== instance);
  game.players[0].hand.push(instance);
  return instance;
}

function forceEnemyFollower(game, id, defense = 6) {
  const instance = game.players[1].hand.shift();
  assert.ok(instance);
  instance.cardId = id;
  instance.card = card(id, { name: id, className: "Forestcraft", attack: 2, defense });
  instance.attack = 2;
  instance.defense = defense;
  instance.maxDefense = defense;
  instance.attacksRemaining = 0;
  instance.canAttackFollowers = false;
  instance.canAttackLeader = false;
  game.players[1].board.push(instance);
  return instance;
}

const TARGET_REPLACEMENT_TEXT = "Select an enemy follower on the field and deal it 4 damage. Combo (3) - Deal damage to all enemy followers instead.";

test("active Combo replaces the targeted damage clause instead of appending to it", () => {
  const result = evaluateWorldsBeyondClassCondition(
    TARGET_REPLACEMENT_TEXT,
    { className: "Forestcraft", cardsPlayedThisTurn: 3, resources: { combo: 3 } },
    card(10914110, { name: "Magachiyo, Aromatic Convict", text: TARGET_REPLACEMENT_TEXT })
  );

  assert.equal(result.text, "Deal 4 damage to all enemy followers.");
  assert.equal(result.mechanic, "combo");
  assert.ok(result.notes.includes("Combo 3"));
});

test("inactive Combo preserves the original explicit follower target", () => {
  const result = evaluateWorldsBeyondClassCondition(
    TARGET_REPLACEMENT_TEXT,
    { className: "Forestcraft", cardsPlayedThisTurn: 2, resources: { combo: 2 } },
    card(10211120, { name: "Dwarven Malletman", text: TARGET_REPLACEMENT_TEXT })
  );

  assert.equal(result.text, "Select an enemy follower on the field and deal it 4 damage.");
  assert.ok(result.notes.includes("Combo 3 unavailable"));
});

test("Combo 3 play action removes target branches and damages every enemy follower", () => {
  const source = card("conditional-area-fanfare", {
    name: "Conditional Area Fanfare",
    cost: 2,
    attack: 2,
    defense: 2,
    text: `Fanfare: ${TARGET_REPLACEMENT_TEXT}`,
    keywords: ["Fanfare", "Combo"]
  });
  const game = begin(source);
  const sourceInstance = forceCardIntoHand(game, source);
  const first = forceEnemyFollower(game, "enemy-one", 6);
  const second = forceEnemyFollower(game, "enemy-two", 7);
  game.players[0].cardsPlayedThisTurn = 2;
  game.players[0].resources.combo = 2;

  const actions = game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === sourceInstance.instanceId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].targetInstanceId, undefined);

  game.dispatch(actions[0]);
  assert.equal(game.findBoardCard(1, first.instanceId)?.defense, 2);
  assert.equal(game.findBoardCard(1, second.instanceId)?.defense, 3);
});
