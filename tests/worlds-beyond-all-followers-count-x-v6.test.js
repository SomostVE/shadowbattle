import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { resolveWorldsBeyondAllFollowersCountX } from "../src/core/rulesets/svwb/all-followers-count-x.js";

const ROAR_OF_PROMINENCE = Object.freeze({
  id: 10542310,
  name: "Roar of Prominence",
  class: "Dragoncraft",
  type: "Spell",
  cost: 4,
  traits: [],
  keywords: [],
  text: "Deal X damage to all followers. X is the number of followers on the field."
});

function filler(id, { type = "Follower", attack = 1, defense = 1 } = {}) {
  return {
    id,
    name: String(id),
    class: "Dragoncraft",
    type,
    cost: 9,
    attack,
    defense,
    traits: [],
    keywords: [],
    text: ""
  };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => filler(`${prefix}-${index}`));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "all-followers-count-x-v6",
    firstPlayer: 0,
    cardCatalog: [ROAR_OF_PROMINENCE],
    players: [
      { name: "A", className: "Dragoncraft", deck: deck("A") },
      { name: "B", className: "Dragoncraft", deck: deck("B") }
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
  instance.costDelta = 0;
  game.registerCardDefinitions([definition]);
  return instance;
}

function boardCard(game, owner, id, { type = "Follower", attack = 1, defense = 6 } = {}) {
  const definition = filler(id, { type, attack, defense });
  const unit = {
    instanceId: `${owner}:manual:${id}`,
    owner,
    cardId: definition.id,
    card: definition,
    attack,
    defense,
    maxDefense: defense,
    evolved: false,
    superEvolved: false,
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  game.players[owner].board.push(unit);
  game.registerCardDefinitions([definition]);
  return unit;
}

function playRoar(game) {
  const source = replaceHandCard(game, ROAR_OF_PROMINENCE);
  const action = game.listLegalActions(0).find(item =>
    item.type === "play-card" && item.cardInstanceId === source.instanceId
  );
  assert.ok(action, "Roar of Prominence must expose a supported play action");
  game.dispatch(action);
  return source;
}

test("Roar of Prominence all-followers X is structurally supported", () => {
  const game = readyGame();
  const source = replaceHandCard(game, ROAR_OF_PROMINENCE);
  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);

  assert.equal(support.supported, true);
  assert.equal(support.residual, "");
  assert.match(support.text, /Deal damage to all followers equal to the number of followers on the field/i);
  assert.doesNotMatch(support.text, /\bX\b/);
});

test("Roar counts followers on both sides and excludes non-followers", () => {
  const game = readyGame();
  const allyA = boardCard(game, 0, "ally-a", { defense: 8 });
  const allyB = boardCard(game, 0, "ally-b", { defense: 8 });
  const enemy = boardCard(game, 1, "enemy", { defense: 8 });
  const amulet = boardCard(game, 1, "enemy-amulet", { type: "Amulet", defense: 0 });

  playRoar(game);

  assert.equal(game.findBoardCard(0, allyA.instanceId)?.defense, 5);
  assert.equal(game.findBoardCard(0, allyB.instanceId)?.defense, 5);
  assert.equal(game.findBoardCard(1, enemy.instanceId)?.defense, 5);
  assert.ok(game.findBoardCard(1, amulet.instanceId));

  const damageEvents = game.getEvents({ viewer: 0 }).filter(event =>
    event.type === BATTLE_EVENT.FOLLOWER_DAMAGE &&
    [allyA.instanceId, allyB.instanceId, enemy.instanceId].includes(event.payload?.target?.instanceId)
  );
  assert.equal(damageEvents.length, 3);
  assert.deepEqual(damageEvents.map(event => event.payload.amount), [3, 3, 3]);
});

test("Roar snapshots the live total before resolving follower deaths", () => {
  const game = readyGame();
  const doomedAlly = boardCard(game, 0, "doomed-ally", { defense: 1 });
  const survivingAlly = boardCard(game, 0, "surviving-ally", { defense: 7 });
  const doomedEnemy = boardCard(game, 1, "doomed-enemy", { defense: 2 });
  const survivingEnemy = boardCard(game, 1, "surviving-enemy", { defense: 7 });

  playRoar(game);

  assert.equal(game.findBoardCard(0, doomedAlly.instanceId), null);
  assert.equal(game.findBoardCard(1, doomedEnemy.instanceId), null);
  assert.equal(game.findBoardCard(0, survivingAlly.instanceId)?.defense, 3);
  assert.equal(game.findBoardCard(1, survivingEnemy.instanceId)?.defense, 3);
  assert.equal(game.players[0].resources.shadows, 1);
  assert.equal(game.players[1].resources.shadows, 1);

  const damageEvents = game.getEvents({ viewer: 0 }).filter(event =>
    event.type === BATTLE_EVENT.FOLLOWER_DAMAGE &&
    [doomedAlly.instanceId, survivingAlly.instanceId, doomedEnemy.instanceId, survivingEnemy.instanceId]
      .includes(event.payload?.target?.instanceId)
  );
  assert.equal(damageEvents.length, 4);
  assert.deepEqual(damageEvents.map(event => event.payload.amount), [4, 4, 4, 4]);
});

test("all-followers X preprocessing stays narrow to the migrated area-damage grammar", () => {
  const alliedOnly = "Deal X damage to all enemy followers. X is the number of followers on the field.";
  const otherDefinition = "Deal X damage to all followers. X is the number of allied followers on the field.";

  assert.equal(resolveWorldsBeyondAllFollowersCountX(alliedOnly), alliedOnly);
  assert.equal(resolveWorldsBeyondAllFollowersCountX(otherDefinition), otherDefinition);
});
