import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  WORLDS_BEYOND_CREST_LIMIT,
  gainWorldsBeyondCrest,
  getWorldsBeyondCrestCountdown,
  runWorldsBeyondCrestTurnStart
} from "../src/core/rulesets/svwb/crests.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: [],
    traits: [],
    text: ""
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "crest-test",
    firstPlayer: 0,
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function putInHand(game, slot, card) {
  const item = game.players[0].hand[slot];
  item.card = card;
  item.cardId = card.id;
  return item;
}

function putFollower(game, playerIndex, { id, name = id, attack = 1, defense = 4, superEvolved = false, storm = false } = {}) {
  const unit = {
    instanceId: id,
    owner: playerIndex,
    cardId: id,
    card: {
      id,
      name,
      class: "Neutral",
      type: "Follower",
      cost: 1,
      attack,
      defense,
      keywords: storm ? ["Storm"] : [],
      traits: [],
      text: storm ? "Storm." : ""
    },
    attack,
    defense,
    maxDefense: defense,
    evolved: Boolean(superEvolved),
    superEvolved: Boolean(superEvolved),
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true
  };
  game.players[playerIndex].board.push(unit);
  return unit;
}

test("Worlds Beyond Crest limit and duplicate rules match V5", () => {
  const game = readyGame();
  const accepted = [];
  for (let index = 0; index < WORLDS_BEYOND_CREST_LIMIT + 1; index += 1) {
    accepted.push(gainWorldsBeyondCrest(game, 0, `QA Crest ${index}`, { id: 8000 + index, name: `QA Crest ${index}` }).gained);
  }
  assert.deepEqual(accepted, [true, true, true, true, true, false]);
  assert.equal(gainWorldsBeyondCrest(game, 0, "QA Crest 0", { id: 9000 }).reason, "duplicate");
  assert.equal(game.players[0].resources.crests.length, 5);
});

test("known V5 Crest countdowns are preserved while persistent Crests stay null", () => {
  assert.equal(getWorldsBeyondCrestCountdown("Supplicant of Repose"), 4);
  assert.equal(getWorldsBeyondCrestCountdown("Octrice, Hollowness Manifest"), 8);
  assert.equal(getWorldsBeyondCrestCountdown("Lilanthim, Anathema of Predation"), 1);
  assert.equal(getWorldsBeyondCrestCountdown("Mjerrabaine, Great Manifest"), null);
  assert.equal(getWorldsBeyondCrestCountdown("Milteo & Luzen"), null);
});

test("Crests do not tick on the turn they are gained", () => {
  const game = readyGame();
  const result = gainWorldsBeyondCrest(game, 0, "Supplicant of Repose", { id: 8101, name: "Supplicant of Repose" });
  assert.equal(result.crest.countdown, 4);
  const cursor = game.eventSequence;

  runWorldsBeyondCrestTurnStart(game, 0);
  assert.equal(result.crest.countdown, 4);
  assert.equal(game.getEvents({ since: cursor, viewer: 0 }).some(event => event.type === BATTLE_EVENT.CREST_TICK), false);

  game.players[0].personalTurn += 1;
  runWorldsBeyondCrestTurnStart(game, 0);
  assert.equal(result.crest.countdown, 3);
});

test("Crest start effects resolve in acquisition order before Countdown and expiration", () => {
  const game = readyGame();
  const first = gainWorldsBeyondCrest(game, 0, "Gildaria, Anathema of Attunement", { id: 8201, name: "Gildaria, Anathema of Attunement" }).crest;
  const second = gainWorldsBeyondCrest(game, 0, "Lilanthim, Anathema of Predation", { id: 8202, name: "Lilanthim, Anathema of Predation" }).crest;
  game.players[0].personalTurn += 1;
  const callbackOrder = [];
  const cursor = game.eventSequence;

  runWorldsBeyondCrestTurnStart(game, 0, {
    beforeTick(crest) { callbackOrder.push(`start:${crest.name}`); },
    onExpire(crest) { callbackOrder.push(`expire:${crest.name}`); }
  });

  assert.deepEqual(callbackOrder, [
    `start:${first.name}`,
    `start:${second.name}`,
    `expire:${first.name}`,
    `expire:${second.name}`
  ]);
  assert.equal(game.players[0].resources.crests.length, 0);

  const events = game.getEvents({ since: cursor, viewer: 0 });
  assert.deepEqual(events.map(event => event.type), [
    BATTLE_EVENT.CREST_TICK,
    BATTLE_EVENT.CREST_TICK,
    BATTLE_EVENT.CREST_EXPIRED,
    BATTLE_EVENT.CREST_EXPIRED
  ]);
  assert.deepEqual(events.filter(event => event.type === BATTLE_EVENT.CREST_TICK).map(event => event.payload.crest.name), [first.name, second.name]);
});

test("Gain Crest card text creates a real public Crest through GameSession", () => {
  const game = readyGame();
  const card = {
    id: 8301,
    name: "QA Crest Spell",
    class: "Havencraft",
    type: "Spell",
    cost: 0,
    keywords: [],
    traits: [],
    text: "Gain Crest: Supplicant of Repose."
  };
  const item = putInHand(game, 0, card);
  const play = game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === item.instanceId);
  assert.ok(play);
  game.dispatch(play);

  assert.equal(game.players[0].resources.crests.length, 1);
  assert.equal(game.players[0].resources.crests[0].name, "Supplicant of Repose");
  assert.equal(game.players[0].resources.crests[0].countdown, 4);
  assert.equal(game.getEvents({ viewer: 0 }).some(event => event.type === BATTLE_EVENT.CREST_GAINED), true);
});

test("Marwynn then Supplicant resolve at real turn end in Crest acquisition order", () => {
  const game = readyGame();
  game.players[0].hp = 10;
  gainWorldsBeyondCrest(game, 0, "Marwynn, Despair Manifest", { id: 8401, name: "Marwynn, Despair Manifest" });
  gainWorldsBeyondCrest(game, 0, "Supplicant of Repose", { id: 8402, name: "Supplicant of Repose" });
  const enemyHp = game.players[1].hp;
  const cursor = game.eventSequence;

  game.endTurn(0);

  assert.equal(game.players[1].hp, enemyHp - 2, "Marwynn deals split damage equal to active Crest count");
  assert.equal(game.players[0].hp, 11, "Supplicant restores one defense when no follower attacked");
  const activations = game.getEvents({ since: cursor, viewer: 0 })
    .filter(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.actor === 0);
  assert.deepEqual(activations.map(event => event.payload.crest.name), ["Marwynn, Despair Manifest", "Supplicant of Repose"]);
});

test("Marwynn and Supplicant stay inactive after any follower attack declaration", () => {
  const game = readyGame();
  game.players[0].hp = 10;
  const attacker = putFollower(game, 0, { id: "attacker", attack: 1, defense: 1, storm: true });
  gainWorldsBeyondCrest(game, 0, "Marwynn, Despair Manifest", { id: 8501, name: "Marwynn, Despair Manifest" });
  gainWorldsBeyondCrest(game, 0, "Supplicant of Repose", { id: 8502, name: "Supplicant of Repose" });

  game.dispatch({ type: "attack", player: 0, attackerInstanceId: attacker.instanceId, target: "leader" });
  const enemyAfterAttack = game.players[1].hp;
  const cursor = game.eventSequence;
  game.endTurn(0);

  assert.equal(game.players[1].hp, enemyAfterAttack);
  assert.equal(game.players[0].hp, 10);
  assert.equal(game.getEvents({ since: cursor, viewer: 0 }).some(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.actor === 0), false);
});

test("Grimnir Crest damages every enemy follower when an allied follower is Super Evolved", () => {
  const game = readyGame();
  putFollower(game, 0, { id: "super", attack: 4, defense: 4, superEvolved: true });
  const enemyA = putFollower(game, 1, { id: "enemy-a", defense: 5 });
  const enemyB = putFollower(game, 1, { id: "enemy-b", defense: 3 });
  gainWorldsBeyondCrest(game, 0, "Grimnir, Heavenly Gale", { id: 8601, name: "Grimnir, Heavenly Gale" });

  game.endTurn(0);

  assert.equal(enemyA.defense, 3);
  assert.equal(enemyB.defense, 1);
  const activation = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === "Grimnir, Heavenly Gale");
  assert.equal(activation?.payload.damage, 2);
  assert.equal(activation?.payload.targetCount, 2);
});

test("Sandalphon Crest restores one defense to the leader and every damaged allied follower", () => {
  const game = readyGame();
  game.players[0].hp = 17;
  const follower = putFollower(game, 0, { id: "damaged", attack: 2, defense: 5 });
  follower.defense = 2;
  gainWorldsBeyondCrest(game, 0, "Sandalphon, Primarch Successor", { id: 8701, name: "Sandalphon, Primarch Successor" });

  game.endTurn(0);

  assert.equal(game.players[0].hp, 18);
  assert.equal(follower.defense, 3);
  const activation = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === "Sandalphon, Primarch Successor");
  assert.equal(activation?.payload.leaderHealing, 1);
  assert.equal(activation?.payload.followerHealing, 1);
});
