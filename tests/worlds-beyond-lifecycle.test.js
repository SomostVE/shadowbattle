import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function card(id, extra = {}) {
  return { id, name: id, type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function startedGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "lifecycle-test",
    firstPlayer: 0,
    players: [
      { name: "Human", deck: deck("A") },
      { name: "CPU", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function boardInstance(owner, source, suffix = "manual") {
  return {
    instanceId: `${owner}:${suffix}:${source.id}`,
    owner,
    cardId: source.id,
    card: source,
    attack: Number(source.attack ?? 0),
    defense: Number(source.defense ?? 0),
    maxDefense: Number(source.defense ?? 0),
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false,
    countdown: null
  };
}

test("Countdown ticks after TURN_START and destroys an amulet before the normal draw", () => {
  const game = startedGame();
  const amuletCard = card("countdown-amulet", { type: "Amulet", attack: 0, defense: 0, text: "Countdown (1)" });
  const amulet = boardInstance(0, amuletCard);
  amulet.countdown = 1;
  game.players[0].board.push(amulet);

  game.endTurn(0);
  game.endTurn(1);

  assert.equal(game.findBoardCard(0, amulet.instanceId), null);
  assert.ok(game.players[0].cemetery.some(item => item.instanceId === amulet.instanceId));

  const events = game.getEvents({ viewer: 0 });
  const turnStart = events.findIndex(event => event.type === BATTLE_EVENT.TURN_START && event.actor === 0 && event.payload.personalTurn === 2);
  const tick = events.findIndex((event, index) => index > turnStart && event.type === BATTLE_EVENT.COUNTDOWN_TICK && event.payload.card?.instanceId === amulet.instanceId);
  const destroyed = events.findIndex((event, index) => index > tick && event.type === BATTLE_EVENT.AMULET_DESTROYED && event.payload.card?.instanceId === amulet.instanceId);
  const draw = events.findIndex((event, index) => index > destroyed && event.type === BATTLE_EVENT.DRAW && event.actor === 0 && event.payload.reason === "turn-start");
  assert.ok(turnStart >= 0 && tick > turnStart && destroyed > tick && draw > destroyed);
});

test("Countdown destruction executes Last Words before the turn draw", () => {
  const game = startedGame();
  const amuletCard = card("last-words-amulet", {
    type: "Amulet",
    attack: 0,
    defense: 0,
    text: "Countdown (1)\nLast Words: Deal 2 damage to the enemy leader."
  });
  const amulet = boardInstance(0, amuletCard);
  amulet.countdown = 1;
  game.players[0].board.push(amulet);

  game.endTurn(0);
  game.endTurn(1);

  assert.equal(game.players[1].hp, 18);
  const events = game.getEvents({ viewer: 0 });
  const destroyed = events.findIndex(event => event.type === BATTLE_EVENT.AMULET_DESTROYED && event.payload.card?.instanceId === amulet.instanceId);
  const lastWords = events.findIndex((event, index) => index > destroyed && event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "last-words");
  const damage = events.findIndex((event, index) => index > lastWords && event.type === BATTLE_EVENT.LEADER_DAMAGE && event.payload.reason === "ability");
  const draw = events.findIndex((event, index) => index > damage && event.type === BATTLE_EVENT.DRAW && event.actor === 0 && event.payload.reason === "turn-start");
  assert.ok(destroyed >= 0 && lastWords > destroyed && damage > lastWords && draw > damage);
});

test("start-of-turn abilities resolve before the normal draw", () => {
  const game = startedGame();
  const followerCard = card("turn-start-follower", { text: "At the start of your turn: Draw a card." });
  const follower = boardInstance(0, followerCard);
  game.players[0].board.push(follower);
  const before = game.players[0].hand.length;

  game.endTurn(0);
  game.endTurn(1);

  assert.equal(game.players[0].hand.length, before + 2);
  const events = game.getEvents({ viewer: 0 });
  const start = events.findIndex(event => event.type === BATTLE_EVENT.TURN_START && event.actor === 0 && event.payload.personalTurn === 2);
  const trigger = events.findIndex((event, index) => index > start && event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "turn-start");
  const abilityDraw = events.findIndex((event, index) => index > trigger && event.type === BATTLE_EVENT.DRAW && event.payload.reason === "ability");
  const normalDraw = events.findIndex((event, index) => index > abilityDraw && event.type === BATTLE_EVENT.DRAW && event.payload.reason === "turn-start");
  assert.ok(start >= 0 && trigger > start && abilityDraw > trigger && normalDraw > abilityDraw);
});

test("end-of-turn abilities resolve before TURN_END and before control changes", () => {
  const game = startedGame();
  const followerCard = card("turn-end-follower", { text: "At the end of your turn: Deal 1 damage to the enemy leader." });
  const follower = boardInstance(0, followerCard);
  game.players[0].board.push(follower);

  game.endTurn(0);

  assert.equal(game.players[1].hp, 19);
  assert.equal(game.activePlayer, 1);
  const events = game.getEvents({ viewer: 0 });
  const trigger = events.findIndex(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "turn-end");
  const damage = events.findIndex((event, index) => index > trigger && event.type === BATTLE_EVENT.LEADER_DAMAGE && event.payload.reason === "ability");
  const turnEnd = events.findIndex((event, index) => index > damage && event.type === BATTLE_EVENT.TURN_END && event.actor === 0);
  assert.ok(trigger >= 0 && damage > trigger && turnEnd > damage);
});

test("Ghost banishes itself at the end of its controller's turn without creating a Shadow", () => {
  const game = startedGame();
  const ghostCard = card("ghost", {
    name: "Ghost",
    text: "Storm\nWhen this card leaves the field, banish it.\nAt the end of your turn, banish this card.",
    keywords: ["Storm"]
  });
  const ghost = boardInstance(0, ghostCard);
  game.players[0].board.push(ghost);
  const shadowsBefore = Number(game.players[0].resources.shadows ?? 0);

  game.endTurn(0);

  assert.equal(game.findBoardCard(0, ghost.instanceId), null);
  assert.ok(game.players[0].banished.some(item => item.instanceId === ghost.instanceId));
  assert.ok(!game.players[0].cemetery.some(item => item.instanceId === ghost.instanceId));
  assert.equal(Number(game.players[0].resources.shadows ?? 0), shadowsBefore);

  const events = game.getEvents({ viewer: 0 });
  const trigger = events.findIndex(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.trigger === "turn-end" && event.payload.card?.instanceId === ghost.instanceId);
  const banished = events.findIndex((event, index) => index > trigger && event.type === BATTLE_EVENT.CARD_BANISHED && event.payload.card?.instanceId === ghost.instanceId);
  const turnEnd = events.findIndex((event, index) => index > banished && event.type === BATTLE_EVENT.TURN_END && event.actor === 0);
  assert.ok(trigger >= 0 && banished > trigger && turnEnd > banished);
});

test("quoted granted lifecycle text is not parsed as Illamrita's own turn-end ability", () => {
  const game = startedGame();
  const illamritaCard = card("illamrita", {
    name: "Illamrita, Designated Target",
    text: "Follower Strike: Give this follower Barrier. Give the opposing follower \"Can't attack followers or leaders\" and \"At the end of your turn, banish this card.\"\nLast Words: Gain Crest: Illamrita, Designated Target."
  });
  const illamrita = boardInstance(0, illamritaCard);
  game.players[0].board.push(illamrita);

  game.endTurn(0);

  assert.equal(game.findBoardCard(0, illamrita.instanceId)?.instanceId, illamrita.instanceId);
  assert.ok(!game.players[0].banished.some(item => item.instanceId === illamrita.instanceId));
  const falseTrigger = game.getEvents({ viewer: 0 }).find(event =>
    event.type === BATTLE_EVENT.ABILITY_TRIGGER &&
    event.payload.trigger === "turn-end" &&
    event.payload.card?.instanceId === illamrita.instanceId
  );
  assert.equal(falseTrigger, undefined);
});
