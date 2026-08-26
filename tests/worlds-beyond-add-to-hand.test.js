import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { getEffectCommandLog } from "../src/core/effect-commands.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { addWorldsBeyondGeneratedCard } from "../src/core/rulesets/svwb/generated-cards.js";

const SPIRIT_OF_WADATSUMI = Object.freeze({
  id: 10841130,
  name: "Spirit of Wadatsumi",
  class: "Dragoncraft",
  type: "Follower",
  cost: 0,
  attack: 1,
  defense: 1,
  keywords: ["Fanfare", "Evolve", "Majestic Megalorca"],
  text: "Fanfare: Add a Majestic Megalorca to your hand.\n\nEvolve: Gain Crest: Spirit of Wadatsumi."
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

const COMPOUND_UNSUPPORTED = Object.freeze({
  id: "compound-add-unsupported",
  name: "Compound Add Unsupported",
  class: "Dragoncraft",
  type: "Follower",
  cost: 0,
  attack: 1,
  defense: 1,
  keywords: ["Fanfare"],
  text: "Fanfare: Deal 1 damage to the enemy leader. Add a Majestic Megalorca to your hand."
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
    seed: "named-add-to-hand",
    firstPlayer: 0,
    cardCatalog: [SPIRIT_OF_WADATSUMI, MAJESTIC_MEGALORCA, COMPOUND_UNSUPPORTED],
    players: [
      { name: "Dragon", className: "Dragoncraft", deck: fillerDeck("A") },
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

function replaceHandCard(game, card) {
  const instance = game.players[0].hand[0];
  instance.card = card;
  instance.cardId = card.id;
  return instance;
}

test("Spirit of Wadatsumi Fanfare generates a real Majestic Megalorca from the local catalog", () => {
  const game = readyGame();
  const spirit = replaceHandCard(game, SPIRIT_OF_WADATSUMI);
  const support = getWorldsBeyondTriggerSupport(spirit, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.equal(support.residual, "");
  const handBefore = game.players[0].hand.length;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: spirit.instanceId });

  assert.equal(game.players[0].hand.length, handBefore, "played Spirit is replaced by generated Megalorca");
  const generated = game.players[0].hand.find(item => item.card?.id === MAJESTIC_MEGALORCA.id);
  assert.ok(generated);
  assert.notEqual(generated.instanceId, spirit.instanceId);
  assert.equal(generated.card, MAJESTIC_MEGALORCA);
  const command = getEffectCommandLog(game).find(entry => entry.command.type === "svwb:add-to-hand");
  assert.equal(command?.command.payload.cardName, "Majestic Megalorca");
  const trigger = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.instanceId === spirit.instanceId);
  assert.equal(trigger?.payload.resolved, true);
});

test("generated-card helper creates unique instances even without an intervening public event", () => {
  const game = readyGame();
  const first = addWorldsBeyondGeneratedCard(game, 0, MAJESTIC_MEGALORCA, { reason: "test-generation" });
  const second = addWorldsBeyondGeneratedCard(game, 0, MAJESTIC_MEGALORCA, { reason: "test-generation" });
  assert.equal(first.added, true);
  assert.equal(second.added, true);
  assert.notEqual(first.instance.instanceId, second.instance.instanceId);
});

test("a generated card entering a full hand is burned and creates exactly one Shadow", () => {
  const game = readyGame();
  const player = game.players[0];
  while (player.hand.length < game.ruleset.maxHandSize) {
    player.hand.push({
      instanceId: `full-hand-${player.hand.length}`,
      owner: 0,
      cardId: `full-hand-${player.hand.length}`,
      card: { id: `full-hand-${player.hand.length}`, name: `Full ${player.hand.length}`, type: "Follower", cost: 1, attack: 1, defense: 1, keywords: [] }
    });
  }
  const shadowsBefore = player.resources.shadows;
  const cemeteryBefore = player.cemetery.length;

  const result = addWorldsBeyondGeneratedCard(game, 0, MAJESTIC_MEGALORCA, { reason: "test-full-hand" });

  assert.equal(result.added, false);
  assert.equal(result.burned, true);
  assert.equal(player.hand.length, game.ruleset.maxHandSize);
  assert.equal(player.cemetery.length, cemeteryBefore + 1);
  assert.equal(player.resources.shadows, shadowsBefore + 1);
  const burned = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.CARD_BURNED && event.payload.reason === "test-full-hand");
  assert.equal(burned?.payload.card?.cardId, MAJESTIC_MEGALORCA.id);
  assert.equal(game.getEvents({ viewer: 1 }).some(event => event.type === BATTLE_EVENT.CARD_BURNED && event.payload.reason === "test-full-hand"), false);
});

test("compound Add-to-hand text remains atomic and unsupported until ordered resolution is migrated", () => {
  const game = readyGame();
  const source = replaceHandCard(game, COMPOUND_UNSUPPORTED);
  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, false);
  assert.match(support.residual, /Add a Majestic Megalorca to your hand/i);
  const hpBefore = game.players[1].hp;
  const handBefore = game.players[0].hand.length;

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: source.instanceId });

  assert.equal(game.players[1].hp, hpBefore, "supported damage prefix must not resolve by itself");
  assert.equal(game.players[0].hand.length, handBefore - 1, "unsupported generated card must not be added");
  const trigger = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload.card?.instanceId === source.instanceId);
  assert.equal(trigger?.payload.resolved, false);
  assert.equal(trigger?.payload.supportBlocked, true);
});
