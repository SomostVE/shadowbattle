import test from "node:test";
import assert from "node:assert/strict";
import { getEffectCommandLog } from "../src/core/effect-commands.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  destroyWorldsBeyondFollower,
  getWorldsBeyondTriggerSupport,
  resolveWorldsBeyondTrigger
} from "../src/core/rulesets/svwb/effect-resolver.js";
import { SVWB_EFFECT_COMMAND } from "../src/core/rulesets/svwb/v6/effect-commands.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: []
  }));
}

function readyGame(seed = "destroyed-history-copies-v6") {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed,
    firstPlayer: 0,
    players: [
      { name: "A", deck: fillerDeck("A") },
      { name: "B", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function follower(id, name, cost, owner = 0) {
  const card = { id, name, class: "Neutral", type: "Follower", cost, attack: 1, defense: 1, keywords: [] };
  return {
    instanceId: `${id}:${owner}:${Math.random()}`,
    owner,
    cardId: id,
    card,
    attack: 1,
    defense: 1,
    maxDefense: 1,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true,
    evolved: false,
    superEvolved: false
  };
}

function destroyForHistory(game, unit) {
  game.registerCardDefinitions([unit.card]);
  game.players[unit.owner].board.push(unit);
  assert.ok(destroyWorldsBeyondFollower(game, unit.owner, unit.instanceId, { reason: "test-history" }));
}

test("Aika-style Fanfare copies only a follower actually destroyed this match and keeps the choice private", () => {
  const game = readyGame("aika-history");
  const lost = follower("lost-follower", "Lost Follower", 4);
  destroyForHistory(game, lost);
  const merelyInCemetery = follower("not-destroyed", "Not Destroyed", 8);
  game.registerCardDefinitions([merelyInCemetery.card]);
  game.players[0].cemetery.push(merelyInCemetery);

  const aika = {
    id: "aika-style",
    name: "Aika Style",
    class: "Neutral",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 1,
    keywords: ["Fanfare", "Evolve"],
    text: "Fanfare: Add a copy of a random allied follower destroyed this match to your hand without revealing it.\n\nEvolve: Replicate the effects of this card's Fanfare ability."
  };
  game.registerCardDefinitions([aika]);
  const source = { instanceId: "aika-style-source", owner: 0, cardId: aika.id, card: aika };
  const before = game.events.length;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(result.unresolved, false);
  const generated = game.players[0].hand.filter(item => item.card?.name === "Lost Follower");
  assert.equal(generated.length, 1);
  assert.equal(game.players[0].hand.some(item => item.card?.name === "Not Destroyed"), false);
  assert.equal(generated[0].costDelta ?? 0, 0);
  const publicResolution = JSON.stringify(game.events.slice(before));
  assert.equal(publicResolution.includes("Lost Follower"), false, "the random destroyed-history choice must not be revealed publicly");
  const commandTypes = getEffectCommandLog(game).slice(-1).map(entry => entry.command.type);
  assert.deepEqual(commandTypes, [SVWB_EFFECT_COMMAND.COPY_DESTROYED_FOLLOWERS]);
});

test("Aika-style Evolve replicate-Fanfare reuses the same destroyed-history command", () => {
  const game = readyGame("aika-evolve-history");
  const lost = follower("lost-evolve", "Lost Evolve", 3);
  destroyForHistory(game, lost);
  const aika = {
    id: "aika-evolve-style",
    name: "Aika Evolve Style",
    class: "Neutral",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 1,
    keywords: ["Fanfare", "Evolve"],
    text: "Fanfare: Add a copy of a random allied follower destroyed this match to your hand without revealing it.\n\nEvolve: Replicate the effects of this card's Fanfare ability."
  };
  game.registerCardDefinitions([aika]);
  const source = { instanceId: "aika-evolve-source", owner: 0, cardId: aika.id, card: aika, evolved: true };

  const support = getWorldsBeyondTriggerSupport(source, "evolve", null, game.players[0]);
  const result = resolveWorldsBeyondTrigger(game, { trigger: "evolve", playerIndex: 0, source });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(result.unresolved, false);
  assert.equal(game.players[0].hand.filter(item => item.card?.name === "Lost Evolve").length, 1);
});

test("Initiation-style history copy chooses the highest base cost and resolves before Draw", () => {
  const game = readyGame("initiation-history");
  destroyForHistory(game, follower("low-history", "Low History", 2));
  destroyForHistory(game, follower("high-history", "High History", 7));
  destroyForHistory(game, follower("mid-history", "Mid History", 5));

  const spell = {
    id: "initiation-style",
    name: "Initiation Style",
    class: "Neutral",
    type: "Spell",
    cost: 2,
    attack: 0,
    defense: 0,
    keywords: [],
    text: "Add a copy of a random allied follower destroyed this match with the highest base cost to your deck without revealing it. Draw a card."
  };
  game.registerCardDefinitions([spell]);
  const source = { instanceId: "initiation-style-source", owner: 0, cardId: spell.id, card: spell };
  game.players[0].deck = [];
  const beforeCommands = getEffectCommandLog(game).length;

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(result.unresolved, false);
  assert.equal(game.phase === "ended", false, "the generated deck card must exist before the draw resolves");
  assert.equal(game.players[0].hand.filter(item => item.card?.name === "High History").length, 1);
  assert.equal(game.players[0].hand.some(item => item.card?.name === "Low History"), false);
  assert.equal(game.players[0].hand.some(item => item.card?.name === "Mid History"), false);
  const commands = getEffectCommandLog(game).slice(beforeCommands).map(entry => entry.command.type);
  assert.deepEqual(commands, [SVWB_EFFECT_COMMAND.COPY_DESTROYED_FOLLOWERS, SVWB_EFFECT_COMMAND.DRAW]);
});

test("Resurrection Tuner-style discard copies two differently named destroyed followers", () => {
  const game = readyGame("tuner-history");
  destroyForHistory(game, follower("alpha-a", "Alpha History", 3));
  destroyForHistory(game, follower("alpha-b", "Alpha History", 3));
  destroyForHistory(game, follower("beta", "Beta History", 4));

  const spell = {
    id: "tuner-style",
    name: "Tuner Style",
    class: "Portalcraft",
    type: "Spell",
    cost: 1,
    attack: 0,
    defense: 0,
    keywords: [],
    text: "Select a card in your hand and discard it. Add a copy each of 2 random differently named allied followers destroyed this match to your hand without revealing them."
  };
  const discardCard = { id: "discard-me", name: "Discard Me", class: "Neutral", type: "Spell", cost: 1, keywords: [] };
  game.registerCardDefinitions([spell, discardCard]);
  const discard = { instanceId: "discard-me-instance", owner: 0, cardId: discardCard.id, card: discardCard };
  game.players[0].hand.push(discard);
  const source = { instanceId: "tuner-style-source", owner: 0, cardId: spell.id, card: spell };

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  const result = resolveWorldsBeyondTrigger(game, {
    trigger: "play",
    playerIndex: 0,
    source,
    discardInstanceId: discard.instanceId
  });

  assert.equal(support.supported, true, support.residual || "support blocked");
  assert.equal(result.unresolved, false);
  assert.equal(game.players[0].cemetery.some(item => item.instanceId === discard.instanceId), true, "discard resolves before history copies");
  const copiedNames = game.players[0].hand
    .map(item => item.card?.name)
    .filter(name => name === "Alpha History" || name === "Beta History")
    .sort();
  assert.deepEqual(copiedNames, ["Alpha History", "Beta History"]);
});
