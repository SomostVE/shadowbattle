import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

const CARDS = Object.freeze({
  doomwright: {
    id: 10172320,
    name: "Doomwright Resurgence",
    class: "Portalcraft",
    type: "Spell",
    cost: 5,
    traits: [],
    keywords: [],
    text: "Select 2 Artifact followers in your hand that cost 5 or less, summon an exact copy of each, and give the exact copies \"At the end of your opponent's turn, destroy this card.\""
  },
  ralmia: {
    id: 10174130,
    name: "Ralmia, Sonic Boom",
    class: "Portalcraft",
    type: "Follower",
    cost: 4,
    attack: 3,
    defense: 4,
    traits: ["Artifact"],
    keywords: [],
    text: "Fanfare: Select 3 Artifact followers in your hand that cost 5 or less and summon an exact copy of each.\n\nSuper-Evolve: Give all allied Artifact followers on the field +1/+1."
  },
  artifactA: { id: 8101, name: "Artifact A", class: "Portalcraft", type: "Follower", cost: 4, attack: 2, defense: 3, traits: ["Artifact"], keywords: ["Rush"], text: "Rush" },
  artifactB: { id: 8102, name: "Artifact B", class: "Portalcraft", type: "Follower", cost: 5, attack: 4, defense: 5, traits: ["Artifact"], keywords: [], text: "" },
  artifactC: { id: 8103, name: "Artifact C", class: "Portalcraft", type: "Follower", cost: 6, attack: 6, defense: 6, traits: ["Artifact"], keywords: [], text: "" },
  plain: { id: 8104, name: "Plain Follower", class: "Portalcraft", type: "Follower", cost: 1, attack: 1, defense: 1, traits: [], keywords: [], text: "" }
});

const CATALOG = Object.freeze(Object.values(CARDS));

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    traits: [],
    keywords: [],
    text: ""
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "artifact-hand-copy-v6",
    firstPlayer: 0,
    cardCatalog: CATALOG,
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  game.players[1].resources.pp = 10;
  game.players[1].resources.maxPp = 10;
  return game;
}

function putInHand(game, slot, card, overrides = {}) {
  const instance = game.players[0].hand[slot];
  instance.card = card;
  instance.cardId = card.id;
  instance.costDelta = Number(overrides.costDelta ?? 0);
  instance.attackBonus = Number(overrides.attackBonus ?? 0);
  instance.defenseBonus = Number(overrides.defenseBonus ?? 0);
  instance.spellboost = Number(overrides.spellboost ?? 0);
  instance.grantedKeywords = [...(overrides.grantedKeywords ?? [])];
  return instance;
}

function playActions(game, source) {
  return game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
}

test("Doomwright requires exactly two legal Artifact followers before it is playable", () => {
  const game = readyGame();
  const source = putInHand(game, 0, CARDS.doomwright);
  putInHand(game, 1, CARDS.artifactA);
  putInHand(game, 2, CARDS.plain);
  putInHand(game, 3, CARDS.artifactC);
  assert.equal(playActions(game, source).length, 0);

  const discounted = game.players[0].hand[3];
  discounted.costDelta = -1;
  const actions = playActions(game, source);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].handCopySelectionKind, "artifact-hand-exact-copy");
  assert.deepEqual(new Set(actions[0].handCopyInstanceIds), new Set([game.players[0].hand[1].instanceId, discounted.instanceId]));
});

test("Doomwright validates the full selection before paying PP or moving the spell", () => {
  const game = readyGame();
  const source = putInHand(game, 0, CARDS.doomwright);
  const a = putInHand(game, 1, CARDS.artifactA);
  putInHand(game, 2, CARDS.artifactB);
  const legal = playActions(game, source)[0];
  assert.ok(legal);
  const ppBefore = game.players[0].resources.pp;
  const handBefore = game.players[0].hand.map(item => item.instanceId);

  assert.throws(() => game.dispatch({ ...legal, handCopyInstanceIds: [a.instanceId] }), /requires 2 Artifact hand selections/i);
  assert.equal(game.players[0].resources.pp, ppBefore);
  assert.deepEqual(game.players[0].hand.map(item => item.instanceId), handBefore);
});

test("Doomwright summons exact state copies and destroys them only at the end of the opponent turn", () => {
  const game = readyGame();
  const source = putInHand(game, 0, CARDS.doomwright);
  const a = putInHand(game, 1, CARDS.artifactA, { attackBonus: 2, defenseBonus: 1 });
  const b = putInHand(game, 2, CARDS.artifactB);
  const action = playActions(game, source).find(item => new Set(item.handCopyInstanceIds).has(a.instanceId) && new Set(item.handCopyInstanceIds).has(b.instanceId));
  assert.ok(action);

  game.dispatch(action);
  assert.equal(game.players[0].hand.some(item => item.instanceId === a.instanceId), true, "selected originals stay in hand");
  assert.equal(game.players[0].hand.some(item => item.instanceId === b.instanceId), true, "selected originals stay in hand");
  assert.equal(game.players[0].board.length, 2);
  const copiedA = game.players[0].board.find(unit => unit.card.name === "Artifact A");
  assert.ok(copiedA);
  assert.notEqual(copiedA.instanceId, a.instanceId);
  assert.equal(copiedA.attack, 4);
  assert.equal(copiedA.defense, 4);
  assert.equal(copiedA.canAttackFollowers, true, "copied Rush remains active");
  assert.equal(copiedA.destroyAtOpponentTurnEnd, true);

  const relevant = game.getEvents({ viewer: 0 }).filter(event => [BATTLE_EVENT.CARD_PLAY, BATTLE_EVENT.SPELL_CAST, BATTLE_EVENT.ABILITY_TRIGGER, BATTLE_EVENT.FOLLOWER_ENTER].includes(event.type));
  assert.deepEqual(relevant.slice(-5).map(event => event.type), [
    BATTLE_EVENT.CARD_PLAY,
    BATTLE_EVENT.SPELL_CAST,
    BATTLE_EVENT.ABILITY_TRIGGER,
    BATTLE_EVENT.FOLLOWER_ENTER,
    BATTLE_EVENT.FOLLOWER_ENTER
  ]);

  game.endTurn(0);
  assert.equal(game.players[0].board.length, 2, "copies survive the controller's own turn end");
  game.endTurn(1);
  assert.equal(game.players[0].board.length, 0, "copies self-destruct at the end of the opponent turn");
  assert.equal(game.players[0].resources.shadows, 3, "the spell and both destroyed copies create Shadows exactly once");
});

test("Ralmia selects as many legal Artifacts as available up to three", () => {
  const game = readyGame();
  const source = putInHand(game, 0, CARDS.ralmia);
  const a = putInHand(game, 1, CARDS.artifactA);
  const b = putInHand(game, 2, CARDS.artifactB);
  putInHand(game, 3, CARDS.plain);
  const actions = playActions(game, source);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].handCopySelectionCount, 2);
  assert.deepEqual(new Set(actions[0].handCopyInstanceIds), new Set([a.instanceId, b.instanceId]));

  game.dispatch(actions[0]);
  assert.equal(game.players[0].board.length, 3, "Ralmia enters first, then both exact copies are summoned");
  assert.equal(game.players[0].board.filter(unit => unit.card.name === "Ralmia, Sonic Boom").length, 1);
  assert.equal(game.players[0].hand.some(item => item.instanceId === a.instanceId), true);
  assert.equal(game.players[0].hand.some(item => item.instanceId === b.instanceId), true);
});

test("Ralmia remains playable with no legal Artifact selection", () => {
  const game = readyGame();
  const source = putInHand(game, 0, CARDS.ralmia);
  putInHand(game, 1, CARDS.plain);
  putInHand(game, 2, CARDS.artifactC);
  const actions = playActions(game, source);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0].handCopyInstanceIds, []);
  game.dispatch(actions[0]);
  assert.equal(game.players[0].board.length, 1);
  assert.equal(game.players[0].board[0].card.name, "Ralmia, Sonic Boom");
});

test("Battle Lab exposes explicit multi-card copy selection instead of taking the first legal action", () => {
  const source = fs.readFileSync(new URL("../src/test/multi-selection-lab.js", import.meta.url), "utf8");
  assert.match(source, /handCopyInstanceIds/);
  assert.match(source, /toggleHandCopyCandidate/);
  assert.match(source, /prioritizeSelectedHandCopy/);
  assert.match(source, /Choose Artifact followers in your hand to summon exact copies/);
});
