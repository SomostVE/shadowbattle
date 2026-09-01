import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  getWorldsBeyondTriggerSupport,
  resolveWorldsBeyondTrigger
} from "../src/core/rulesets/svwb/effect-resolver.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
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
    seed: "random-allied-buffs-v6",
    firstPlayer: 0,
    players: [
      { name: "A", deck: fillerDeck("A") },
      { name: "B", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function boardFollower(card, suffix) {
  return {
    instanceId: `${card.id}-${suffix}`,
    owner: 0,
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

function source(text, id = "random-buff-source") {
  return {
    instanceId: id,
    owner: 0,
    cardId: id,
    card: {
      id,
      name: id,
      class: "Neutral",
      type: "Spell",
      cost: 0,
      keywords: [],
      text
    }
  };
}

test("Castle-style random allied buff selects exactly one live follower", () => {
  const game = readyGame();
  const first = boardFollower({ id: "first", name: "First", type: "Follower", attack: 2, defense: 2 }, "a");
  const second = boardFollower({ id: "second", name: "Second", type: "Follower", attack: 3, defense: 3 }, "b");
  game.players[0].board.push(first, second);
  game.rng = () => 0.99;
  const effectSource = source("Give a random allied follower on the field +1/+1.");

  const support = getWorldsBeyondTriggerSupport(effectSource, "play");
  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source: effectSource });

  assert.equal(support.supported, true);
  assert.equal(result.unresolved, false);
  assert.equal(first.attack, 2);
  assert.equal(first.defense, 2);
  assert.equal(second.attack, 4);
  assert.equal(second.defense, 4);
  assert.equal(second.maxDefense, 4);
});

test("One-Tailed Fox-style named random buff uses exact card-name matching", () => {
  const game = readyGame();
  const lookalike = boardFollower({
    id: "ginsetsu-lookalike",
    name: "Ginsetsu & Yuzuki, Twin Calamities Apprentice",
    type: "Follower",
    attack: 2,
    defense: 2
  }, "lookalike");
  const exact = boardFollower({
    id: "ginsetsu-exact",
    name: "Ginsetsu & Yuzuki, Twin Calamities",
    type: "Follower",
    attack: 4,
    defense: 4
  }, "exact");
  game.players[0].board.push(lookalike, exact);
  const effectSource = source("Give a random allied Ginsetsu & Yuzuki, Twin Calamities on the field +1/+0.", "fox-last-words");

  const support = getWorldsBeyondTriggerSupport(effectSource, "play");
  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source: effectSource });

  assert.equal(support.supported, true);
  assert.equal(result.unresolved, false);
  assert.equal(lookalike.attack, 2);
  assert.equal(exact.attack, 5);
});

test("Mari-style random buff only considers Super-Evolved allied followers", () => {
  const game = readyGame();
  const evolved = boardFollower({ id: "evolved", name: "Evolved", type: "Follower", attack: 2, defense: 2 }, "evolved");
  evolved.evolved = true;
  const superEvolved = boardFollower({ id: "super", name: "Super", type: "Follower", attack: 3, defense: 3 }, "super");
  superEvolved.evolved = true;
  superEvolved.superEvolved = true;
  game.players[0].board.push(evolved, superEvolved);
  const effectSource = source("Give a random super-evolved allied follower on the field +1/+1.", "mari-turn-end");

  const support = getWorldsBeyondTriggerSupport(effectSource, "play");
  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source: effectSource });

  assert.equal(support.supported, true);
  assert.equal(result.unresolved, false);
  assert.equal(evolved.attack, 2);
  assert.equal(superEvolved.attack, 4);
  assert.equal(superEvolved.defense, 4);
});

test("random allied buff resolves safely when its filtered candidate pool is empty", () => {
  const game = readyGame();
  const ordinary = boardFollower({ id: "ordinary", name: "Ordinary", type: "Follower", attack: 2, defense: 2 }, "ordinary");
  game.players[0].board.push(ordinary);
  const effectSource = source("Give a random super-evolved allied follower on the field +2/+2.", "empty-random-pool");

  const support = getWorldsBeyondTriggerSupport(effectSource, "play");
  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source: effectSource });

  assert.equal(support.supported, true);
  assert.equal(result.unresolved, false);
  assert.equal(result.applied, false);
  assert.equal(ordinary.attack, 2);
  assert.equal(ordinary.defense, 2);
});
