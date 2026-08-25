import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

const CARDS = Object.freeze({
  gearAmbition: { id: 7101, name: "Gear of Ambition", class: "Portalcraft", type: "Amulet", cost: 1, traits: ["Artifact"], keywords: [], text: "Fuse: Artifact cards\n" },
  gearRemembrance: { id: 7102, name: "Gear of Remembrance", class: "Portalcraft", type: "Amulet", cost: 1, traits: ["Artifact"], keywords: [], text: "Fuse: Artifact cards\n" },
  striker: { id: 7103, name: "Striker Artifact", class: "Portalcraft", type: "Follower", cost: 2, attack: 2, defense: 2, traits: ["Artifact"], keywords: [], text: "Fuse: Artifact cards\n" },
  fortifier: { id: 7104, name: "Fortifier Artifact", class: "Portalcraft", type: "Follower", cost: 3, attack: 2, defense: 4, traits: ["Artifact"], keywords: [], text: "Fuse: Artifact cards\n" },
  alpha: { id: 7105, name: "Ominous Artifact α", class: "Portalcraft", type: "Follower", cost: 1, attack: 1, defense: 1, traits: ["Artifact"], keywords: [], text: "Fuse: Ominous Artifact β or Ominous Artifact γ\n" },
  beta: { id: 7106, name: "Ominous Artifact β", class: "Portalcraft", type: "Follower", cost: 2, attack: 2, defense: 2, traits: ["Artifact"], keywords: [], text: "" },
  gamma: { id: 7107, name: "Ominous Artifact γ", class: "Portalcraft", type: "Follower", cost: 3, attack: 3, defense: 3, traits: ["Artifact"], keywords: [], text: "" },
  omega: { id: 7108, name: "Masterwork Artifact Ω", class: "Portalcraft", type: "Follower", cost: 5, attack: 5, defense: 5, traits: ["Artifact"], keywords: [], text: "" },
  garden: { id: 7201, name: "Garden's Allure", class: "Forestcraft", type: "Spell", cost: 0, traits: [], keywords: [], text: "Fuse: Forestcraft cards\nDraw a card. If you've Fused to this card, draw 2 instead." },
  forestA: { id: 7202, name: "Forest Material A", class: "Forestcraft", type: "Follower", cost: 1, attack: 1, defense: 1, traits: [], keywords: [], text: "" },
  forestB: { id: 7203, name: "Forest Material B", class: "Forestcraft", type: "Follower", cost: 1, attack: 1, defense: 1, traits: [], keywords: [], text: "" },
  returning: { id: 7301, name: "Returning Slash", class: "Swordcraft", type: "Spell", cost: 0, traits: [], keywords: [], text: "Fuse: Loot cards\nIf you've Fused to this card, draw a card." },
  lootA: { id: 7302, name: "Gilded Goblet", class: "Swordcraft", type: "Spell", cost: 1, traits: ["Loot"], keywords: [], text: "" },
  lootB: { id: 7303, name: "Gilded Boots", class: "Swordcraft", type: "Spell", cost: 1, traits: ["Loot"], keywords: [], text: "" },
  sinciro: { id: 7304, name: "Sinciro, Heir to Usurpation", class: "Swordcraft", type: "Follower", cost: 0, attack: 2, defense: 2, traits: [], keywords: [], text: "Fuse: Loot cards\nFanfare: Deal X damage to all enemies. X is the number of differently named cards Fused to this card." },
  cannon: { id: 7401, name: "Ancient Cannon", class: "Portalcraft", type: "Amulet", cost: 1, traits: ["Artifact"], keywords: [], text: "" },
  congregant: { id: 7402, name: "Congregant of Usurpation", class: "Swordcraft", type: "Follower", cost: 2, attack: 2, defense: 3, traits: [], keywords: [], text: "" }
});

const CATALOG = Object.freeze(Object.values(CARDS));

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({ id: `${prefix}-${index}`, name: `${prefix} ${index}`, type: "Follower", cost: 9, attack: 1, defense: 1, keywords: [], traits: [], text: "" }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "fuse-test",
    firstPlayer: 0,
    cardCatalog: CATALOG,
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function putInHand(game, playerIndex, slot, card) {
  const instance = game.players[playerIndex].hand[slot];
  instance.card = card;
  instance.cardId = card.id;
  instance.costDelta = 0;
  instance.attackBonus = 0;
  instance.defenseBonus = 0;
  instance.fusedThisTurn = false;
  instance.fusedCards = [];
  instance.fusedNames = [];
  return instance;
}

function putEnemyFollower(game, { id = "enemy", name = "Enemy", defense = 6 } = {}) {
  const unit = {
    instanceId: id,
    owner: 1,
    cardId: id,
    card: { id, name, type: "Follower", cost: 1, attack: 1, defense, keywords: [], traits: [], text: "" },
    attack: 1,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[1].board.push(unit);
  return unit;
}

function putBoardCard(game, playerIndex, card, instanceId) {
  const unit = {
    instanceId,
    owner: playerIndex,
    cardId: card.id,
    card,
    attack: Number(card.attack ?? 0),
    defense: Number(card.defense ?? 0),
    maxDefense: Number(card.defense ?? 0),
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[playerIndex].board.push(unit);
  return unit;
}

test("Fuse exposes legal actions and preserves the V5 Gear transformation chain", () => {
  const game = readyGame();
  const target = putInHand(game, 0, 0, CARDS.gearAmbition);
  const remembrance = putInHand(game, 0, 1, CARDS.gearRemembrance);
  const fortifier = putInHand(game, 0, 2, CARDS.fortifier);

  let action = game.listLegalActions(0).find(item => item.type === "fuse" && item.targetInstanceId === target.instanceId && item.materialInstanceIds.includes(remembrance.instanceId));
  assert.ok(action, "Gear of Ambition should expose a Fuse action");
  assert.equal(action.projectedTransform, "Striker Artifact");
  game.dispatch(action);

  assert.equal(target.card.name, "Striker Artifact");
  assert.equal(target.fusedThisTurn, false, "a transformed Fuse card is a new Fuse card this turn");
  assert.equal(game.players[0].fusedCards.length, 1);
  assert.equal(game.players[0].resources.shadows, 0, "Fuse materials never create Shadows");

  action = game.listLegalActions(0).find(item => item.type === "fuse" && item.targetInstanceId === target.instanceId && item.materialInstanceIds.includes(fortifier.instanceId));
  assert.ok(action, "the transformed Striker Artifact should be able to Fuse again");
  assert.equal(action.projectedTransform, "Ominous Artifact γ");
  game.dispatch(action);
  assert.equal(target.card.name, "Ominous Artifact γ");
  assert.equal(game.players[0].fusedCards.length, 2);

  const fuseEvents = game.getEvents({ viewer: 0 }).filter(event => [BATTLE_EVENT.FUSE, BATTLE_EVENT.CARD_TRANSFORM].includes(event.type));
  assert.deepEqual(fuseEvents.map(event => event.type), [BATTLE_EVENT.FUSE, BATTLE_EVENT.CARD_TRANSFORM, BATTLE_EVENT.FUSE, BATTLE_EVENT.CARD_TRANSFORM]);
});

test("Ominous Artifact alpha transforms into Masterwork Artifact Omega after beta and gamma", () => {
  const game = readyGame();
  const alpha = putInHand(game, 0, 0, CARDS.alpha);
  const beta = putInHand(game, 0, 1, CARDS.beta);
  const gamma = putInHand(game, 0, 2, CARDS.gamma);
  const action = game.listLegalActions(0).find(item => item.type === "fuse" && item.targetInstanceId === alpha.instanceId && item.materialInstanceIds.length === 2);
  assert.ok(action);
  assert.deepEqual(new Set(action.materialInstanceIds), new Set([beta.instanceId, gamma.instanceId]));
  assert.equal(action.projectedTransform, "Masterwork Artifact Ω");
  game.dispatch(action);
  assert.equal(alpha.card.name, "Masterwork Artifact Ω");
  assert.equal(game.players[0].fusedCards.length, 2);
});

test("non-transforming Fuse cards can Fuse only once per turn and reset next turn", () => {
  const game = readyGame();
  const garden = putInHand(game, 0, 0, CARDS.garden);
  const forestA = putInHand(game, 0, 1, CARDS.forestA);
  putInHand(game, 0, 2, CARDS.forestB);
  const first = game.listLegalActions(0).find(item => item.type === "fuse" && item.targetInstanceId === garden.instanceId && item.materialInstanceIds.includes(forestA.instanceId));
  game.dispatch(first);
  assert.equal(garden.fusedThisTurn, true);
  assert.equal(game.listLegalActions(0).some(item => item.type === "fuse" && item.targetInstanceId === garden.instanceId), false);

  game.endTurn(0);
  game.endTurn(1);
  assert.equal(game.activePlayer, 0);
  assert.equal(garden.fusedThisTurn, false);
  assert.equal(game.listLegalActions(0).some(item => item.type === "fuse" && item.targetInstanceId === garden.instanceId), true);
});

test("Ancient Cannon and Congregant of Usurpation react to Fuse before transformation", () => {
  const cannonGame = readyGame();
  const gear = putInHand(cannonGame, 0, 0, CARDS.gearAmbition);
  const remembrance = putInHand(cannonGame, 0, 1, CARDS.gearRemembrance);
  putBoardCard(cannonGame, 0, CARDS.cannon, "cannon");
  const cannonTarget = putEnemyFollower(cannonGame, { id: "cannon-target", defense: 5 });
  const gearFuse = cannonGame.listLegalActions(0).find(item => item.type === "fuse" && item.targetInstanceId === gear.instanceId && item.materialInstanceIds.includes(remembrance.instanceId));
  cannonGame.dispatch(gearFuse);
  assert.equal(cannonTarget.defense, 3);
  const relevant = cannonGame.getEvents({ viewer: 0 }).filter(event => [BATTLE_EVENT.FUSE, BATTLE_EVENT.FOLLOWER_DAMAGE, BATTLE_EVENT.CARD_TRANSFORM].includes(event.type));
  assert.deepEqual(relevant.slice(-3).map(event => event.type), [BATTLE_EVENT.FUSE, BATTLE_EVENT.FOLLOWER_DAMAGE, BATTLE_EVENT.CARD_TRANSFORM]);

  const lootGame = readyGame();
  const returning = putInHand(lootGame, 0, 0, CARDS.returning);
  const loot = putInHand(lootGame, 0, 1, CARDS.lootA);
  putBoardCard(lootGame, 0, CARDS.congregant, "congregant");
  const lootTarget = putEnemyFollower(lootGame, { id: "loot-target", defense: 6 });
  const lootFuse = lootGame.listLegalActions(0).find(item => item.type === "fuse" && item.targetInstanceId === returning.instanceId && item.materialInstanceIds.includes(loot.instanceId));
  lootGame.dispatch(lootFuse);
  assert.equal(lootTarget.defense, 3);
});

test("Garden's Allure draws two after Fuse without giving a Shadow for the material", () => {
  const game = readyGame();
  const garden = putInHand(game, 0, 0, CARDS.garden);
  const material = putInHand(game, 0, 1, CARDS.forestA);
  const fuseAction = game.listLegalActions(0).find(item => item.type === "fuse" && item.targetInstanceId === garden.instanceId && item.materialInstanceIds.includes(material.instanceId));
  game.dispatch(fuseAction);
  assert.equal(game.players[0].resources.shadows, 0);
  const deckBefore = game.players[0].deck.length;
  const playAction = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === garden.instanceId);
  assert.ok(playAction);
  game.dispatch(playAction);
  assert.equal(deckBefore - game.players[0].deck.length, 2);
  assert.equal(game.players[0].resources.shadows, 1, "only the resolved spell itself creates a Shadow");
});

test("Sinciro uses the number of differently named Fused Loot cards as X", () => {
  const game = readyGame();
  const sinciro = putInHand(game, 0, 0, CARDS.sinciro);
  putInHand(game, 0, 1, CARDS.lootA);
  putInHand(game, 0, 2, CARDS.lootB);
  const enemy = putEnemyFollower(game, { id: "sinciro-target", defense: 6 });
  const fuseAction = game.listLegalActions(0).find(item => item.type === "fuse" && item.targetInstanceId === sinciro.instanceId && item.materialInstanceIds.length === 2);
  assert.ok(fuseAction);
  game.dispatch(fuseAction);
  const playAction = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === sinciro.instanceId);
  game.dispatch(playAction);
  assert.equal(game.players[1].hp, 18);
  assert.equal(enemy.defense, 4);
});
