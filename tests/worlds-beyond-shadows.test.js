import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { banishBoardCard, returnBoardCardToHand } from "../src/core/zone-actions.js";
import { destroyWorldsBeyondFollower } from "../src/core/rulesets/svwb/effect-resolver.js";

function card(id, extra = {}) {
  return { id, name: id, type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], traits: [], ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
}

function startedGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "shadows-test",
    firstPlayer: 0,
    players: [
      { name: "Human", deck: deck("A") },
      { name: "CPU", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function boardInstance(owner, source, suffix = "manual") {
  return {
    instanceId: `${owner}:${suffix}:${source.id}`,
    owner,
    cardId: source.id,
    card: source,
    attack: Number(source.attack ?? 0),
    defense: Number(source.defense ?? 0),
    maxDefense: Number(source.defense ?? 0),
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false,
    countdown: null
  };
}

function fillHand(game, playerIndex) {
  const player = game.players[playerIndex];
  while (player.hand.length < game.ruleset.maxHandSize) {
    const item = player.deck.shift();
    assert.ok(item, "test deck should have enough cards to fill the hand");
    player.hand.push(item);
  }
}

test("a card burned by a full hand enters cemetery and creates exactly one Shadow", () => {
  const game = startedGame();
  fillHand(game, 0);
  const cemeteryBefore = game.players[0].cemetery.length;
  const deckBefore = game.players[0].deck.length;

  const drawn = game.draw(0, 1, { reason: "shadow-overflow-test" });

  assert.equal(drawn.length, 0);
  assert.equal(game.players[0].deck.length, deckBefore - 1);
  assert.equal(game.players[0].cemetery.length, cemeteryBefore + 1);
  assert.equal(game.players[0].resources.shadows, 1);
  assert.equal(game.getEvents({ viewer: 0 }).filter(event => event.type === BATTLE_EVENT.CARD_BURNED).length, 1);
});

test("a normal bounce returns to hand without creating a Shadow", () => {
  const game = startedGame();
  const source = card("bounce-target");
  const unit = boardInstance(1, source);
  game.players[1].board.push(unit);

  const returned = returnBoardCardToHand(game, 1, unit.instanceId, { actor: 0, reason: "test-bounce" });

  assert.ok(returned);
  assert.ok(game.players[1].hand.some(item => item.instanceId === unit.instanceId));
  assert.equal(game.players[1].resources.shadows, 0);
});

test("a bounce into a full hand enters cemetery and creates exactly one Shadow for the owner", () => {
  const game = startedGame();
  fillHand(game, 1);
  const source = card("overflow-bounce-target");
  const unit = boardInstance(1, source);
  game.players[1].board.push(unit);
  const cemeteryBefore = game.players[1].cemetery.length;

  const returned = returnBoardCardToHand(game, 1, unit.instanceId, { actor: 0, reason: "test-overflow-bounce" });

  assert.ok(returned);
  assert.equal(game.players[1].hand.length, game.ruleset.maxHandSize);
  assert.equal(game.players[1].cemetery.length, cemeteryBefore + 1);
  assert.ok(game.players[1].cemetery.some(item => item.instanceId === unit.instanceId));
  assert.equal(game.players[1].resources.shadows, 1);
  assert.equal(game.players[0].resources.shadows, 0, "the acting opponent must not receive the Shadow");
});

test("banish never creates a Shadow", () => {
  const game = startedGame();
  const source = card("banish-target");
  const unit = boardInstance(1, source);
  game.players[1].board.push(unit);

  const banished = banishBoardCard(game, 1, unit.instanceId, { actor: 0, reason: "test-banish" });

  assert.ok(banished);
  assert.ok(game.players[1].banished.some(item => item.instanceId === unit.instanceId));
  assert.equal(game.players[1].resources.shadows, 0);
});

test("destroying a follower creates exactly one Shadow without double counting", () => {
  const game = startedGame();
  const source = card("destroy-target");
  const unit = boardInstance(1, source);
  game.players[1].board.push(unit);

  const destroyed = destroyWorldsBeyondFollower(game, 1, unit.instanceId, { actor: 0, reason: "test-destroy" });

  assert.ok(destroyed);
  assert.ok(game.players[1].cemetery.some(item => item.instanceId === unit.instanceId));
  assert.equal(game.players[1].resources.shadows, 1);
});

test("a resolved spell creates exactly one Shadow", () => {
  const game = startedGame();
  const instance = game.players[0].hand[0];
  const spell = card("shadow-spell", { type: "Spell", cost: 0, attack: 0, defense: 0 });
  instance.card = spell;
  instance.cardId = spell.id;
  game.players[0].resources.pp = 10;

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === instance.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.ok(game.players[0].cemetery.some(item => item.instanceId === instance.instanceId));
  assert.equal(game.players[0].resources.shadows, 1);
});

test("Countdown amulet destruction creates exactly one Shadow", () => {
  const game = startedGame();
  const source = card("countdown-shadow", { type: "Amulet", attack: 0, defense: 0, text: "Countdown (1)" });
  const amulet = boardInstance(0, source);
  amulet.countdown = 1;
  game.players[0].board.push(amulet);

  game.endTurn(0);
  game.endTurn(1);

  assert.ok(game.players[0].cemetery.some(item => item.instanceId === amulet.instanceId));
  assert.equal(game.players[0].resources.shadows, 1);
});
