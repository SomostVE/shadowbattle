import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";

function card(id, extra = {}) {
  return { id, name: id, class: "Forestcraft", type: "Spell", cost: 1, attack: 0, defense: 0, text: "", keywords: [], ...extra };
}

function deck(prefix, special) {
  return [special, ...Array.from({ length: 39 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix}-${index}`,
    class: "Forestcraft",
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 1,
    text: "",
    keywords: []
  }))];
}

function beginWithSpecial(special, cardsPlayedThisTurn = 0) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "mixed-conditions",
    firstPlayer: 0,
    players: [
      { name: "Human", className: "Forestcraft", deck: deck("A", special) },
      { name: "CPU", className: "Forestcraft", deck: deck("B", card("cpu-special")) }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  game.players[0].hp = 15;
  game.players[0].cardsPlayedThisTurn = cardsPlayedThisTurn;
  game.players[0].resources.combo = cardsPlayedThisTurn;

  const instance = game.players[0].hand.find(item => item.cardId === special.id)
    ?? game.players[0].deck.find(item => item.cardId === special.id);
  assert.ok(instance, `missing ${special.id}`);
  game.players[0].hand = game.players[0].hand.filter(item => item !== instance);
  game.players[0].deck = game.players[0].deck.filter(item => item !== instance);
  game.players[0].hand.push(instance);
  return { game, instance };
}

test("inactive inline Combo preserves the unconditional prefix", () => {
  const player = { className: "Forestcraft", cardsPlayedThisTurn: 2, resources: { maxPp: 5, shadows: 0 } };
  const result = evaluateWorldsBeyondClassCondition(
    "Restore 1 defense to your leader. Combo (3) - Gain Crest: Minimized Anxiety.",
    player,
    { class: "Forestcraft" }
  );
  assert.equal(result.active, true);
  assert.equal(result.text, "Restore 1 defense to your leader.");
  assert.ok(result.notes.includes("Combo 3 unavailable"));
});

test("active inline Combo preserves the base effect and appends the conditional effect", () => {
  const player = { className: "Forestcraft", cardsPlayedThisTurn: 3, resources: { maxPp: 5, shadows: 0 } };
  const result = evaluateWorldsBeyondClassCondition(
    "Restore 1 defense to your leader. Combo (3) - Gain Crest: Minimized Anxiety.",
    player,
    { class: "Forestcraft" }
  );
  assert.equal(result.active, true);
  assert.equal(result.text, "Restore 1 defense to your leader. Gain Crest: Minimized Anxiety.");
  assert.ok(result.notes.includes("Combo 3"));
});

test("pure inactive Combo still resolves to no effect", () => {
  const player = { className: "Forestcraft", cardsPlayedThisTurn: 1, resources: { maxPp: 5, shadows: 0 } };
  const result = evaluateWorldsBeyondClassCondition(
    "Combo (3) - Deal 3 damage to an enemy follower.",
    player,
    { class: "Forestcraft" }
  );
  assert.equal(result.active, false);
  assert.equal(result.text, "");
});

test("inline Necromancy keeps the base effect and only consumes shadows when its branch resolves", () => {
  const low = { className: "Abysscraft", resources: { shadows: 4, maxPp: 5 } };
  const inactive = evaluateWorldsBeyondClassCondition(
    "Draw a card. Necromancy (6) - Deal 4 damage to the enemy leader.",
    low,
    { class: "Abysscraft" },
    { consume: true }
  );
  assert.equal(inactive.text, "Draw a card.");
  assert.equal(low.resources.shadows, 4);

  const ready = { className: "Abysscraft", resources: { shadows: 6, maxPp: 5 } };
  const active = evaluateWorldsBeyondClassCondition(
    "Draw a card. Necromancy (6) - Deal 4 damage to the enemy leader.",
    ready,
    { class: "Abysscraft" },
    { consume: true }
  );
  assert.equal(active.text, "Draw a card. Deal 4 damage to the enemy leader.");
  assert.equal(ready.resources.shadows, 0);
});

test("inline Overflow keeps the base effect below 7 max PP", () => {
  const player = { className: "Dragoncraft", resources: { maxPp: 6 } };
  const inactive = evaluateWorldsBeyondClassCondition(
    "Draw a card. Overflow - Deal 2 damage to the enemy leader.",
    player,
    { class: "Dragoncraft" }
  );
  assert.equal(inactive.text, "Draw a card.");

  player.resources.maxPp = 7;
  const active = evaluateWorldsBeyondClassCondition(
    "Draw a card. Overflow - Deal 2 damage to the enemy leader.",
    player,
    { class: "Dragoncraft" }
  );
  assert.equal(active.text, "Draw a card. Deal 2 damage to the enemy leader.");
});

test("real Codex-style Combo spell heals below threshold and adds the Crest only when the played card reaches Combo 3", () => {
  const special = card("codex-style-combo", {
    keywords: ["Combo"],
    text: "Restore 1 defense to your leader. Combo (3) - Gain Crest: Minimized Anxiety."
  });

  const below = beginWithSpecial(special, 0);
  const belowAction = below.game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === below.instance.instanceId);
  assert.ok(belowAction);
  below.game.dispatch(belowAction);
  assert.equal(below.game.players[0].hp, 16);
  assert.equal(below.game.players[0].resources.crests.length, 0);

  const reachesThree = beginWithSpecial(special, 2);
  const activeAction = reachesThree.game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === reachesThree.instance.instanceId);
  assert.ok(activeAction);
  reachesThree.game.dispatch(activeAction);
  assert.equal(reachesThree.game.players[0].hp, 16);
  assert.equal(reachesThree.game.players[0].resources.crests.length, 1);
  assert.equal(reachesThree.game.players[0].resources.crests[0].name, "Minimized Anxiety");
});
