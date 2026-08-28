import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { destroyWorldsBeyondAmulet } from "../src/core/rulesets/svwb/amulets.js";

const CARDS = Object.freeze({
  supplicant: {
    id: 10372110,
    name: "Supplicant of Destruction",
    class: "Portalcraft",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 2,
    traits: [],
    keywords: [],
    text: "Fanfare: Select another allied card on the field. If you selected one, destroy it and deal 2 damage to a random enemy follower.\n\nEvolve: Replicate the effects of this card's Fanfare ability."
  },
  wasteland: {
    id: 10372210,
    name: "Wasteland of Destruction",
    class: "Portalcraft",
    type: "Amulet",
    cost: 2,
    traits: [],
    keywords: [],
    text: "Fanfare: Select another allied card on the field. If you selected one, destroy it and draw 2 cards.\n\nLast Words: Draw a card."
  },
  lishenna: {
    id: 9997001,
    name: "Lishenna, Melody Manifest",
    class: "Portalcraft",
    type: "Follower",
    cost: 4,
    attack: 3,
    defense: 5,
    traits: [],
    keywords: [],
    text: "Can't be destroyed by abilities."
  },
  ally: { id: 9997002, name: "Allied Follower", class: "Portalcraft", type: "Follower", cost: 1, attack: 1, defense: 2, traits: [], keywords: [], text: "" },
  allyAmulet: { id: 9997003, name: "Allied Amulet", class: "Portalcraft", type: "Amulet", cost: 1, traits: [], keywords: [], text: "Last Words: Draw a card." },
  enemy: { id: 9997004, name: "Enemy Follower", class: "Neutral", type: "Follower", cost: 1, attack: 1, defense: 5, traits: [], keywords: [], text: "" }
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
    seed: "optional-allied-card-v6",
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

function putInHand(game, slot, card) {
  const instance = game.players[0].hand[slot];
  instance.card = card;
  instance.cardId = card.id;
  instance.costDelta = 0;
  instance.attackBonus = 0;
  instance.defenseBonus = 0;
  return instance;
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
    canAttackLeader: false,
    evolved: false,
    superEvolved: false
  };
  game.players[playerIndex].board.push(unit);
  return unit;
}

function sourcePlayActions(game, source) {
  return game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
}

test("Supplicant exposes a skip branch plus every other allied card as an optional target", () => {
  const game = readyGame();
  const source = putInHand(game, 0, CARDS.supplicant);
  const follower = putBoardCard(game, 0, CARDS.ally, "ally-follower");
  const amulet = putBoardCard(game, 0, CARDS.allyAmulet, "ally-amulet");
  const actions = sourcePlayActions(game, source);

  assert.equal(actions.length, 3);
  assert.equal(actions.filter(action => action.targetOptional).length, 3);
  assert.equal(actions.filter(action => !action.targetInstanceId).length, 1);
  assert.deepEqual(new Set(actions.filter(action => action.targetInstanceId).map(action => action.targetInstanceId)), new Set([follower.instanceId, amulet.instanceId]));
});

test("Supplicant skip branch plays normally without destroying or damaging anything", () => {
  const game = readyGame();
  const source = putInHand(game, 0, CARDS.supplicant);
  const ally = putBoardCard(game, 0, CARDS.ally, "skip-ally");
  const enemy = putBoardCard(game, 1, CARDS.enemy, "skip-enemy");
  const skip = sourcePlayActions(game, source).find(action => action.targetOptional && !action.targetInstanceId);
  assert.ok(skip);

  game.dispatch(skip);
  assert.ok(game.findBoardCard(0, ally.instanceId));
  assert.equal(game.findBoardCard(1, enemy.instanceId).defense, 5);
  const ability = game.getEvents({ viewer: 0 }).filter(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER).at(-1);
  assert.equal(ability.payload.targetSkipped, true);
});

test("Supplicant follow-up damage still resolves when selected Lishenna resists destruction", () => {
  const game = readyGame();
  const source = putInHand(game, 0, CARDS.supplicant);
  const lishenna = putBoardCard(game, 0, CARDS.lishenna, "lishenna");
  const enemy = putBoardCard(game, 1, CARDS.enemy, "immune-follow-up-enemy");
  const action = sourcePlayActions(game, source).find(item => item.targetInstanceId === lishenna.instanceId);
  assert.ok(action);

  game.dispatch(action);
  assert.ok(game.findBoardCard(0, lishenna.instanceId), "destruction-immune selected follower survives");
  assert.equal(game.findBoardCard(1, enemy.instanceId).defense, 3, "follow-up damage is gated by selection, not destruction success");
});

test("Wasteland destroys the selected allied card then draws two while skip draws none", () => {
  const selectedGame = readyGame();
  const selectedSource = putInHand(selectedGame, 0, CARDS.wasteland);
  const ally = putBoardCard(selectedGame, 0, CARDS.ally, "wasteland-target");
  const deckBefore = selectedGame.players[0].deck.length;
  const selected = sourcePlayActions(selectedGame, selectedSource).find(action => action.targetInstanceId === ally.instanceId);
  selectedGame.dispatch(selected);
  assert.equal(selectedGame.findBoardCard(0, ally.instanceId), null);
  assert.equal(deckBefore - selectedGame.players[0].deck.length, 2);

  const skipGame = readyGame();
  const skipSource = putInHand(skipGame, 0, CARDS.wasteland);
  putBoardCard(skipGame, 0, CARDS.ally, "wasteland-skip-target");
  const skipDeckBefore = skipGame.players[0].deck.length;
  const skip = sourcePlayActions(skipGame, skipSource).find(action => action.targetOptional && !action.targetInstanceId);
  skipGame.dispatch(skip);
  assert.equal(skipDeckBefore - skipGame.players[0].deck.length, 0);
});

test("Wasteland keeps its independent Last Words after optional Fanfare support", () => {
  const game = readyGame();
  const source = putInHand(game, 0, CARDS.wasteland);
  const skip = sourcePlayActions(game, source).find(action => action.targetOptional && !action.targetInstanceId);
  game.dispatch(skip);
  const wasteland = game.players[0].board.find(card => card.card.name === "Wasteland of Destruction");
  assert.ok(wasteland);
  const deckBefore = game.players[0].deck.length;
  destroyWorldsBeyondAmulet(game, 0, wasteland.instanceId, { actor: 0, reason: "test" });
  assert.equal(deckBefore - game.players[0].deck.length, 1);
});

test("Supplicant Evolve replicate-Fanfare exposes skip and other-allied-card branches but never itself", () => {
  const game = readyGame();
  const source = putBoardCard(game, 0, CARDS.supplicant, "evolve-supplicant");
  const ally = putBoardCard(game, 0, CARDS.ally, "evolve-ally");
  putBoardCard(game, 1, CARDS.enemy, "evolve-enemy");
  game.players[0].resources.evolutionAvailable = true;
  game.players[0].resources.evolutionPoints = 2;
  game.players[0].resources.superEvolutionAvailable = false;

  const actions = game.listLegalActions(0).filter(action => action.type === "evolve" && action.followerInstanceId === source.instanceId);
  assert.equal(actions.length, 2);
  assert.ok(actions.some(action => action.targetOptional && !action.targetInstanceId));
  assert.ok(actions.some(action => action.targetInstanceId === ally.instanceId));
  assert.equal(actions.some(action => action.targetInstanceId === source.instanceId), false);

  const targeted = actions.find(action => action.targetInstanceId === ally.instanceId);
  game.dispatch(targeted);
  assert.equal(game.findBoardCard(0, ally.instanceId), null);
  assert.equal(game.findBoardCard(1, "evolve-enemy").defense, 3);
  assert.equal(source.evolved, true);
});
