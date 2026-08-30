import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

function card(id, extra = {}) {
  return { id, name: String(id), class: "Swordcraft", type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], traits: [], ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function readyGame(cardCatalog = []) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "random-multi-damage-v6",
    firstPlayer: 0,
    cardCatalog,
    players: [
      { name: "Human", className: "Swordcraft", deck: deck("A") },
      { name: "CPU", className: "Swordcraft", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHand(game, index, sourceCard) {
  const instance = game.players[0].hand[index];
  assert.ok(instance);
  instance.card = sourceCard;
  instance.cardId = sourceCard.id;
  instance.attackBonus = 0;
  instance.defenseBonus = 0;
  instance.spellboost = 0;
  return instance;
}

function enemy(game, id, defense = 6) {
  const instance = game.players[1].hand.shift() ?? game.players[1].deck.shift();
  assert.ok(instance);
  const source = card(id, { class: "Neutral", attack: 1, defense });
  instance.card = source;
  instance.cardId = source.id;
  instance.attack = 1;
  instance.defense = defense;
  instance.maxDefense = defense;
  instance.attacksRemaining = 0;
  instance.canAttackFollowers = false;
  instance.canAttackLeader = false;
  game.players[1].board.push(instance);
  return instance;
}

function play(game, source) {
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId);
  assert.ok(action);
  game.dispatch(action);
}

test("Seria deals 1 damage to 2 distinct random enemy followers", () => {
  const game = readyGame();
  const seria = card(10221110, {
    name: "Seria, Gunslinger Maid",
    cost: 0,
    attack: 2,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Deal 1 damage to 2 random enemy followers."
  });
  const source = replaceHand(game, 0, seria);
  const targets = [enemy(game, "e1"), enemy(game, "e2"), enemy(game, "e3")];
  play(game, source);
  assert.equal(targets.filter(unit => game.findBoardCard(1, unit.instanceId)?.defense === 5).length, 2);
  assert.equal(targets.filter(unit => game.findBoardCard(1, unit.instanceId)?.defense === 6).length, 1);
});

test("multi-random damage never hits the same follower twice when too few targets exist", () => {
  const game = readyGame();
  const sourceCard = card("three-random", { cost: 0, keywords: ["Fanfare"], text: "Fanfare: Deal 3 damage to 3 random enemy followers." });
  const source = replaceHand(game, 0, sourceCard);
  const only = enemy(game, "only", 10);
  play(game, source);
  assert.equal(game.findBoardCard(1, only.instanceId)?.defense, 7);
});

test("Waterbending Charmwielder damages 3 distinct followers and Spellboosts the hand 3 times", () => {
  const game = readyGame();
  const charmwielder = card(10531120, {
    name: "Waterbending Charmwielder",
    class: "Runecraft",
    cost: 0,
    attack: 3,
    defense: 3,
    keywords: ["Fanfare"],
    text: "Fanfare: Deal 3 damage to 3 random enemy followers. Spellboost your hand 3 times."
  });
  const source = replaceHand(game, 0, charmwielder);
  const boostable = replaceHand(game, 1, card("boostable", { class: "Runecraft", text: "Spellboost: Subtract 1 from the cost of this card." }));
  const targets = [enemy(game, "w1"), enemy(game, "w2"), enemy(game, "w3"), enemy(game, "w4")];
  play(game, source);
  assert.equal(targets.filter(unit => game.findBoardCard(1, unit.instanceId)?.defense === 3).length, 3);
  assert.equal(targets.filter(unit => game.findBoardCard(1, unit.instanceId)?.defense === 6).length, 1);
  assert.equal(boostable.spellboost, 3);
});

test("March of the Brutes resolves follower damage before its enemy-leader damage", () => {
  const game = readyGame();
  const march = card(10351310, {
    name: "March of the Brutes",
    class: "Abysscraft",
    type: "Spell",
    cost: 0,
    text: "Deal 2 damage to 2 random enemy followers and the enemy leader."
  });
  const source = replaceHand(game, 0, march);
  const targets = [enemy(game, "m1", 5), enemy(game, "m2", 5), enemy(game, "m3", 5)];
  game.players[1].hp = 2;
  play(game, source);
  assert.equal(targets.filter(unit => game.findBoardCard(1, unit.instanceId)?.defense === 3).length, 2);
  assert.equal(game.players[1].hp, 0);
  assert.equal(game.phase, "ended");
});

test("Neutral-cards-in-hand X resolves directly when no earlier effect mutates the hand", () => {
  const player = {
    hand: [
      { card: card("n1", { class: "Neutral" }) },
      { card: card("n2", { class: "Neutral", type: "Spell" }) },
      { card: card("s1", { class: "Swordcraft" }) }
    ],
    board: [],
    resources: {}
  };
  const result = evaluateWorldsBeyondClassCondition(
    "Deal X damage to 2 random enemy followers. X is the number of Neutral cards in your hand.",
    player,
    card("warden", { class: "Neutral" })
  );
  assert.equal(result.text, "Deal 2 damage to 2 random enemy followers.");
  assert.ok(result.notes.includes("X = Neutral cards in hand 2"));
});

test("Warden counts the generated Jailor before resolving live Neutral-hand damage", () => {
  const jailor = card(10901120, { name: "Jailor of Antiquity", class: "Neutral", cost: 6, attack: 6, defense: 6 });
  const game = readyGame([jailor]);
  const warden = card(10903110, {
    name: "Warden of Selflessness",
    class: "Neutral",
    cost: 0,
    attack: 4,
    defense: 4,
    keywords: ["Fanfare", "Evolve"],
    text: "Fanfare: Add a Jailor of Antiquity to your hand. Deal X damage to 2 random enemy followers. X is the number of Neutral cards in your hand.\n\nEvolve: Recover 1 play point."
  });
  const source = replaceHand(game, 0, warden);
  replaceHand(game, 1, card("neutral-a", { class: "Neutral" }));
  replaceHand(game, 2, card("neutral-b", { class: "Neutral", type: "Spell" }));
  replaceHand(game, 3, card("sword-a", { class: "Swordcraft" }));
  replaceHand(game, 4, card("sword-b", { class: "Swordcraft" }));
  const first = enemy(game, "warden-e1", 6);
  const second = enemy(game, "warden-e2", 6);

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.match(support.text, /equal to the number of Neutral cards in your hand/i);

  play(game, source);
  assert.equal(game.findBoardCard(1, first.instanceId)?.defense, 3);
  assert.equal(game.findBoardCard(1, second.instanceId)?.defense, 3);
  assert.equal(game.players[0].hand.filter(item => item.card?.class === "Neutral").length, 3);
  assert.ok(game.players[0].hand.some(item => item.card?.name === "Jailor of Antiquity"));
});
