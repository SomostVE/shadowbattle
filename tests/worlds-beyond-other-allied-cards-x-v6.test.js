import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";
import {
  getWorldsBeyondTriggerSupport,
  resolveWorldsBeyondTrigger
} from "../src/core/rulesets/svwb/effect-resolver.js";

const DEVOTEE_TEXT = "Fanfare: Give this follower +X/+X. X is the number of other allied cards on the field. Destroy all other allied cards on the field.\n\nWard.";
const CONGREGANT_TEXT = "Fanfare: Destroy X random enemy followers. X is the number of other allied cards on the field. Destroy all other allied cards on the field.";
const AXIA_TEXT = "Super-Evolve: Deal X damage to the enemy leader. X is the number of other allied cards on the field. Destroy all other allied cards on the field.";

function card(id, {
  name = String(id),
  className = "Portalcraft",
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

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "other-allied-cards-x-v6",
    firstPlayer: 0,
    players: [
      { name: "A", className: "Portalcraft", deck: fillerDeck("A") },
      { name: "B", className: "Portalcraft", deck: fillerDeck("B") }
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

function devoteeCard() {
  return card(10371110, {
    name: "Devotee of Destruction",
    attack: 2,
    defense: 2,
    keywords: ["Fanfare", "Ward"],
    text: DEVOTEE_TEXT
  });
}

function congregantCard() {
  return card(10373110, {
    name: "Congregant of Destruction",
    attack: 2,
    defense: 2,
    keywords: ["Fanfare"],
    text: CONGREGANT_TEXT
  });
}

function axiaCard() {
  return card(10374110, {
    name: "Axia, Heir to Destruction",
    attack: 3,
    defense: 3,
    keywords: ["Super-Evolve"],
    text: AXIA_TEXT
  });
}

test("other-allied-cards X counts followers and amulets but excludes the exact source", () => {
  const sourceCard = devoteeCard();
  const source = unit("source", sourceCard);
  const ally = unit("ally", card("ally"));
  const amulet = unit("amulet", card("amulet", { type: "Amulet" }));
  const player = { board: [source, ally, amulet], hand: [], resources: {} };

  const result = evaluateWorldsBeyondClassCondition(
    "Give this follower +X/+X. X is the number of other allied cards on the field. Destroy all other allied cards on the field.",
    player,
    sourceCard,
    { source }
  );

  assert.equal(result.text, "Give this follower +2/+2. Destroy all other allied cards on the field.");
  assert.equal(result.mechanic, "stateCount");
  assert.ok(result.notes.includes("X = other allied cards 2"));
});

test("Devotee snapshots X before destroying every other allied follower and amulet", () => {
  const game = readyGame();
  const source = replaceHandCard(game, devoteeCard());
  game.players[0].board.push(
    unit("ally", card("ally", { attack: 2, defense: 2 })),
    unit("amulet", card("amulet", { type: "Amulet" }))
  );

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.match(support.text, /Give this follower \+2\/\+2/i);

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  const played = game.findBoardCard(0, source.instanceId);
  assert.ok(played);
  assert.equal(played.attack, 4);
  assert.equal(played.defense, 4);
  assert.deepEqual(game.players[0].board.map(item => item.instanceId), [source.instanceId]);
  assert.equal(game.players[0].resources.shadows, 2);
});

test("mass allied destruction respects ability-destruction immunity without changing X", () => {
  const game = readyGame();
  const source = replaceHandCard(game, devoteeCard());
  const immune = unit("immune", card("immune", {
    name: "Immune Ally",
    attack: 1,
    defense: 1,
    text: "Can't be destroyed by abilities."
  }));
  const amulet = unit("amulet", card("amulet", { type: "Amulet" }));
  game.players[0].board.push(immune, amulet);

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  const played = game.findBoardCard(0, source.instanceId);
  assert.equal(played.attack, 4, "immune ally still counts toward the frozen X value");
  assert.ok(game.findBoardCard(0, immune.instanceId), "ability-immune ally must survive");
  assert.equal(game.findBoardCard(0, amulet.instanceId), null);
  assert.equal(game.players[0].resources.shadows, 1);
});

test("Congregant destroys X distinct enemy followers before sacrificing its other allied cards", () => {
  const game = readyGame();
  const source = replaceHandCard(game, congregantCard());
  game.players[0].board.push(
    unit("ally", card("ally")),
    unit("amulet", card("amulet", { type: "Amulet" }))
  );
  game.players[1].board.push(
    unit("enemy-a", card("enemy-a"), 1),
    unit("enemy-b", card("enemy-b"), 1)
  );

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.match(support.text, /Destroy 2 random enemy followers/i);

  const action = playAction(game, source);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.players[1].board.length, 0);
  assert.equal(game.players[1].resources.shadows, 2);
  assert.deepEqual(game.players[0].board.map(item => item.instanceId), [source.instanceId]);
  assert.equal(game.players[0].resources.shadows, 2);
});

test("Axia Super-Evolve deals frozen X damage before destroying its other allied cards", () => {
  const game = readyGame();
  const definition = axiaCard();
  const source = unit("axia", definition);
  game.players[0].board.push(
    source,
    unit("ally", card("ally")),
    unit("amulet", card("amulet", { type: "Amulet" }))
  );

  const support = getWorldsBeyondTriggerSupport(source, "super-evolve", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.match(support.text, /Deal 2 damage to the enemy leader/i);

  const result = resolveWorldsBeyondTrigger(game, {
    trigger: "super-evolve",
    playerIndex: 0,
    source
  });

  assert.equal(result.unresolved, false);
  assert.equal(game.players[1].hp, 18);
  assert.deepEqual(game.players[0].board.map(item => item.instanceId), [source.instanceId]);
  assert.equal(game.players[0].resources.shadows, 2);
});
