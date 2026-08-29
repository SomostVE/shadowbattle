import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

const EXELLA_TEXT = "Fanfare: Give this follower +X/+0. X is the number of other allied followers on the field. Deal 2 damage to your leader.\n\nStorm.";

function card(id, { name = String(id), className = "Neutral", type = "Follower", cost = 1, attack = 1, defense = 1, text = "", keywords = [] } = {}) {
  return { id, name, class: className, type, cost, attack, defense, text, keywords };
}

function unit(instanceId, sourceCard, owner = 0) {
  return {
    instanceId,
    owner,
    cardId: sourceCard.id,
    card: sourceCard,
    attack: Number(sourceCard.attack ?? 0),
    defense: Number(sourceCard.defense ?? 0),
    maxDefense: Number(sourceCard.defense ?? 0),
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
}

function fillerDeck(prefix, className = "Neutral") {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, {
    name: `${prefix} ${index}`,
    className,
    cost: 9
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "other-allied-followers-x-v6",
    firstPlayer: 0,
    players: [
      { className: "Abysscraft", deck: fillerDeck("A", "Abysscraft") },
      { deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, sourceCard, index = 0) {
  const instance = game.players[0].hand[index];
  instance.card = sourceCard;
  instance.cardId = sourceCard.id;
  instance.attackBonus = 0;
  instance.defenseBonus = 0;
  return instance;
}

function exellaCard() {
  return card(10253120, {
    name: "Exella, Nocturnal General",
    className: "Abysscraft",
    cost: 0,
    attack: 1,
    defense: 3,
    keywords: ["Fanfare", "Storm"],
    text: EXELLA_TEXT
  });
}

test("other-allied-followers X excludes the exact source instance only", () => {
  const sourceCard = exellaCard();
  const source = unit("source-exella", sourceCard);
  const otherCopy = unit("other-exella", exellaCard());
  const ally = unit("ally", card("ally"));
  const amulet = unit("amulet", card("amulet", { type: "Amulet" }));
  const player = { board: [source, otherCopy, ally, amulet], hand: [], resources: {} };

  const result = evaluateWorldsBeyondClassCondition(
    "Give this follower +X/+0. X is the number of other allied followers on the field. Deal 2 damage to your leader.",
    player,
    sourceCard,
    { source }
  );

  assert.equal(result.text, "Give this follower +2/+0. Deal 2 damage to your leader.");
  assert.equal(result.mechanic, "stateCount");
  assert.ok(result.notes.includes("X = other allied followers 2"));
});

test("play preview counts every existing follower while the source is still in hand", () => {
  const game = readyGame();
  const source = replaceHandCard(game, exellaCard());
  game.players[0].board.push(
    unit("other-exella", exellaCard()),
    unit("ally", card("ally"))
  );

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);

  assert.equal(support.supported, true);
  assert.match(support.text, /Give this follower \+2\/\+0/i);
  assert.doesNotMatch(support.text, /X is the number/i);
});

test("Exella resolves X from the other allied followers after entering the field", () => {
  const game = readyGame();
  const source = replaceHandCard(game, exellaCard());
  game.players[0].board.push(
    unit("other-exella", exellaCard()),
    unit("ally", card("ally"))
  );

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId);
  assert.ok(action);
  game.dispatch(action);

  const played = game.findBoardCard(0, source.instanceId);
  assert.ok(played);
  assert.equal(played.attack, 3);
  assert.equal(game.players[0].hp, 18);

  const trigger = game.events.findLast(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.card?.name === "Exella, Nocturnal General");
  assert.match(trigger?.payload?.text ?? "", /Give this follower \+2\/\+0/i);
  assert.doesNotMatch(trigger?.payload?.text ?? "", /X is the number/i);
  assert.ok(trigger?.payload?.conditionNotes?.includes("X = other allied followers 2"));
});

test("Exella with no other allied follower resolves X as zero", () => {
  const game = readyGame();
  const source = replaceHandCard(game, exellaCard());

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId);
  assert.ok(action);
  game.dispatch(action);

  const played = game.findBoardCard(0, source.instanceId);
  assert.ok(played);
  assert.equal(played.attack, 1);
  assert.equal(game.players[0].hp, 18);

  const trigger = game.events.findLast(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.card?.name === "Exella, Nocturnal General");
  assert.match(trigger?.payload?.text ?? "", /Give this follower \+0\/\+0/i);
  assert.ok(trigger?.payload?.conditionNotes?.includes("X = other allied followers 0"));
});
