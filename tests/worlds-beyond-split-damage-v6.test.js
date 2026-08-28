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

const ARAGAVY = card(10154130, {
  name: "Aragavy, Eternal Hunter",
  className: "Abysscraft",
  cost: 7,
  attack: 6,
  defense: 6,
  text: "Fanfare: Deal 7 damage split between all enemy followers.\n\nEvolve: Deal 3 damage to both leaders.",
  keywords: ["Fanfare", "Evolve"]
});

const HARK_TO_THE_NIGHT_SONG = card(10753310, {
  name: "Hark to the Night Song",
  className: "Abysscraft",
  type: "Spell",
  cost: 4,
  attack: 0,
  defense: 0,
  text: "Deal 6 damage split between all enemy followers. Necromancy (6) - Deal 2 damage to the enemy leader.",
  keywords: ["Necromancy"]
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
    seed: "split-damage-v6",
    firstPlayer: 0,
    players: [
      { name: "Abyss", className: "Abysscraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Swordcraft", deck: fillerDeck("B") }
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

function playAction(game, source) {
  return game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
}

test("Aragavy follows the Codex oldest-to-newest 3/3/1 split example", () => {
  const game = readyGame();
  const source = replaceHandCard(game, ARAGAVY);
  const oldest = boardFollower(game, 1, card("oldest", { name: "Oldest", defense: 3 }), "oldest");
  const middle = boardFollower(game, 1, card("middle", { name: "Middle", defense: 3 }), "middle");
  const newest = boardFollower(game, 1, card("newest", { name: "Newest", defense: 2 }), "newest");
  const shadowsBefore = game.players[1].resources.shadows;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, oldest.instanceId), null);
  assert.equal(game.findBoardCard(1, middle.instanceId), null);
  assert.equal(game.findBoardCard(1, newest.instanceId)?.defense, 1);
  assert.equal(game.players[1].resources.shadows, shadowsBefore + 2);

  const damageEvents = game.getEvents({ viewer: 0 })
    .filter(event => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE && event.actor === 0)
    .slice(-3);
  assert.deepEqual(damageEvents.map(event => event.payload.target.instanceId), [oldest.instanceId, middle.instanceId, newest.instanceId]);
  assert.deepEqual(damageEvents.map(event => event.payload.amount), [3, 3, 1]);
});

test("Hark to the Night Song resolves split damage before its active Necromancy leader damage", () => {
  const game = readyGame();
  const source = replaceHandCard(game, HARK_TO_THE_NIGHT_SONG);
  const oldest = boardFollower(game, 1, card("hark-oldest", { name: "Hark Oldest", defense: 2 }), "oldest");
  const newest = boardFollower(game, 1, card("hark-newest", { name: "Hark Newest", defense: 5 }), "newest");
  game.players[0].resources.shadows = 6;

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, oldest.instanceId), null);
  assert.equal(game.findBoardCard(1, newest.instanceId)?.defense, 1);
  assert.equal(game.players[1].hp, 18);
  assert.equal(game.players[0].resources.shadows, 1, "Necromancy spends 6, then the resolved spell creates its normal cemetery Shadow");

  const events = game.getEvents({ viewer: 0 });
  const splitDamageIndex = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE
    && event.payload.target?.instanceId === newest.instanceId);
  const leaderDamageIndex = events.findIndex(event => event.type === BATTLE_EVENT.LEADER_DAMAGE
    && event.payload.targetPlayer === 1
    && event.payload.amount === 2);
  assert.ok(splitDamageIndex >= 0 && leaderDamageIndex > splitDamageIndex);
});
