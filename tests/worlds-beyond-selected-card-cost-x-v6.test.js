import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { costOf } from "../src/core/rulesets/svwb/v5/battle-engine-v5-state.js";

const BURNITE = Object.freeze({
  id: 10144110,
  name: "Burnite, Anathema of Flame",
  class: "Dragoncraft",
  type: "Follower",
  cost: 1,
  attack: 2,
  defense: 2,
  traits: ["Anathema"],
  keywords: ["Fanfare", "Super-Evolve"],
  text: "Fanfare: Select a card in your hand and discard it. Deal X damage to all enemy followers. X is the cost of the selected card.\n\nSuper-Evolve: Give your opponent Crest: Burnite, Anathema of Flame."
});

function filler(id, extra = {}) {
  return {
    id,
    name: id,
    class: "Dragoncraft",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    traits: [],
    keywords: [],
    text: "",
    ...extra
  };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => filler(`${prefix}-${index}`));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "burnite-selected-cost-x-v6",
    firstPlayer: 0,
    cardCatalog: [BURNITE],
    players: [
      { name: "Human", className: "Dragoncraft", deck: deck("A") },
      { name: "CPU", className: "Dragoncraft", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, index, definition, extra = {}) {
  const instance = game.players[0].hand[index];
  instance.card = definition;
  instance.cardId = definition.id;
  instance.costDelta = 0;
  instance.attackBonus = 0;
  instance.defenseBonus = 0;
  Object.assign(instance, extra);
  game.registerCardDefinitions([definition]);
  return instance;
}

function enemyFollower(game, id, defense) {
  const definition = filler(id, { cost: 2, attack: 2, defense });
  const unit = {
    instanceId: `1:manual:${id}`,
    owner: 1,
    cardId: definition.id,
    card: definition,
    attack: definition.attack,
    defense: definition.defense,
    maxDefense: definition.defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[1].board.push(unit);
  return unit;
}

function burniteActions(game, burnite) {
  return game.listLegalActions(0).filter(action =>
    action.type === "play-card" && action.cardInstanceId === burnite.instanceId
  );
}

test("Burnite exposes one explicit play branch per selectable hand card", () => {
  const game = readyGame();
  const burnite = replaceHandCard(game, 0, BURNITE);
  const first = replaceHandCard(game, 1, filler("first-discard", { cost: 3 }));
  const second = replaceHandCard(game, 2, filler("second-discard", { cost: 7 }));
  game.players[0].hand = [burnite, first, second];

  const actions = burniteActions(game, burnite);
  assert.equal(actions.length, 2);
  assert.deepEqual(new Set(actions.map(action => action.discardInstanceId)), new Set([first.instanceId, second.instanceId]));
  assert.equal(actions.some(action => !action.discardInstanceId), false);
});

test("Burnite freezes X from the selected card current cost before discarding it", () => {
  const game = readyGame();
  const burnite = replaceHandCard(game, 0, BURNITE);
  const selectedDefinition = filler("discounted-spellboost", {
    type: "Spell",
    cost: 7,
    text: "On Spellboost: Subtract 1 from this card's cost."
  });
  const selected = replaceHandCard(game, 1, selectedDefinition, { costDelta: -1, spellboost: 2 });
  game.players[0].hand = [burnite, selected];
  const survivor = enemyFollower(game, "survivor", 6);
  const lethal = enemyFollower(game, "lethal", 4);
  assert.equal(costOf(selected), 4);

  const action = burniteActions(game, burnite).find(item => item.discardInstanceId === selected.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, survivor.instanceId)?.defense, 2);
  assert.equal(game.findBoardCard(1, lethal.instanceId), null);
  assert.ok(game.players[0].cemetery.some(item => item.instanceId === selected.instanceId));

  const ability = game.getEvents({ viewer: 0 }).find(event =>
    event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.card?.instanceId === burnite.instanceId
  );
  assert.match(ability?.payload?.text ?? "", /Deal 4 damage to all enemy followers/i);
  assert.doesNotMatch(ability?.payload?.text ?? "", /\bX\b|cost of the selected card/i);
});

test("Burnite discards before its X damage resolves", () => {
  const game = readyGame();
  const burnite = replaceHandCard(game, 0, BURNITE);
  const selected = replaceHandCard(game, 1, filler("discard-order", { cost: 2 }));
  game.players[0].hand = [burnite, selected];
  const target = enemyFollower(game, "order-target", 5);

  const action = burniteActions(game, burnite)[0];
  game.dispatch(action);

  const events = game.getEvents({ viewer: 0 });
  const abilityIndex = events.findIndex(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.card?.instanceId === burnite.instanceId);
  const discardIndex = events.findIndex(event => event.type === BATTLE_EVENT.CARD_DISCARDED && event.payload?.card?.instanceId === selected.instanceId);
  const damageIndex = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE && event.payload?.target?.instanceId === target.instanceId);
  assert.ok(abilityIndex >= 0 && discardIndex > abilityIndex && damageIndex > discardIndex);
});

test("Burnite alone in hand remains playable and resolves X as 0 without a discard", () => {
  const game = readyGame();
  const burnite = replaceHandCard(game, 0, BURNITE);
  game.players[0].hand = [burnite];
  const target = enemyFollower(game, "zero-target", 5);

  const actions = burniteActions(game, burnite);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].discardInstanceId, undefined);
  game.dispatch(actions[0]);

  assert.equal(game.findBoardCard(1, target.instanceId)?.defense, 5);
  assert.equal(game.getEvents({ viewer: 0 }).some(event => event.type === BATTLE_EVENT.CARD_DISCARDED), false);
  const ability = game.getEvents({ viewer: 0 }).find(event =>
    event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.card?.instanceId === burnite.instanceId
  );
  assert.match(ability?.payload?.text ?? "", /Deal 0 damage to all enemy followers/i);
  assert.equal(ability?.payload?.resolved, true);
});

test("selected-card cost X is structurally supported without hiding the discard choice", () => {
  const game = readyGame();
  const burnite = replaceHandCard(game, 0, BURNITE);
  const support = getWorldsBeyondTriggerSupport(burnite, "play", null, game.players[0]);

  assert.equal(support.supported, true);
  assert.equal(support.residual, "");
  assert.equal(support.discardRequired, true);
  assert.match(support.text, /Deal 0 damage to all enemy followers/i);
  assert.doesNotMatch(support.text, /\bX\b|cost of the selected card/i);
});

test("ordinary mandatory play discards remain illegal with no selectable hand card", () => {
  const game = readyGame();
  const mandatory = replaceHandCard(game, 0, filler("mandatory-discard", {
    cost: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Select a card in your hand and discard it. Draw a card."
  }));
  game.players[0].hand = [mandatory];

  assert.equal(game.listLegalActions(0).some(action =>
    action.type === "play-card" && action.cardInstanceId === mandatory.instanceId
  ), false);
});
