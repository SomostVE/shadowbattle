import test from "node:test";
import assert from "node:assert/strict";
import { getEffectCommandLog } from "../src/core/effect-commands.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { SVWB_EFFECT_COMMAND } from "../src/core/rulesets/svwb/v6/effect-commands.js";

function card(id, extra = {}) {
  return {
    id,
    name: id,
    class: "Neutral",
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 1,
    keywords: [],
    traits: [],
    text: "",
    ...extra
  };
}

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { cost: 9 }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "ordered-filtered-draw-pp",
    firstPlayer: 0,
    players: [
      { name: "Sword", className: "Swordcraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Neutral", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.maxPp = 10;
  game.players[0].resources.pp = 9;
  return game;
}

function replaceHandCard(game, definition) {
  const instance = game.players[0].hand[0];
  assert.ok(instance);
  instance.card = definition;
  instance.cardId = definition.id;
  game.registerCardDefinitions([definition]);
  return instance;
}

function deckInstance(instanceId, definition) {
  return {
    instanceId,
    owner: 0,
    cardId: definition.id,
    card: definition,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0
  };
}

test("Amelia-style Fanfare draws Swordcraft followers before recovering play points", () => {
  const game = readyGame();
  const amelia = replaceHandCard(game, card("amelia", {
    name: "Amelia, Silver Captain",
    class: "Swordcraft",
    type: "Follower",
    cost: 0,
    keywords: ["Fanfare"],
    text: "Fanfare: Draw 2 Swordcraft followers. Recover 3 play points."
  }));
  const swordOne = card("sword-one", { name: "Sword One", class: "Swordcraft", type: "Follower", cost: 2 });
  const neutral = card("neutral-stays", { name: "Neutral Stays", class: "Neutral", type: "Follower", cost: 2 });
  const swordTwo = card("sword-two", { name: "Sword Two", class: "Swordcraft", type: "Follower", cost: 5 });
  game.players[0].deck = [
    deckInstance("sword-one-instance", swordOne),
    deckInstance("neutral-stays-instance", neutral),
    deckInstance("sword-two-instance", swordTwo)
  ];

  const logCursor = getEffectCommandLog(game).length;
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === amelia.instanceId);
  assert.ok(action, "Amelia text should be structurally supported and playable");
  game.dispatch(action);

  assert.equal(game.players[0].hand.some(item => item.instanceId === "sword-one-instance"), true);
  assert.equal(game.players[0].hand.some(item => item.instanceId === "sword-two-instance"), true);
  assert.equal(game.players[0].deck.some(item => item.instanceId === "neutral-stays-instance"), true);
  assert.equal(game.players[0].resources.pp, 10, "PP recovery is capped by maximum PP");

  const commands = getEffectCommandLog(game).slice(logCursor).map(entry => entry.command.type);
  assert.deepEqual(commands, [
    SVWB_EFFECT_COMMAND.DRAW_FILTERED,
    SVWB_EFFECT_COMMAND.RECOVER_PLAY_POINTS
  ]);
});
