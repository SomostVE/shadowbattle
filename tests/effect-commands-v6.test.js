import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import {
  createEffectCommand,
  getEffectCommandLog,
  isEffectCommand,
  resolveEffectCommands
} from "../src/core/effect-commands.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { gainWorldsBeyondCrest } from "../src/core/rulesets/svwb/crests.js";
import {
  SVWB_EFFECT_COMMAND,
  compileWorldsBeyondPostTargetCommands,
  compileWorldsBeyondPreTargetCommands,
  createWorldsBeyondDrawCommand,
  createWorldsBeyondGainCrestCommand,
  createWorldsBeyondLeaderDamageCommand,
  createWorldsBeyondLeaderHealCommand
} from "../src/core/rulesets/svwb/v6/effect-commands.js";
import { SHADOWBATTLE_V6_ENGINE_PROFILE } from "../src/core/rulesets/svwb/v6/engine-profile.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: index === 10 ? 4 : 1,
    keywords: [],
    traits: [],
    text: ""
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "v6-effect-command-test",
    firstPlayer: 0,
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

test("V6 effect commands are serializable immutable values", () => {
  const command = createEffectCommand("qa:effect", { amount: 2, nested: { value: 3 } }, { family: "qa" });
  assert.equal(isEffectCommand(command), true);
  assert.equal(Object.isFrozen(command), true);
  assert.equal(Object.isFrozen(command.payload), true);
  assert.equal(Object.isFrozen(command.payload.nested), true);
  assert.deepEqual(JSON.parse(JSON.stringify(command)), {
    type: "qa:effect",
    payload: { amount: 2, nested: { value: 3 } },
    metadata: { family: "qa" }
  });
  assert.throws(() => createEffectCommand("", {}), /requires a type/);
  assert.throws(() => createEffectCommand("qa", []), /payload must be an object/);
});

test("V6 resolves each effect command completely before the next command", () => {
  const game = readyGame();
  game.players[0].hp = 19;
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Flame", {
    id: 99101,
    name: "Burnite, Anathema of Flame"
  });
  const cursor = game.eventSequence;

  const results = resolveEffectCommands(game, [
    createWorldsBeyondLeaderHealCommand(0, 1, { reason: "qa-command-heal" }),
    createWorldsBeyondLeaderDamageCommand(0, 1, 2, { reason: "qa-command-damage" })
  ]);

  assert.equal(results[0]?.healed, 1);
  assert.equal(results[1]?.damage, 2);
  assert.equal(game.players[0].hp, 19, "heal resolves, then Burnite reacts before the second command");
  assert.equal(game.players[1].hp, 18);

  const relevant = game.getEvents({ since: cursor, viewer: 0 })
    .filter(event => [BATTLE_EVENT.HEAL, BATTLE_EVENT.CREST_ACTIVATE, BATTLE_EVENT.LEADER_DAMAGE].includes(event.type));
  assert.deepEqual(relevant.map(event => event.type), [
    BATTLE_EVENT.HEAL,
    BATTLE_EVENT.CREST_ACTIVATE,
    BATTLE_EVENT.LEADER_DAMAGE,
    BATTLE_EVENT.LEADER_DAMAGE
  ]);
  assert.equal(relevant[2].payload.targetPlayer, 0);
  assert.equal(relevant[3].payload.targetPlayer, 1);
  assert.equal(game.getResolutionState().pending, 0);
  assert.equal(game.getResolutionState().processing, false);
});

test("V6 draw and Gain Crest commands preserve hidden information boundaries", () => {
  const game = readyGame();
  const cursor = game.eventSequence;
  const results = resolveEffectCommands(game, [
    createWorldsBeyondGainCrestCommand(0, "QA Persistent Command Crest"),
    createWorldsBeyondDrawCommand(0, 1, { reason: "qa-command-draw" })
  ]);

  assert.equal(results[0]?.applied, true);
  assert.equal(results[1]?.drawn, 1);
  assert.equal(game.players[0].resources.crests.some(crest => crest.name === "QA Persistent Command Crest"), true);

  const ownerDraw = game.getEvents({ since: cursor, viewer: 0 }).find(event => event.type === BATTLE_EVENT.DRAW);
  const opponentDraw = game.getEvents({ since: cursor, viewer: 1 }).find(event => event.type === BATTLE_EVENT.DRAW);
  assert.ok(ownerDraw?.payload.cards?.[0]?.name);
  assert.equal(opponentDraw, undefined);
});

test("V6 card-text compiler preserves the legacy simple-effect order", () => {
  const source = {
    instanceId: "qa-source",
    cardId: 99201,
    card: { id: 99201, name: "QA Command Spell" }
  };
  const text = "Gain Crest: QA Command Crest. Draw 1 card. Restore 1 defense to your leader. Deal 2 damage to the enemy leader.";
  const commands = [
    ...compileWorldsBeyondPreTargetCommands(text, { playerIndex: 0, source }),
    ...compileWorldsBeyondPostTargetCommands(text, { playerIndex: 0, source })
  ];
  assert.deepEqual(commands.map(command => command.type), [
    SVWB_EFFECT_COMMAND.GAIN_CREST,
    SVWB_EFFECT_COMMAND.DRAW,
    SVWB_EFFECT_COMMAND.HEAL_LEADER,
    SVWB_EFFECT_COMMAND.DAMAGE_LEADER
  ]);
  assert.doesNotThrow(() => JSON.stringify(commands));
});

test("real simple card text is executed through the V6 effect-command log", () => {
  const game = readyGame();
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  game.players[0].hp = 19;
  gainWorldsBeyondCrest(game, 0, "Burnite, Anathema of Flame", {
    id: 99301,
    name: "Burnite, Anathema of Flame"
  });

  const item = game.players[0].hand[0];
  const card = {
    id: 99302,
    name: "QA V6 Command Spell",
    class: "Neutral",
    type: "Spell",
    cost: 0,
    keywords: [],
    traits: [],
    text: "Gain Crest: QA Card Text Crest. Draw 1 card. Restore 1 defense to your leader. Deal 2 damage to the enemy leader."
  };
  item.card = card;
  item.cardId = card.id;
  const logCursor = getEffectCommandLog(game).length;
  const action = game.listLegalActions(0).find(candidate => candidate.type === "play-card" && candidate.cardInstanceId === item.instanceId);
  assert.ok(action);

  game.dispatch(action);

  const commands = getEffectCommandLog(game).slice(logCursor).map(entry => entry.command.type);
  assert.deepEqual(commands, [
    SVWB_EFFECT_COMMAND.GAIN_CREST,
    SVWB_EFFECT_COMMAND.DRAW,
    SVWB_EFFECT_COMMAND.HEAL_LEADER,
    SVWB_EFFECT_COMMAND.DAMAGE_LEADER
  ]);
  assert.equal(game.players[0].resources.crests.some(crest => crest.name === "QA Card Text Crest"), true);
  assert.equal(game.players[0].hp, 19, "the card heal resolves before Burnite and before enemy damage");
  assert.equal(game.players[1].hp, 18);
});

test("V6 engine profile marks the effect-command migration as active", () => {
  assert.equal(SHADOWBATTLE_V6_ENGINE_PROFILE.migrationGates.cardEffectCommands, "partial");
});
