import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

const MARLONE_TEXT = "Fanfare: Destroy X random enemy followers. X is the number of enemy followers on the field minus the number of allied followers on the field.";

function card(id, {
  name = String(id),
  className = "Forestcraft",
  type = "Follower",
  cost = 0,
  attack = 1,
  defense = 1,
  text = "",
  keywords = []
} = {}) {
  return { id, name, class: className, type, cost, attack, defense, text, keywords, traits: [] };
}

function unit(instanceId, definition, owner = 0) {
  return {
    instanceId,
    owner,
    cardId: definition.id,
    card: definition,
    attack: Number(definition.attack ?? 0),
    defense: Number(definition.defense ?? 0),
    maxDefense: Number(definition.defense ?? 0),
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
}

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, {
    name: `${prefix} ${index}`,
    className: "Neutral",
    cost: 9
  }));
}

function marloneCard() {
  return card(10811110, {
    name: "Marlone, Scales of the Past",
    attack: 2,
    defense: 6,
    keywords: ["Fanfare"],
    text: MARLONE_TEXT
  });
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "marlone-board-difference-x-v6",
    firstPlayer: 0,
    players: [
      { name: "A", className: "Forestcraft", deck: fillerDeck("A") },
      { name: "B", className: "Forestcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, definition, index = 0) {
  const instance = game.players[0].hand[index];
  instance.card = definition;
  instance.cardId = definition.id;
  game.registerCardDefinitions([definition]);
  return instance;
}

function playAction(game, source) {
  return game.listLegalActions(0).find(action =>
    action.type === "play-card" && action.cardInstanceId === source.instanceId
  );
}

function addEnemyFollowers(game, count) {
  for (let index = 0; index < count; index += 1) {
    game.players[1].board.push(unit(`enemy-${index}`, card(`enemy-${index}`), 1));
  }
}

test("Marlone board-difference X is structurally supported without inventing an opponent snapshot", () => {
  const definition = marloneCard();
  const source = unit("marlone", definition);
  const support = getWorldsBeyondTriggerSupport(source, "play", null, {
    className: "Forestcraft",
    board: [],
    hand: [],
    resources: {}
  });

  assert.equal(support.supported, true);
  assert.equal(support.residual, "");
  assert.match(support.text, /X is the number of enemy followers/i);
});

test("Marlone follows the Codex 5-enemies ruling and counts itself as an allied follower", () => {
  const game = readyGame();
  const source = replaceHandCard(game, marloneCard());
  addEnemyFollowers(game, 5);

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.ok(game.findBoardCard(0, source.instanceId));
  assert.equal(game.players[1].board.length, 1, "5 enemy followers - Marlone itself = 4 destroyed");
  assert.equal(game.players[1].resources.shadows, 4);
});

test("Marlone counts only followers on both sides and freezes the live difference before destruction", () => {
  const game = readyGame();
  const source = replaceHandCard(game, marloneCard());
  game.players[0].board.push(
    unit("ally-a", card("ally-a")),
    unit("ally-amulet", card("ally-amulet", { type: "Amulet" }))
  );
  game.players[1].board.push(
    unit("enemy-a", card("enemy-a"), 1),
    unit("enemy-b", card("enemy-b"), 1),
    unit("enemy-c", card("enemy-c"), 1),
    unit("enemy-amulet", card("enemy-amulet", { type: "Amulet" }), 1)
  );

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[1].board.filter(item => item.card.type === "Follower").length, 2, "3 enemies - (Marlone + 1 ally) = 1 destroyed");
  assert.ok(game.findBoardCard(1, "enemy-amulet"), "amulets are excluded from X and cannot be selected");
  assert.equal(game.players[1].resources.shadows, 1);
});

test("Marlone clamps a negative follower difference to zero", () => {
  const game = readyGame();
  const source = replaceHandCard(game, marloneCard());
  game.players[0].board.push(
    unit("ally-a", card("ally-a")),
    unit("ally-b", card("ally-b"))
  );
  addEnemyFollowers(game, 2);

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[1].board.length, 2);
  assert.equal(game.players[1].resources.shadows, 0);
});
