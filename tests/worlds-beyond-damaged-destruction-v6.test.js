import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

function card(id, {
  name = String(id),
  className = "Neutral",
  type = "Follower",
  cost = 1,
  attack = 1,
  defense = 1,
  text = "",
  keywords = []
} = {}) {
  return { id, name, class: className, type, cost, attack, defense, text, keywords, traits: [] };
}

const SNOWSTORM_DRAGONEWT = card(10341120, {
  name: "Snowstorm Dragonewt",
  className: "Dragoncraft",
  cost: 1,
  attack: 1,
  defense: 6,
  text: "Fanfare: Destroy all damaged enemy followers.",
  keywords: ["Fanfare"]
});

const WHITEFROST_WHISPER = card(90044310, {
  name: "Whitefrost Whisper",
  className: "Dragoncraft",
  type: "Spell",
  cost: 0,
  attack: 0,
  defense: 0,
  text: "Select a Mode to activate.\n1. Destroy all damaged enemy followers.\n2. Increase the cost of all cards in your opponent's hand by 1 until the end of their turn.",
  keywords: ["Mode"]
});

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, {
    name: `${prefix} ${index}`,
    cost: 9
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "damaged-destruction-v6",
    firstPlayer: 0,
    players: [
      { name: "Dragon", className: "Dragoncraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Abysscraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, definition) {
  const instance = game.players[0].hand[0];
  instance.card = definition;
  instance.cardId = definition.id;
  return instance;
}

function boardFollower(game, owner, definition, {
  suffix = "board",
  defense = Number(definition.defense ?? 1),
  maxDefense = Number(definition.defense ?? 1)
} = {}) {
  const unit = {
    instanceId: `${owner}:${definition.id}:${suffix}`,
    owner,
    cardId: definition.id,
    card: definition,
    attack: Number(definition.attack ?? 0),
    defense,
    maxDefense,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0,
    evolved: false,
    superEvolved: false,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[owner].board.push(unit);
  return unit;
}

function playActions(game, source) {
  return game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
}

test("Snowstorm Dragonewt destroys only damaged enemy followers and respects destruction immunity", () => {
  const game = readyGame();
  const source = replaceHandCard(game, SNOWSTORM_DRAGONEWT);
  const damaged = boardFollower(game, 1, card("damaged", { name: "Damaged", defense: 5 }), {
    suffix: "damaged",
    defense: 3,
    maxDefense: 5
  });
  const healthy = boardFollower(game, 1, card("healthy", { name: "Healthy", defense: 5 }), {
    suffix: "healthy",
    defense: 5,
    maxDefense: 5
  });
  const immune = boardFollower(game, 1, card("immune", {
    name: "Immune",
    defense: 5,
    text: "Can't be destroyed by abilities."
  }), {
    suffix: "immune",
    defense: 2,
    maxDefense: 5
  });
  const shadowsBefore = game.players[1].resources.shadows;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  const action = playActions(game, source)[0];
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, damaged.instanceId), null);
  assert.ok(game.findBoardCard(1, healthy.instanceId));
  assert.ok(game.findBoardCard(1, immune.instanceId));
  assert.equal(game.players[1].resources.shadows, shadowsBefore + 1);
});

test("mass damaged destruction uses the normal Shadow and Last Words pipeline", () => {
  const game = readyGame();
  const source = replaceHandCard(game, SNOWSTORM_DRAGONEWT);
  const lastWords = boardFollower(game, 1, card("last-words-target", {
    name: "Last Words Target",
    defense: 4,
    text: "Last Words: Draw 1 card.",
    keywords: ["Last Words"]
  }), {
    suffix: "last-words",
    defense: 1,
    maxDefense: 4
  });
  const handBefore = game.players[1].hand.length;
  const shadowsBefore = game.players[1].resources.shadows;

  game.dispatch(playActions(game, source)[0]);

  assert.equal(game.findBoardCard(1, lastWords.instanceId), null);
  assert.equal(game.players[1].resources.shadows, shadowsBefore + 1);
  assert.equal(game.players[1].hand.length, handBefore + 1);
  const trigger = game.getEvents({ viewer: 1 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER
    && event.actor === 1
    && event.payload.trigger === "last-words"
    && event.payload.card?.instanceId === lastWords.instanceId);
  assert.equal(trigger?.payload.resolved, true);
});

test("Whitefrost Whisper exposes its supported damaged-destruction mode without enabling the unsupported hand-cost mode", () => {
  const game = readyGame();
  const source = replaceHandCard(game, WHITEFROST_WHISPER);
  const damaged = boardFollower(game, 1, card("whitefrost-target", { name: "Whitefrost Target", defense: 5 }), {
    suffix: "target",
    defense: 2,
    maxDefense: 5
  });

  const actions = playActions(game, source);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].playMode?.modeIndex, 1);
  game.dispatch(actions[0]);

  assert.equal(game.findBoardCard(1, damaged.instanceId), null);
});
