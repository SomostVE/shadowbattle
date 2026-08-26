import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { hasWorldsBeyondKeyword } from "../src/core/rulesets/svwb/combat-readiness.js";

const JELLYFISH_DANCER = Object.freeze({
  id: 10542120,
  name: "Jellyfish Dancer",
  class: "Dragoncraft",
  type: "Follower",
  rarity: "Silver",
  cost: 2,
  attack: 2,
  defense: 1,
  traits: [],
  keywords: ["Bane", "Fanfare", "Majestic Megalorca", "Rush"],
  text: "Fanfare: Add a Majestic Megalorca to your hand.\n\nWhenever an allied Marine follower enters the field, give this follower Rush and Bane."
});

const MAJESTIC_MEGALORCA = Object.freeze({
  id: 90041130,
  name: "Majestic Megalorca",
  class: "Dragoncraft",
  type: "Follower",
  cost: 1,
  attack: 1,
  defense: 1,
  traits: ["Marine"],
  keywords: ["Rush"],
  text: "Rush"
});

const OCEAN_RIDER = Object.freeze({
  id: 10342120,
  name: "Ocean Rider",
  class: "Dragoncraft",
  type: "Follower",
  cost: 2,
  attack: 2,
  defense: 2,
  traits: [],
  keywords: ["Fanfare", "Majestic Megalorca", "Overflow", "Ward"],
  text: "Fanfare: Summon a Majestic Megalorca. If you're in Overflow, summon 2 instead.\n\nWhenever an allied Marine follower enters the field, give it Ward."
});

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
    seed: "jellyfish-dancer",
    firstPlayer: 0,
    cardCatalog: [JELLYFISH_DANCER, MAJESTIC_MEGALORCA, OCEAN_RIDER],
    players: [
      { name: "Dragon", className: "Dragoncraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 6;
  return game;
}

function replaceHandCard(game, card) {
  const instance = game.players[0].hand[0];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

function boardFollower(card, owner, instanceId) {
  return {
    instanceId,
    owner,
    cardId: card.id,
    card,
    attack: Number(card.attack ?? 0),
    defense: Number(card.defense ?? 0),
    maxDefense: Number(card.defense ?? 0),
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: false,
    canAttackLeader: false
  };
}

test("Jellyfish Dancer gains Rush and Bane when its generated Marine enters", () => {
  const game = readyGame();
  const dancerCard = replaceHandCard(game, JELLYFISH_DANCER);
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: dancerCard.instanceId });

  const dancer = game.players[0].board.find(unit => unit.instanceId === dancerCard.instanceId);
  assert.ok(dancer);
  assert.equal(hasWorldsBeyondKeyword(dancer, "Rush"), false, "Codex keyword index must not activate the conditional Rush early");
  assert.equal(hasWorldsBeyondKeyword(dancer, "Bane"), false, "Codex keyword index must not activate the conditional Bane early");
  const megalorca = game.players[0].hand.find(item => item.card?.id === MAJESTIC_MEGALORCA.id);
  assert.ok(megalorca, "Fanfare should add the real Majestic Megalorca first");

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: megalorca.instanceId });

  assert.equal(hasWorldsBeyondKeyword(dancer, "Rush"), true);
  assert.equal(hasWorldsBeyondKeyword(dancer, "Bane"), true);
  assert.equal(dancer.canAttackFollowers, true, "newly granted Rush must update same-turn combat readiness");
  assert.equal(dancer.canAttackLeader, false);
  const buff = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.FOLLOWER_BUFF && event.payload.reason === "allied-marine-entry-self");
  assert.equal(buff?.payload.card?.instanceId, dancer.instanceId);
  assert.deepEqual(buff?.payload.keywords, ["Rush", "Bane"]);
  assert.equal(buff?.payload.triggerCard?.cardId, MAJESTIC_MEGALORCA.id);
});

test("Jellyfish Dancer's granted Bane participates in normal combat", () => {
  const game = readyGame();
  const dancerCard = replaceHandCard(game, JELLYFISH_DANCER);
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: dancerCard.instanceId });
  const dancer = game.players[0].board.find(unit => unit.instanceId === dancerCard.instanceId);
  const megalorca = game.players[0].hand.find(item => item.card?.id === MAJESTIC_MEGALORCA.id);
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: megalorca.instanceId });

  const wall = boardFollower({ id: "large-wall", name: "Large Wall", type: "Follower", attack: 0, defense: 8, keywords: [] }, 1, "large-wall");
  game.players[1].board.push(wall);
  game.dispatch({ type: "attack", player: 0, attackerInstanceId: dancer.instanceId, targetInstanceId: wall.instanceId });

  assert.equal(game.players[1].board.some(unit => unit.instanceId === wall.instanceId), false, "Bane should destroy a follower that survived raw damage");
  assert.equal(game.players[1].resources.shadows, 1);
});

test("Marine entry resolves Ocean Rider Ward and Jellyfish self-keywords in the same event chain", () => {
  const game = readyGame();
  const dancer = boardFollower(JELLYFISH_DANCER, 0, "jellyfish-source");
  const rider = boardFollower(OCEAN_RIDER, 0, "ocean-rider-source");
  game.players[0].board.push(dancer, rider);
  const marine = boardFollower(MAJESTIC_MEGALORCA, 0, "marine-entry");
  game.players[0].board.push(marine);

  game.emit(BATTLE_EVENT.FOLLOWER_ENTER, { actor: 0, payload: { card: game.cardView(marine), position: 2 } });

  assert.equal(hasWorldsBeyondKeyword(marine, "Ward"), true);
  assert.equal(hasWorldsBeyondKeyword(dancer, "Rush"), true);
  assert.equal(hasWorldsBeyondKeyword(dancer, "Bane"), true);
  const events = game.getEvents({ viewer: 0 });
  assert.equal(events.some(event => event.type === BATTLE_EVENT.FOLLOWER_BUFF && event.payload.reason === "allied-marine-entry" && event.payload.card?.instanceId === marine.instanceId), true);
  assert.equal(events.some(event => event.type === BATTLE_EVENT.FOLLOWER_BUFF && event.payload.reason === "allied-marine-entry-self" && event.payload.card?.instanceId === dancer.instanceId), true);
});

test("repeated Marine entries do not duplicate Jellyfish Dancer's granted keywords", () => {
  const game = readyGame();
  const dancer = boardFollower(JELLYFISH_DANCER, 0, "jellyfish-source");
  game.players[0].board.push(dancer);

  for (const id of ["marine-one", "marine-two"]) {
    const marine = boardFollower(MAJESTIC_MEGALORCA, 0, id);
    game.players[0].board.push(marine);
    game.emit(BATTLE_EVENT.FOLLOWER_ENTER, { actor: 0, payload: { card: game.cardView(marine), position: game.players[0].board.length - 1 } });
  }

  assert.deepEqual(dancer.grantedKeywords, ["Rush", "Bane"]);
  const buffs = game.getEvents({ viewer: 0 }).filter(event => event.type === BATTLE_EVENT.FOLLOWER_BUFF && event.payload.reason === "allied-marine-entry-self" && event.payload.card?.instanceId === dancer.instanceId);
  assert.equal(buffs.length, 1);
});
