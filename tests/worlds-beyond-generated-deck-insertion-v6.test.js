import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport, resolveWorldsBeyondTrigger } from "../src/core/rulesets/svwb/effect-resolver.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: []
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "generated-deck-insertion-v6",
    firstPlayer: 0,
    players: [
      { name: "A", deck: fillerDeck("A") },
      { name: "B", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, card) {
  const instance = game.players[0].hand[0];
  instance.card = card;
  instance.cardId = card.id;
  game.registerCardDefinitions([card]);
  return instance;
}

function boardFollower(card, owner = 0) {
  return {
    instanceId: `${card.id}-board`,
    owner,
    cardId: card.id,
    card,
    attack: card.attack ?? 1,
    defense: card.defense ?? 1,
    maxDefense: card.defense ?? 1,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true,
    playedTurn: 0,
    evolved: false,
    superEvolved: false
  };
}

test("standalone named generation inserts a fresh card into deck without an extra Shadow", () => {
  const game = readyGame();
  const card = replaceHandCard(game, {
    id: "looping-verse",
    name: "Looping Verse",
    class: "Runecraft",
    type: "Spell",
    cost: 0,
    keywords: [],
    text: "Add a Looping Verse to your deck."
  });
  const beforeDeck = game.players[0].deck.length;
  const beforeShadows = game.players[0].resources.shadows;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const generated = game.players[0].deck.filter(item => item.card?.name === "Looping Verse");
  assert.equal(game.players[0].deck.length, beforeDeck + 1);
  assert.equal(generated.length, 1);
  assert.notEqual(generated[0].instanceId, card.instanceId);
  assert.equal(game.players[0].resources.shadows, beforeShadows + 1, "only the resolved spell should create a Shadow");
});

test("Valor-style targeted damage resolves before terminal self-generation", () => {
  const game = readyGame();
  const enemy = boardFollower({ id: "valor-target", name: "Valor Target", type: "Follower", cost: 2, attack: 2, defense: 7 }, 1);
  game.players[1].board.push(enemy);
  const card = replaceHandCard(game, {
    id: "valor-cycle",
    name: "Valor Cycle",
    class: "Abysscraft",
    type: "Spell",
    cost: 0,
    keywords: [],
    text: "Select an enemy follower on the field and deal it 5 damage. Add a Valor Cycle to your deck."
  });
  const beforeDeck = game.players[0].deck.length;
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === card.instanceId && item.targetInstanceId === enemy.instanceId);
  assert.ok(action, "targeted cycle should expose a legal target branch");

  game.dispatch(action);

  assert.equal(game.players[1].board.find(item => item.instanceId === enemy.instanceId)?.defense, 2);
  assert.equal(game.players[0].deck.length, beforeDeck + 1);
  assert.equal(game.players[0].deck.filter(item => item.card?.name === "Valor Cycle").length, 1);
});

test("Lhynkal-style Super-Evolve can add ten unique copies to deck", () => {
  const game = readyGame();
  const definition = {
    id: "lhynkal-style",
    name: "Lhynkal Style",
    class: "Runecraft",
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 1,
    keywords: ["Rush", "Super-Evolve"],
    text: "Rush\nSuper-Evolve: Add 10 copies of Lhynkal Style to your deck."
  };
  game.registerCardDefinitions([definition]);
  const source = boardFollower(definition, 0);
  game.players[0].board.push(source);
  const beforeDeck = game.players[0].deck.length;

  const result = resolveWorldsBeyondTrigger(game, { trigger: "super-evolve", playerIndex: 0, source });

  const copies = game.players[0].deck.filter(item => item.card?.name === "Lhynkal Style");
  assert.equal(result.unresolved, false);
  assert.equal(game.players[0].deck.length, beforeDeck + 10);
  assert.equal(copies.length, 10);
  assert.equal(new Set(copies.map(item => item.instanceId)).size, 10);
});

test("draw-before-deck-insertion remains atomic until ordered migration", () => {
  const source = {
    instanceId: "draw-before-cycle",
    owner: 0,
    cardId: "draw-before-cycle",
    card: {
      id: "draw-before-cycle",
      name: "Draw Before Cycle",
      type: "Spell",
      cost: 1,
      keywords: [],
      text: "Draw a card. Add a Draw Before Cycle to your deck."
    }
  };

  const support = getWorldsBeyondTriggerSupport(source, "play");
  assert.equal(support.supported, false);
  assert.match(support.residual, /ordered deck insertion/i);
});
