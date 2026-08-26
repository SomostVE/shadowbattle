import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";
import { hasWorldsBeyondKeyword } from "../src/core/rulesets/svwb/combat-readiness.js";
import { baseText } from "../src/core/rulesets/svwb/v5/battle-engine-v5-text.js";

const OCEAN_RIDER = Object.freeze({
  id: 10342120,
  name: "Ocean Rider",
  class: "Dragoncraft",
  type: "Follower",
  cost: 3,
  attack: 1,
  defense: 1,
  traits: [],
  keywords: ["Fanfare", "Majestic Megalorca", "Overflow", "Ward"],
  text: "Fanfare: Summon a Majestic Megalorca. If you're in Overflow, summon 2 instead.\n\nWhenever an allied Marine follower enters the field, give it Ward."
});

const MAJESTIC_MEGALORCA = Object.freeze({
  id: 90041130,
  name: "Majestic Megalorca",
  class: "Dragoncraft",
  type: "Follower",
  cost: 2,
  attack: 2,
  defense: 2,
  traits: ["Marine"],
  keywords: ["Rush"],
  text: "Rush"
});

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    traits: [],
    keywords: [],
    text: ""
  }));
}

function readyGame(maxPp) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: `ocean-rider-${maxPp}`,
    firstPlayer: 0,
    cardCatalog: [OCEAN_RIDER, MAJESTIC_MEGALORCA],
    players: [
      { name: "Dragon", className: "Dragoncraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = maxPp;
  return game;
}

function replaceHandCard(game) {
  const instance = game.players[0].hand[0];
  instance.card = OCEAN_RIDER;
  instance.cardId = OCEAN_RIDER.id;
  return instance;
}

function playOceanRider(game) {
  const rider = replaceHandCard(game);
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === rider.instanceId);
  assert.ok(action);
  game.dispatch(action);
  return rider;
}

test("Fanfare extraction stops before Ocean Rider's persistent Whenever aura", () => {
  const text = baseText(OCEAN_RIDER.text);
  assert.equal(text, "Summon a Majestic Megalorca. If you're in Overflow, summon 2 instead.");
  assert.doesNotMatch(text, /Whenever an allied Marine/i);
});

test("Ocean Rider Overflow summon replacement preserves one summon below 7 max PP", () => {
  const player = { className: "Dragoncraft", resources: { maxPp: 6 } };
  const result = evaluateWorldsBeyondClassCondition(baseText(OCEAN_RIDER.text), player, OCEAN_RIDER);
  assert.equal(result.text, "Summon a Majestic Megalorca.");
  assert.match(result.notes.join(" "), /Overflow inactive/i);
});

test("Ocean Rider Overflow summon replacement becomes two copies at 7 max PP", () => {
  const player = { className: "Dragoncraft", resources: { maxPp: 7 } };
  const result = evaluateWorldsBeyondClassCondition(baseText(OCEAN_RIDER.text), player, OCEAN_RIDER);
  assert.equal(result.text, "Summon 2 copies of Majestic Megalorca.");
  assert.match(result.notes.join(" "), /Overflow/i);
});

test("Ocean Rider outside Overflow summons one Rush Marine and its aura grants Ward", () => {
  const game = readyGame(6);
  const rider = playOceanRider(game);
  const megalorcas = game.players[0].board.filter(unit => unit.card?.name === "Majestic Megalorca");

  assert.equal(game.players[0].board.some(unit => unit.instanceId === rider.instanceId), true);
  assert.equal(megalorcas.length, 1);
  assert.equal(hasWorldsBeyondKeyword(megalorcas[0], "Rush"), true);
  assert.equal(hasWorldsBeyondKeyword(megalorcas[0], "Ward"), true);
  assert.equal(megalorcas[0].canAttackFollowers, true);
  assert.equal(megalorcas[0].canAttackLeader, false);
  assert.equal(game.players[0].resources.rally, 2, "Ocean Rider and its summoned follower each count once");

  const events = game.getEvents({ viewer: 0 });
  const ability = events.find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.name === "Ocean Rider");
  assert.equal(ability?.payload.resolved, true);
  assert.equal(ability?.payload.text, "Summon a Majestic Megalorca.");
  assert.doesNotMatch(ability?.payload.text ?? "", /Whenever/i);
  assert.equal(events.some(event => event.type === BATTLE_EVENT.FOLLOWER_BUFF && event.payload.reason === "allied-marine-entry" && event.payload.card?.name === "Majestic Megalorca"), true);
});

test("Ocean Rider in Overflow summons two unique Megalorcas and both receive Ward", () => {
  const game = readyGame(7);
  playOceanRider(game);
  const megalorcas = game.players[0].board.filter(unit => unit.card?.name === "Majestic Megalorca");

  assert.equal(megalorcas.length, 2);
  assert.equal(new Set(megalorcas.map(unit => unit.instanceId)).size, 2);
  assert.ok(megalorcas.every(unit => hasWorldsBeyondKeyword(unit, "Rush")));
  assert.ok(megalorcas.every(unit => hasWorldsBeyondKeyword(unit, "Ward")));
  assert.equal(game.players[0].resources.rally, 3, "Ocean Rider plus two summons count toward Rally");

  const ability = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.name === "Ocean Rider");
  assert.equal(ability?.payload.resolved, true);
  assert.equal(ability?.payload.text, "Summon 2 copies of Majestic Megalorca.");
});

test("multiple Marine-entry Ward sources do not duplicate the granted keyword", () => {
  const game = readyGame(6);
  playOceanRider(game);
  const firstRider = game.players[0].board.find(unit => unit.card?.name === "Ocean Rider");
  assert.ok(firstRider);
  const secondSource = {
    ...firstRider,
    instanceId: "second-ocean-rider",
    grantedKeywords: []
  };
  game.players[0].board.push(secondSource);

  const token = {
    instanceId: "manual-marine",
    owner: 0,
    cardId: MAJESTIC_MEGALORCA.id,
    card: MAJESTIC_MEGALORCA,
    attack: 2,
    defense: 2,
    maxDefense: 2,
    attacksRemaining: 1
  };
  game.players[0].board.push(token);
  game.emit(BATTLE_EVENT.FOLLOWER_ENTER, { actor: 0, payload: { card: game.cardView(token), summoned: true } });

  assert.equal(hasWorldsBeyondKeyword(token, "Ward"), true);
  const wardBuffs = game.getEvents({ viewer: 0 }).filter(event => event.type === BATTLE_EVENT.FOLLOWER_BUFF && event.payload.card?.instanceId === token.instanceId && event.payload.keywords?.includes("Ward"));
  assert.equal(wardBuffs.length, 1);
});
