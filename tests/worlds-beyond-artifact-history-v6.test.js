import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";
import { countWorldsBeyondDifferentlyNamedArtifactEntries } from "../src/core/rulesets/svwb/match-history.js";

const HISTORY_TEXT = "Deal X damage to all enemy followers. X is the number of differently named allied Artifact followers that have entered the field this match. Deal 1 damage to the enemy leader.";

function card(id, { name = String(id), className = "Portalcraft", type = "Follower", cost = 1, attack = 1, defense = 1, text = "", traits = [], keywords = [] } = {}) {
  return { id, name, class: className, type, cost, attack, defense, text, traits, keywords };
}

function fillerDeck(prefix, firstCard) {
  return [firstCard, ...Array.from({ length: 39 }, (_, index) => card(`${prefix}-${index}`, { name: `${prefix} ${index}`, className: "Portalcraft" }))];
}

function begin(sourceCard, catalog = []) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "artifact-history-v6",
    firstPlayer: 0,
    cardCatalog: catalog,
    players: [
      { name: "Human", className: "Portalcraft", deck: fillerDeck("A", sourceCard) },
      { name: "CPU", className: "Portalcraft", deck: fillerDeck("B", card("enemy-anchor", { name: "Enemy Anchor" })) }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function enterFollower(game, playerIndex, definition, suffix) {
  const player = game.getPlayer(playerIndex);
  const instance = {
    instanceId: `${playerIndex}:history:${suffix}`,
    owner: playerIndex,
    cardId: definition.id,
    card: definition,
    attack: Number(definition.attack ?? 0),
    defense: Number(definition.defense ?? 0),
    maxDefense: Number(definition.defense ?? 0),
    attacksRemaining: 0,
    canAttackFollowers: false,
    canAttackLeader: false
  };
  player.board.push(instance);
  game.emit(BATTLE_EVENT.FOLLOWER_ENTER, {
    actor: playerIndex,
    payload: { card: game.cardView(instance), position: player.board.length - 1, summoned: true }
  });
  return instance;
}

function forceSourceIntoHand(game, sourceCard) {
  const player = game.getPlayer(0);
  const instance = player.hand.find(item => item.cardId === sourceCard.id)
    ?? player.deck.find(item => item.cardId === sourceCard.id);
  assert.ok(instance, `missing ${sourceCard.id}`);
  player.hand = player.hand.filter(item => item !== instance);
  player.deck = player.deck.filter(item => item !== instance);
  player.hand.push(instance);
  return instance;
}

function forceEnemyFollower(game, id, defense) {
  const definition = card(id, { name: id, className: "Portalcraft", defense, attack: 2 });
  game.registerCardDefinitions([definition]);
  return enterFollower(game, 1, definition, id);
}

test("Artifact entry history counts differently named allied Artifact followers only once", () => {
  const source = card("history-source", { type: "Spell", text: HISTORY_TEXT });
  const analyzing = card("artifact-a", { name: "Analyzing Artifact", traits: ["Artifact"] });
  const ancient = card("artifact-b", { name: "Ancient Artifact", traits: ["Artifact"] });
  const ordinary = card("ordinary", { name: "Ordinary Follower" });
  const game = begin(source, [analyzing, ancient, ordinary]);

  enterFollower(game, 0, analyzing, "a1");
  enterFollower(game, 0, analyzing, "a2");
  enterFollower(game, 0, ancient, "b1");
  enterFollower(game, 0, ordinary, "n1");

  assert.deepEqual(game.getPlayer(0).resources.artifactFollowerNamesEntered, ["Analyzing Artifact", "Ancient Artifact"]);
  assert.equal(countWorldsBeyondDifferentlyNamedArtifactEntries(game.getPlayer(0)), 2);
  assert.equal(countWorldsBeyondDifferentlyNamedArtifactEntries(game.getPlayer(1)), 0);
});

test("Artifact history X compiles from the public match-entry summary", () => {
  const player = {
    className: "Portalcraft",
    hand: [],
    board: [],
    resources: { artifactFollowerNamesEntered: ["Analyzing Artifact", "Ancient Artifact", "Analyzing Artifact"] }
  };
  const result = evaluateWorldsBeyondClassCondition(
    HISTORY_TEXT,
    player,
    card(10773310, { name: "Warp Slash", type: "Spell", text: HISTORY_TEXT })
  );

  assert.equal(result.text, "Deal 2 damage to all enemy followers. Deal 1 damage to the enemy leader.");
  assert.equal(result.mechanic, "stateCount");
  assert.ok(result.notes.includes("X = differently named allied Artifact followers entered 2"));
});

test("Warp Slash-style play uses match history for area damage and keeps trailing leader damage", () => {
  const warp = card(10773310, { name: "Warp Slash", type: "Spell", cost: 3, text: HISTORY_TEXT });
  const analyzing = card("artifact-a", { name: "Analyzing Artifact", traits: ["Artifact"] });
  const ancient = card("artifact-b", { name: "Ancient Artifact", traits: ["Artifact"] });
  const game = begin(warp, [analyzing, ancient]);
  const source = forceSourceIntoHand(game, warp);

  enterFollower(game, 0, analyzing, "a1");
  enterFollower(game, 0, analyzing, "a2");
  enterFollower(game, 0, ancient, "b1");
  const first = forceEnemyFollower(game, "enemy-one", 5);
  const second = forceEnemyFollower(game, "enemy-two", 6);

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId);
  assert.ok(action);
  game.dispatch(action);

  assert.equal(game.findBoardCard(1, first.instanceId)?.defense, 3);
  assert.equal(game.findBoardCard(1, second.instanceId)?.defense, 4);
  assert.equal(game.getPlayer(1).hp, 19);
  assert.equal(countWorldsBeyondDifferentlyNamedArtifactEntries(game.getPlayer(0)), 2);
});

test("history X stays unresolved when the same effect creates a follower before defining X", () => {
  const text = "Summon an Analyzing Artifact. Deal X damage to all enemy followers. X is the number of differently named allied Artifact followers that have entered the field this match.";
  const player = { className: "Portalcraft", hand: [], board: [], resources: { artifactFollowerNamesEntered: ["Ancient Artifact"] } };
  const result = evaluateWorldsBeyondClassCondition(text, player, card("ordered-history", { type: "Spell", text }));

  assert.equal(result.text, text);
  assert.equal(result.mechanic, null);
  assert.equal(result.notes.some(note => note.startsWith("X =")), false);
});
