from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))


commands = "src/core/rulesets/svwb/v6/effect-commands.js"
replace_once(
    commands,
    '  DRAW_FILTERED: "svwb:draw-filtered",\n  ADD_TO_HAND: "svwb:add-to-hand",',
    '  DRAW_FILTERED: "svwb:draw-filtered",\n  RECOVER_PLAY_POINTS: "svwb:recover-play-points",\n  ADD_TO_HAND: "svwb:add-to-hand",'
)

replace_once(
    commands,
    '''export function createWorldsBeyondDrawCommand(playerIndex, amount, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.DRAW, {
    playerIndex,
    amount,
    reason: options.reason ?? "ability"
  }, options.metadata);
}

export function createWorldsBeyondFilteredDrawCommand''',
    '''export function createWorldsBeyondDrawCommand(playerIndex, amount, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.DRAW, {
    playerIndex,
    amount,
    reason: options.reason ?? "ability"
  }, options.metadata);
}

export function createWorldsBeyondRecoverPlayPointsCommand(playerIndex, amount, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.RECOVER_PLAY_POINTS, {
    playerIndex,
    amount: Math.max(0, Number(amount) || 0),
    reason: options.reason ?? "ability"
  }, options.metadata);
}

export function createWorldsBeyondFilteredDrawCommand'''
)

replace_once(
    commands,
    '''  for (const match of value.matchAll(/\\bdraw\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+cards?\\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) indexed.push({ index: match.index ?? 0, command: createWorldsBeyondDrawCommand(playerIndex, amount, sourceOptions) });
  }

  for (const match of value.matchAll(/\\b(?:restore|recover)\\s+''',
    '''  for (const match of value.matchAll(/\\bdraw\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+cards?\\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) indexed.push({ index: match.index ?? 0, command: createWorldsBeyondDrawCommand(playerIndex, amount, sourceOptions) });
  }

  for (const match of value.matchAll(/\\bdraw\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(Neutral|[a-z]+craft)\\s+(followers?)\\s*\\.\\s*recover\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+play points?\\b/gi)) {
    const drawAmount = numberWord(match[1]);
    const recoverAmount = numberWord(match[4]);
    const baseIndex = match.index ?? 0;
    if (drawAmount > 0) indexed.push({
      index: baseIndex,
      command: createWorldsBeyondFilteredDrawCommand(playerIndex, {
        amount: drawAmount,
        cardClass: match[2],
        cardType: singularType(match[3])
      }, sourceOptions)
    });
    if (recoverAmount > 0) indexed.push({
      index: baseIndex + Math.max(1, match[0].toLowerCase().lastIndexOf("recover")),
      command: createWorldsBeyondRecoverPlayPointsCommand(playerIndex, recoverAmount, sourceOptions)
    });
  }

  for (const match of value.matchAll(/\\b(?:restore|recover)\\s+'''
)

replace_once(
    commands,
    '''  if (command.type === SVWB_EFFECT_COMMAND.DRAW_FILTERED) {
    return resolveFilteredDraw(session, playerIndex, payload);
  }

  if (command.type === SVWB_EFFECT_COMMAND.ADD_TO_HAND) {''',
    '''  if (command.type === SVWB_EFFECT_COMMAND.DRAW_FILTERED) {
    return resolveFilteredDraw(session, playerIndex, payload);
  }

  if (command.type === SVWB_EFFECT_COMMAND.RECOVER_PLAY_POINTS) {
    const requested = positiveAmount(payload.amount);
    const player = session.getPlayer(playerIndex);
    const before = Math.max(0, Number(player?.resources?.pp ?? player?.pp ?? 0) || 0);
    const maximum = Math.max(0, Number(player?.resources?.maxPp ?? player?.maxPp ?? before) || 0);
    const after = Math.min(maximum, before + requested);
    if (player.resources) player.resources.pp = after;
    else player.pp = after;
    return { applied: requested > 0, requested, recovered: after - before, pp: after };
  }

  if (command.type === SVWB_EFFECT_COMMAND.ADD_TO_HAND) {'''
)

generic = "src/core/rulesets/svwb/generic-effects.js"
replace_once(
    generic,
    '''  new RegExp(`\\\\brecover\\\\s+${NUMBER}\\\\s+evolution points?\\\\b`, "gi"),
  new RegExp(`\\\\badd\\\\s+${NUMBER}\\\\s+copies of''',
    '''  new RegExp(`\\\\brecover\\\\s+${NUMBER}\\\\s+evolution points?\\\\b`, "gi"),
  new RegExp(`\\\\bdraw\\\\s+${NUMBER}\\\\s+(?:Neutral|[a-z]+craft)\\\\s+followers?\\\\s*\\\\.\\\\s*recover\\\\s+${NUMBER}\\\\s+play points?\\\\b`, "gi"),
  new RegExp(`\\\\badd\\\\s+${NUMBER}\\\\s+copies of'''
)

test_path = Path("tests/worlds-beyond-ordered-filtered-draw-pp-v6.test.js")
if not test_path.exists():
    test_path.write_text('''import test from "node:test";
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
''')

for path in [
    "package.json",
    "version.json",
    "index.html",
    "api/index.html",
    "test/index.html",
    "decks/index.html",
    "library/index.html"
]:
    p = Path(path)
    text = p.read_text()
    if "0.5.29" in text:
        continue
    if "0.5.28" not in text:
        raise SystemExit(f"missing 0.5.28 version anchor in {path}")
    p.write_text(text.replace("0.5.28", "0.5.29"))
