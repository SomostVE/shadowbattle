import test from "node:test";
import assert from "node:assert/strict";
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
  return { id, name, class: className, type, cost, attack, defense, text, keywords };
}

const GEAR_OF_REMEMBRANCE = card(90071220, {
  name: "Gear of Remembrance",
  className: "Portalcraft",
  type: "Spell",
  cost: 0,
  text: "Can't be played."
});

const STRIKER_ARTIFACT = card(90072110, {
  name: "Striker Artifact",
  className: "Portalcraft",
  type: "Follower",
  cost: 1,
  attack: 1,
  defense: 1,
  text: ""
});

const FAIRY = card("fairy-token", {
  name: "Fairy",
  className: "Forestcraft",
  type: "Follower",
  cost: 1,
  attack: 1,
  defense: 1,
  text: ""
});

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { cost: 9 }));
}

function readyGame(cardCatalog = []) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "gear-generation-v6",
    firstPlayer: 0,
    cardCatalog,
    players: [
      { name: "Human", className: "Portalcraft", deck: deck("A") },
      { name: "CPU", className: "Neutral", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function installHandCard(game, definition) {
  const instance = game.players[0].hand[0];
  instance.card = definition;
  instance.cardId = definition.id;
  return instance;
}

function boardFollower(game, owner, id, { attack = 2, defense = 6 } = {}) {
  const definition = card(id, { attack, defense });
  const unit = {
    instanceId: `${owner}:${id}`,
    owner,
    cardId: id,
    card: definition,
    attack,
    defense,
    maxDefense: defense,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[owner].board.push(unit);
  return unit;
}

function playActionsFor(game, instance) {
  return game.listLegalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === instance.instanceId);
}

function handCountByName(game, name) {
  return game.players[0].hand.filter(item => item.card?.name === name).length;
}

test("Stream of Life resolves targeted damage before terminal Gear generation", () => {
  const stream = card(10172310, {
    name: "Stream of Life",
    className: "Portalcraft",
    type: "Spell",
    cost: 2,
    text: "Select an enemy follower on the field and deal it 3 damage. Add a Gear of Remembrance to your hand."
  });
  const game = readyGame([stream, GEAR_OF_REMEMBRANCE]);
  const source = installHandCard(game, stream);
  const enemy = boardFollower(game, 1, "stream-target", { defense: 7 });

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);

  const actions = playActionsFor(game, source);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].targetInstanceId, enemy.instanceId);

  game.dispatch(actions[0]);

  assert.equal(game.findBoardCard(1, enemy.instanceId)?.defense, 4);
  assert.equal(handCountByName(game, "Gear of Remembrance"), 1);
  const gear = game.players[0].hand.find(item => item.card?.name === "Gear of Remembrance");
  assert.ok(gear);
  assert.equal(playActionsFor(game, gear).length, 0);
});

test("Engineblade Maven summons Striker Artifact and then generates Gear of Remembrance", () => {
  const maven = card(10271110, {
    name: "Engineblade Maven",
    className: "Portalcraft",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 2,
    text: "Fanfare: Summon a Striker Artifact. Add a Gear of Remembrance to your hand."
  });
  const game = readyGame([maven, STRIKER_ARTIFACT, GEAR_OF_REMEMBRANCE]);
  const source = installHandCard(game, maven);

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);

  const actions = playActionsFor(game, source);
  assert.equal(actions.length, 1);
  game.dispatch(actions[0]);

  assert.ok(game.players[0].board.some(item => item.card?.name === "Engineblade Maven"));
  assert.ok(game.players[0].board.some(item => item.card?.name === "Striker Artifact"));
  assert.equal(handCountByName(game, "Gear of Remembrance"), 1);
});

test("Can't be played is passive support metadata while Gear stays strictly unplayable", () => {
  const game = readyGame([GEAR_OF_REMEMBRANCE]);
  const gear = installHandCard(game, GEAR_OF_REMEMBRANCE);

  const support = getWorldsBeyondTriggerSupport(gear, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.equal(support.text, "");
  assert.equal(playActionsFor(game, gear).length, 0);
});

test("standalone Add-to-hand still generates exactly one card", () => {
  const sourceCard = card("fairy-source", {
    name: "Fairy Source",
    className: "Forestcraft",
    type: "Spell",
    cost: 1,
    text: "Add a Fairy to your hand."
  });
  const game = readyGame([sourceCard, FAIRY]);
  const source = installHandCard(game, sourceCard);

  const actions = playActionsFor(game, source);
  assert.equal(actions.length, 1);
  game.dispatch(actions[0]);

  assert.equal(handCountByName(game, "Fairy"), 1);
});
