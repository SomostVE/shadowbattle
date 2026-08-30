import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

const AMATAZ_TEXT = 'Fanfare: Give this follower +X/+X. X is the number of Pixie followers in your hand.\n\nWard\n\nEvolve: Do this X times: "Deal 1 damage to a random enemy follower." X is the number of Pixie followers in your hand.';

function card(id, { name = String(id), className = "Neutral", type = "Follower", cost = 1, attack = 1, defense = 1, text = "", keywords = [], traits = [] } = {}) {
  return { id, name, class: className, type, cost, attack, defense, text, keywords, traits };
}

function amatazCard() {
  return card(10114130, {
    name: "Amataz, Origin Blader",
    className: "Forestcraft",
    cost: 0,
    attack: 2,
    defense: 2,
    keywords: ["Fanfare", "Ward", "Evolve"],
    text: AMATAZ_TEXT
  });
}

function pixie(id, extra = {}) {
  return card(id, { name: String(id), className: "Forestcraft", traits: ["Pixie"], ...extra });
}

function fillerDeck(prefix, className = "Neutral") {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, {
    name: `${prefix} ${index}`,
    className,
    cost: 9
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "pixie-hand-x-v6",
    firstPlayer: 0,
    players: [
      { className: "Forestcraft", deck: fillerDeck("A", "Forestcraft") },
      { className: "Neutral", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, index, sourceCard) {
  const instance = game.players[0].hand[index];
  assert.ok(instance);
  instance.card = sourceCard;
  instance.cardId = sourceCard.id;
  instance.attack = Number(sourceCard.attack ?? 0);
  instance.defense = Number(sourceCard.defense ?? 0);
  instance.maxDefense = Number(sourceCard.defense ?? 0);
  instance.attackBonus = 0;
  instance.defenseBonus = 0;
  return instance;
}

function enemyFollower(game, index, id, defense) {
  const player = game.players[1];
  const instance = player.hand[index] ?? player.deck[index];
  assert.ok(instance);
  const sourceCard = card(id, { attack: 1, defense });
  player.hand = player.hand.filter(item => item !== instance);
  player.deck = player.deck.filter(item => item !== instance);
  instance.card = sourceCard;
  instance.cardId = id;
  instance.attack = 1;
  instance.defense = defense;
  instance.maxDefense = defense;
  instance.attacksRemaining = 0;
  instance.canAttackFollowers = false;
  instance.canAttackLeader = false;
  player.board.push(instance);
  return instance;
}

test("Pixie hand X counts only Pixie followers", () => {
  const current = {
    className: "Forestcraft",
    board: [],
    hand: [
      { card: pixie("fairy-a"), type: "Follower" },
      { card: pixie("fairy-b"), type: "Follower" },
      { card: pixie("pixie-spell", { type: "Spell" }), type: "Spell" },
      { card: card("ordinary"), type: "Follower" }
    ],
    resources: {}
  };

  const result = evaluateWorldsBeyondClassCondition(
    "Give this follower +X/+X. X is the number of Pixie followers in your hand.",
    current,
    amatazCard()
  );

  assert.equal(result.text, "Give this follower +2/+2.");
  assert.equal(result.mechanic, "stateCount");
  assert.ok(result.notes.includes("X = Pixie followers in hand 2"));
});

test("Amataz Fanfare uses the live hand after Amataz leaves it", () => {
  const game = readyGame();
  const source = replaceHandCard(game, 0, amatazCard());
  replaceHandCard(game, 1, pixie("fairy-a"));
  replaceHandCard(game, 2, pixie("fairy-b"));
  replaceHandCard(game, 3, card("ordinary"));

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.match(support.text, /Give this follower \+2\/\+2/i);

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId);
  assert.ok(action);
  game.dispatch(action);

  const played = game.findBoardCard(0, source.instanceId);
  assert.ok(played);
  assert.equal(played.attack, 4);
  assert.equal(played.defense, 4);
});

test("Amataz Evolve expands the live Pixie count into repeated random damage", () => {
  const game = readyGame();
  const source = replaceHandCard(game, 0, amatazCard());
  game.players[0].hand = game.players[0].hand.filter(item => item !== source);
  source.playedTurn = game.turn - 1;
  source.evolved = false;
  source.superEvolved = false;
  source.attacksRemaining = 1;
  source.canAttackFollowers = true;
  source.canAttackLeader = true;
  game.players[0].board.push(source);

  replaceHandCard(game, 0, pixie("fairy-a"));
  replaceHandCard(game, 1, pixie("fairy-b"));
  replaceHandCard(game, 2, card("ordinary"));

  const first = enemyFollower(game, 0, "fragile", 1);
  const second = enemyFollower(game, 0, "survivor", 3);
  game.rng = () => 0;
  game.players[0].resources.evolutionAvailable = true;
  game.players[0].resources.evolutionPoints = 2;
  game.players[0].resources.superEvolutionAvailable = false;

  const support = getWorldsBeyondTriggerSupport(source, "evolve", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.equal(support.text, "Deal 1 damage to a random enemy follower. Deal 1 damage to a random enemy follower.");

  const action = game.listLegalActions(0).find(item => item.type === "evolve" && item.followerInstanceId === source.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(source.evolved, true);
  assert.equal(game.findBoardCard(1, first.instanceId), null);
  assert.equal(game.findBoardCard(1, second.instanceId)?.defense, 2);
});

test("Pixie hand X stays unresolved when an earlier effect mutates the hand", () => {
  const current = {
    className: "Forestcraft",
    board: [],
    hand: [{ card: pixie("fairy-a"), type: "Follower" }],
    resources: {}
  };
  const text = "Draw a card. Give this follower +X/+X. X is the number of Pixie followers in your hand.";

  const result = evaluateWorldsBeyondClassCondition(text, current, amatazCard());

  assert.equal(result.text, text);
  assert.equal(result.mechanic, null);
  assert.equal(result.notes.some(note => note.startsWith("X =")), false);
});
