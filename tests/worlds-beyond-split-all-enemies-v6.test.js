import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  getWorldsBeyondTriggerSupport,
  resolveWorldsBeyondTrigger
} from "../src/core/rulesets/svwb/effect-resolver.js";

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

const REMNANT_OF_HOLLOWNESS = card(90024310, {
  name: "Remnant of Hollowness",
  className: "Swordcraft",
  type: "Spell",
  cost: 0,
  attack: 0,
  defense: 0,
  text: "Deal 4 damage split between all enemies."
});

const SHINING_DISENCHANTMENT = card(10363210, {
  name: "Shining Disenchantment",
  className: "Havencraft",
  type: "Amulet",
  cost: 3,
  attack: 0,
  defense: 0,
  keywords: ["Countdown", "Last Words", "Engage"],
  text: "Countdown (4)\nLast Words: Deal 4 damage split between all enemies. Restore 4 defense to your leader.\nEngage: Advance this amulet's count by X. X is the number of crests you have."
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
    seed: "split-all-enemies-v6",
    firstPlayer: 0,
    cardCatalog: [REMNANT_OF_HOLLOWNESS, SHINING_DISENCHANTMENT],
    players: [
      { name: "Player", className: "Swordcraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Havencraft", deck: fillerDeck("B") }
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

function boardFollower(game, owner, definition, suffix) {
  const unit = {
    instanceId: `${owner}:${definition.id}:${suffix}`,
    owner,
    cardId: definition.id,
    card: definition,
    attack: Number(definition.attack ?? 0),
    defense: Number(definition.defense ?? 0),
    maxDefense: Number(definition.defense ?? 0),
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

function boardAmulet(game, owner, definition, suffix) {
  const unit = {
    instanceId: `${owner}:${definition.id}:${suffix}`,
    owner,
    cardId: definition.id,
    card: definition,
    countdown: 4
  };
  game.players[owner].board.push(unit);
  return unit;
}

function playAction(game, source) {
  return game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
}

test("Remnant of Hollowness sends all four split points to the leader on an empty enemy field", () => {
  const game = readyGame();
  const source = replaceHandCard(game, REMNANT_OF_HOLLOWNESS);

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[1].hp, 16);
  const leaderHits = game.getEvents({ viewer: 0 }).filter(event => event.type === BATTLE_EVENT.LEADER_DAMAGE
    && event.actor === 0
    && event.payload.targetPlayer === 1);
  assert.deepEqual(leaderHits.slice(-4).map(event => event.payload.amount), [1, 1, 1, 1]);
});

test("split-all-enemies recalculates its target pool after followers are destroyed", () => {
  const game = readyGame();
  const source = replaceHandCard(game, REMNANT_OF_HOLLOWNESS);
  const first = boardFollower(game, 1, card("split-first", { name: "Split First", defense: 2 }), "first");
  const second = boardFollower(game, 1, card("split-second", { name: "Split Second", defense: 1 }), "second");
  const shadowsBefore = game.players[1].resources.shadows;
  game.rng = () => 0;

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, first.instanceId), null);
  assert.equal(game.findBoardCard(1, second.instanceId), null);
  assert.equal(game.players[1].hp, 19, "after both followers leave the field, the remaining point must hit the leader");
  assert.equal(game.players[1].resources.shadows, shadowsBefore + 2);
});

test("Shining Disenchantment Last Words resolves split damage before restoring leader defense", () => {
  const game = readyGame();
  game.players[0].hp = 15;
  const source = boardAmulet(game, 0, SHINING_DISENCHANTMENT, "shining");
  game.rng = () => 0;

  const support = getWorldsBeyondTriggerSupport(source, "last-words", null, game.players[0]);
  assert.equal(support.supported, true);
  const result = resolveWorldsBeyondTrigger(game, {
    trigger: "last-words",
    playerIndex: 0,
    source
  });
  assert.equal(result.unresolved, false);

  assert.equal(game.players[1].hp, 16);
  assert.equal(game.players[0].hp, 19);
  const events = game.getEvents({ viewer: 0 });
  const lastSplitDamage = events.map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === BATTLE_EVENT.LEADER_DAMAGE && event.payload.targetPlayer === 1)
    .at(-1)?.index ?? -1;
  const healIndex = events.findIndex(event => event.type === BATTLE_EVENT.HEAL
    && event.actor === 0
    && event.payload.amount === 4);
  assert.ok(lastSplitDamage >= 0 && healIndex > lastSplitDamage);
});
