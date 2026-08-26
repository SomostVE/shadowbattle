import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";

const STRIKE = Object.freeze({
  id: 10041310,
  name: "Strike of the Dragonewt",
  class: "Dragoncraft",
  type: "Spell",
  cost: 1,
  attack: 0,
  defense: 0,
  traits: [],
  keywords: ["Overflow"],
  text: "Select an enemy follower on the field and deal it 2 damage. If you're in Overflow, deal 4 damage instead."
});

function card(id, extra = {}) {
  return { id, name: id, class: "Dragoncraft", type: "Follower", cost: 9, attack: 1, defense: 1, traits: [], keywords: [], text: "", ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function readyGame(maxPp) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: `overflow-instead-${maxPp}`,
    firstPlayer: 0,
    cardCatalog: [STRIKE],
    players: [
      { name: "Dragon", className: "Dragoncraft", deck: deck("A") },
      { name: "Enemy", className: "Dragoncraft", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.maxPp = maxPp;
  game.players[0].resources.pp = maxPp;

  const spell = game.players[0].hand[0];
  spell.card = STRIKE;
  spell.cardId = STRIKE.id;
  spell.costDelta = 0;

  const enemyCard = card("overflow-target", { cost: 2, attack: 2, defense: 7 });
  const target = {
    instanceId: "1:manual:overflow-target",
    owner: 1,
    cardId: enemyCard.id,
    card: enemyCard,
    attack: 2,
    defense: 7,
    maxDefense: 7,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[1].board.push(target);
  return { game, spell, target };
}

test("Overflow suffix damage replacement keeps the base amount below 7 max PP", () => {
  const result = evaluateWorldsBeyondClassCondition(STRIKE.text, {
    className: "Dragoncraft",
    resources: { maxPp: 6 }
  }, STRIKE);

  assert.equal(result.text, "Select an enemy follower on the field and deal it 2 damage.");
  assert.equal(result.mechanic, "overflow");
  assert.ok(result.notes.includes("Overflow inactive"));
});

test("Overflow suffix damage replacement rewrites the selected effect at 7+ max PP", () => {
  const result = evaluateWorldsBeyondClassCondition(STRIKE.text, {
    className: "Dragoncraft",
    resources: { maxPp: 7 }
  }, STRIKE);

  assert.equal(result.text, "Select an enemy follower on the field and deal it 4 damage.");
  assert.equal(result.mechanic, "overflow");
  assert.ok(result.notes.includes("Overflow"));
});

test("Strike of the Dragonewt deals 2 outside Overflow and remains fully resolved", () => {
  const { game, spell, target } = readyGame(6);
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId && item.targetInstanceId === target.instanceId);
  assert.ok(action);
  assert.equal(action.targetAmount, 2);

  game.dispatch(action);

  assert.equal(target.defense, 5);
  const ability = game.getEvents({ viewer: 0 }).find(event => event.type === "ability-trigger" && event.payload.card?.instanceId === spell.instanceId);
  assert.equal(ability?.payload.resolved, true);
  assert.equal(ability?.payload.targetKind, "damage");
  assert.match(ability?.payload.text ?? "", /deal it 2 damage/i);
});

test("Strike of the Dragonewt deals 4 in Overflow and exposes the upgraded legal action", () => {
  const { game, spell, target } = readyGame(7);
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId && item.targetInstanceId === target.instanceId);
  assert.ok(action);
  assert.equal(action.targetAmount, 4);

  game.dispatch(action);

  assert.equal(target.defense, 3);
  const ability = game.getEvents({ viewer: 0 }).find(event => event.type === "ability-trigger" && event.payload.card?.instanceId === spell.instanceId);
  assert.equal(ability?.payload.resolved, true);
  assert.match(ability?.payload.text ?? "", /deal it 4 damage/i);
});
