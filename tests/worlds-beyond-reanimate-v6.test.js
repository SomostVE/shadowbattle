import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  getWorldsBeyondTriggerSupport,
  resolveWorldsBeyondTrigger
} from "../src/core/rulesets/svwb/effect-resolver.js";
import {
  compileWorldsBeyondReanimateCommands,
  createWorldsBeyondReanimateCommand,
  resolveWorldsBeyondReanimateCommand,
  SVWB_REANIMATE_EFFECT_COMMAND
} from "../src/core/rulesets/svwb/v6/reanimate-command.js";

function card(id, {
  name = String(id),
  className = "Abysscraft",
  type = "Follower",
  cost = 1,
  attack = 1,
  defense = 1,
  text = "",
  traits = [],
  keywords = []
} = {}) {
  return { id, name, class: className, type, cost, attack, defense, text, traits, keywords };
}

const LOW_SHADE = card("low-shade", { name: "Low Shade", cost: 1 });
const MID_SHADE = card("mid-shade", { name: "Mid Shade", cost: 2, attack: 2, defense: 2 });
const MID_WRAITH = card("mid-wraith", { name: "Mid Wraith", cost: 2, attack: 2, defense: 2 });
const TALL_SHADE = card("tall-shade", { name: "Tall Shade", cost: 4, attack: 4, defense: 4 });

const GHOST_JUGGLER = card(10151140, {
  name: "Ghost Juggler",
  cost: 5,
  attack: 5,
  defense: 5,
  text: "Fanfare: Reanimate (4)."
});

const CHARON = card(10254120, {
  name: "Charon, Stygian Oarswoman",
  cost: 4,
  attack: 4,
  defense: 4,
  text: "Fanfare: Reanimate (2) and Reanimate (1).\n\nWhenever an allied Departed follower enters the field, give it Ward."
});

const NIGHT_SONG = card("night-song-source", {
  name: "Night Song Source",
  cost: 3,
  attack: 3,
  defense: 3,
  text: "Fanfare: Select an enemy follower on the field and destroy it. Reanimate (2)."
});

const FEDIEL_STYLE = card("fediel-style", {
  name: "Fediel Style",
  cost: 6,
  attack: 6,
  defense: 5,
  text: "Fanfare: Necromancy (6) - Reanimate (2), Reanimate (1), and evolve them."
});

const ISTYNDET_STYLE = card("istyndet-style", {
  name: "Istyndet Style",
  cost: 3,
  attack: 3,
  defense: 3,
  text: "Fanfare: Do this 3 times: \"Reanimate (2).\" Deal 2 damage to all enemy followers."
});

const CARD_CATALOG = [
  LOW_SHADE,
  MID_SHADE,
  MID_WRAITH,
  TALL_SHADE,
  GHOST_JUGGLER,
  CHARON,
  NIGHT_SONG,
  FEDIEL_STYLE,
  ISTYNDET_STYLE
];

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, {
    name: `${prefix} ${index}`,
    className: "Neutral",
    cost: 9
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "reanimate-v6",
    firstPlayer: 0,
    cardCatalog: CARD_CATALOG,
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

function boardFollower(game, owner, definition, suffix = "board") {
  const instance = {
    instanceId: `${owner}:${definition.id}:${suffix}:${game.eventSequence}`,
    owner,
    cardId: definition.id,
    card: definition,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0,
    attack: Number(definition.attack ?? 0),
    defense: Number(definition.defense ?? 0),
    maxDefense: Number(definition.defense ?? 0),
    evolved: false,
    superEvolved: false,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[owner].board.push(instance);
  return instance;
}

function destroyForHistory(game, definition, suffix = "history") {
  const instance = boardFollower(game, 0, definition, suffix);
  game.destroyFollower(0, instance.instanceId, { actor: 1, reason: "test-destruction" });
  return instance;
}

function playActionFor(game, source) {
  return game.listLegalActions(0).find(action => action.type === "play-card" && action.cardInstanceId === source.instanceId);
}

test("Reanimate compiler preserves every printed value in order", () => {
  const commands = compileWorldsBeyondReanimateCommands("Reanimate (4) and Reanimate (2).", {
    playerIndex: 0,
    source: { instanceId: "source", cardId: "source", card: { id: "source", name: "Source" } }
  });

  assert.deepEqual(commands.map(command => command.type), [SVWB_REANIMATE_EFFECT_COMMAND, SVWB_REANIMATE_EFFECT_COMMAND]);
  assert.deepEqual(commands.map(command => command.payload.maxCost), [4, 2]);
});

test("Reanimate uses the highest eligible base cost, summons a fresh Departed copy and preserves history", () => {
  const game = readyGame();
  destroyForHistory(game, LOW_SHADE, "low");
  const destroyedTall = destroyForHistory(game, TALL_SHADE, "tall");
  const cemeteryBefore = game.players[0].cemetery.length;
  const historyBefore = game.events.filter(event => event.type === BATTLE_EVENT.FOLLOWER_DESTROYED && event.payload?.owner === 0).length;

  const result = resolveWorldsBeyondReanimateCommand(game, createWorldsBeyondReanimateCommand(0, 4));

  assert.equal(result.applied, true);
  assert.equal(result.cardName, "Tall Shade");
  assert.equal(result.baseCost, 4);
  const summoned = game.players[0].board.at(-1);
  assert.equal(summoned.cardId, TALL_SHADE.id);
  assert.notEqual(summoned.instanceId, destroyedTall.instanceId);
  assert.ok(summoned.card.traits.includes("Departed"));
  assert.equal(game.players[0].cemetery.length, cemeteryBefore, "Reanimate summons a copy instead of removing the destroyed card");
  assert.equal(game.events.filter(event => event.type === BATTLE_EVENT.FOLLOWER_DESTROYED && event.payload?.owner === 0).length, historyBefore);
  assert.equal(game.events.at(-1).type, BATTLE_EVENT.FOLLOWER_ENTER);
  assert.equal(game.events.at(-1).payload.reanimated, true);
});

test("Reanimate ignores followers merely burned or otherwise present in cemetery", () => {
  const game = readyGame();
  destroyForHistory(game, LOW_SHADE, "destroyed-low");
  const burned = {
    instanceId: "0:tall-burned",
    owner: 0,
    cardId: TALL_SHADE.id,
    card: TALL_SHADE
  };
  game.players[0].cemetery.push(burned);
  game.emit(BATTLE_EVENT.CARD_BURNED, {
    actor: 0,
    payload: { card: game.cardView(burned), reason: "test-burn" }
  });

  const result = resolveWorldsBeyondReanimateCommand(game, createWorldsBeyondReanimateCommand(0, 4));

  assert.equal(result.cardName, "Low Shade");
  assert.equal(result.baseCost, 1);
  assert.equal(game.players[0].board.at(-1).cardId, LOW_SHADE.id);
});

test("equal-cost Reanimate candidates are weighted by destruction occurrences", () => {
  const game = readyGame();
  destroyForHistory(game, MID_SHADE, "mid-a-1");
  destroyForHistory(game, MID_SHADE, "mid-a-2");
  destroyForHistory(game, MID_WRAITH, "mid-b-1");
  game.rng = () => 0.8;

  const result = resolveWorldsBeyondReanimateCommand(game, createWorldsBeyondReanimateCommand(0, 2));

  assert.equal(result.eligible, 3, "each destruction occurrence remains a separate lottery entry");
  assert.equal(result.cardName, "Mid Wraith");
  assert.equal(game.players[0].board.at(-1).cardId, MID_WRAITH.id);
});

test("chained Reanimate resolves in order and later summons respect board capacity", () => {
  const game = readyGame();
  destroyForHistory(game, MID_SHADE, "mid");
  destroyForHistory(game, LOW_SHADE, "low");
  boardFollower(game, 0, card("ally-1", { className: "Neutral" }), "ally-1");
  boardFollower(game, 0, card("ally-2", { className: "Neutral" }), "ally-2");
  boardFollower(game, 0, card("ally-3", { className: "Neutral" }), "ally-3");
  const source = replaceHandCard(game, CHARON);

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  const action = playActionFor(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].board.length, 5);
  assert.equal(game.players[0].board.filter(item => item.cardId === MID_SHADE.id).length, 1);
  assert.equal(game.players[0].board.filter(item => item.cardId === LOW_SHADE.id).length, 0, "second Reanimate cannot overfill the board");
});

test("targeted destruction resolves before the following Reanimate command", () => {
  const game = readyGame();
  destroyForHistory(game, LOW_SHADE, "ally-history");
  const source = replaceHandCard(game, NIGHT_SONG);
  const enemy = boardFollower(game, 1, card("enemy-target", { className: "Swordcraft", defense: 4 }), "target");

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId && item.targetInstanceId === enemy.instanceId);
  assert.ok(action);
  game.dispatch(action);

  const events = game.getEvents({ viewer: 0, revealHands: true });
  const targetDestroyedIndex = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_DESTROYED && event.payload?.card?.instanceId === enemy.instanceId);
  const reanimateEnterIndex = events.findIndex(event => event.type === BATTLE_EVENT.FOLLOWER_ENTER && event.payload?.reanimated === true);
  assert.ok(targetDestroyedIndex >= 0);
  assert.ok(reanimateEnterIndex > targetDestroyedIndex);
  assert.ok(game.players[0].board.some(item => item.cardId === LOW_SHADE.id));
});

test("Reanimate followed by an unsupported evolve-them clause remains atomic", () => {
  const game = readyGame();
  destroyForHistory(game, MID_SHADE, "fediel-history");
  const source = replaceHandCard(game, FEDIEL_STYLE);
  game.players[0].resources.shadows = 6;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, false);
  assert.match(support.residual, /evolve them/i);

  const beforeBoard = game.players[0].board.length;
  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source });
  assert.equal(result.unresolved, true);
  assert.equal(game.players[0].board.length, beforeBoard);
  assert.equal(game.players[0].resources.shadows, 6, "blocked Necromancy is not consumed");
});

test("repeated Reanimate commands resolve before the following area damage", () => {
  const game = readyGame();
  destroyForHistory(game, MID_SHADE, "repeat-history");
  const source = replaceHandCard(game, ISTYNDET_STYLE);
  const enemy = boardFollower(game, 1, card("repeat-enemy", { className: "Swordcraft", defense: 6 }), "repeat-target");

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  const action = playActionFor(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[0].board.filter(item => item.cardId === MID_SHADE.id).length, 3);
  assert.equal(game.findBoardCard(1, enemy.instanceId)?.defense, 4);
  const events = game.getEvents({ viewer: 0, revealHands: true });
  const reanimateEntries = events.filter(event => event.type === BATTLE_EVENT.FOLLOWER_ENTER && event.payload?.reanimated === true);
  const damageEvent = events.find(event => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE && event.payload?.target?.instanceId === enemy.instanceId);
  assert.equal(reanimateEntries.length, 3);
  assert.ok(damageEvent);
  assert.ok(reanimateEntries.every(event => event.sequence < damageEvent.sequence));
});
