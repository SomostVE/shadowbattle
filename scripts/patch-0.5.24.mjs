import fs from "node:fs";

function replaceOnce(path, before, after, label) {
  let source = fs.readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one marker, found ${count}`);
  source = source.replace(before, after);
  fs.writeFileSync(path, source);
}

const classPath = "src/core/rulesets/svwb/class-conditions.js";
replaceOnce(classPath,
`function resolveOrderedStateCountVariable(text) {
  const value = String(text ?? "");
  const definition = /\\bX is the number of allied Golem followers on the field\\s*\\.?/i;
  if (!definition.test(value) || !/\\bdeal X damage to all enemy followers\\b/i.test(value)) return null;
  const withoutDefinition = value.replace(definition, " ");
  return {
    note: "X = allied Golem followers at resolution",
    text: normalizeResolvedText(withoutDefinition.replace(
      /\\bdeal X damage to all enemy followers\\b/i,
      "Deal damage to all enemy followers equal to the number of allied Golem followers on the field"
    ))
  };
}`,
`function resolveOrderedStateCountVariable(text) {
  const value = String(text ?? "");
  const golemDefinition = /\\bX is the number of allied Golem followers on the field\\s*\\.?/i;
  if (golemDefinition.test(value) && /\\bdeal X damage to all enemy followers\\b/i.test(value)) {
    const withoutDefinition = value.replace(golemDefinition, " ");
    return {
      note: "X = allied Golem followers at resolution",
      text: normalizeResolvedText(withoutDefinition.replace(
        /\\bdeal X damage to all enemy followers\\b/i,
        "Deal damage to all enemy followers equal to the number of allied Golem followers on the field"
      ))
    };
  }

  const neutralDefinition = /\\bX is the number of Neutral cards in your hand\\s*\\.?/i;
  const neutralMatch = neutralDefinition.exec(value);
  const randomDamage = /\\bdeal X damage to (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+) random enemy followers\\b/i;
  if (!neutralMatch || !randomDamage.test(value)) return null;
  const prefix = value.slice(0, neutralMatch.index);
  if (!prefixMutatesHand(prefix)) return null;
  const withoutDefinition = `${value.slice(0, neutralMatch.index)} ${value.slice(neutralMatch.index + neutralMatch[0].length)}`;
  return {
    note: "X = Neutral cards in hand at resolution",
    text: normalizeResolvedText(withoutDefinition.replace(
      randomDamage,
      (_, count) => `Deal damage to ${count} random enemy followers equal to the number of Neutral cards in your hand`
    ))
  };
}`,
"ordered state variables");

replaceOnce(classPath,
`    {
      label: "Pixie followers in hand",
      pattern: /\\bX is the number of Pixie followers in your hand\\s*\\.?/i,
      blocked: prefixMutatesHand,
      count: () => (player?.hand ?? []).filter(item => cardType(item) === "follower" && hasCardTrait(item, "Pixie")).length
    },`,
`    {
      label: "Neutral cards in hand",
      pattern: /\\bX is the number of Neutral cards in your hand\\s*\\.?/i,
      blocked: prefixMutatesHand,
      count: () => (player?.hand ?? []).filter(item => cardClass(item) === "neutral").length
    },
    {
      label: "Pixie followers in hand",
      pattern: /\\bX is the number of Pixie followers in your hand\\s*\\.?/i,
      blocked: prefixMutatesHand,
      count: () => (player?.hand ?? []).filter(item => cardType(item) === "follower" && hasCardTrait(item, "Pixie")).length
    },`,
"neutral hand definition");

replaceOnce(classPath,
`function cardType(instance) {
  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}`,
`function cardClass(instance) {
  return String(instance?.card?.class ?? instance?.card?.className ?? instance?.class ?? instance?.className ?? "").trim().toLowerCase();
}

function cardType(instance) {
  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}`,
"card class helper");

const genericPath = "src/core/rulesets/svwb/generic-effects.js";
replaceOnce(genericPath,
`const ALLIED_GOLEM_AREA_DAMAGE = /\\bdeal damage to all enemy followers equal to the number of allied Golem followers on the field\\b/gi;`,
`const ALLIED_GOLEM_AREA_DAMAGE = /\\bdeal damage to all enemy followers equal to the number of allied Golem followers on the field\\b/gi;
const RANDOM_ENEMY_FOLLOWER_DAMAGE = new RegExp(\\`\\\\bdeal\\\\s+${NUMBER}\\\\s+damage to\\\\s+${NUMBER}\\\\s+random enemy followers\\\\b\\`, "gi");
const LIVE_NEUTRAL_HAND_RANDOM_DAMAGE = /\\bdeal damage to (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+) random enemy followers equal to the number of Neutral cards in your hand\\b/gi;`,
"random damage constants");

replaceOnce(genericPath,
`  LIVE_HAND_SIZE_LEADER_HEAL,`,
`  LIVE_HAND_SIZE_LEADER_HEAL,
  RANDOM_ENEMY_FOLLOWER_DAMAGE,
  LIVE_NEUTRAL_HAND_RANDOM_DAMAGE,`,
"generic strip patterns");

replaceOnce(genericPath,
`export function resolveWorldsBeyondSplitEnemyFollowerDamage(session, {`,
`export function resolveWorldsBeyondRandomEnemyFollowerDamage(session, {
  playerIndex,
  source,
  amount,
  count,
  destroyFollower
} = {}) {
  const enemyIndex = 1 - playerIndex;
  const candidates = session.getPlayer(enemyIndex).board
    .filter(unit => cardType(unit) === "follower")
    .map(unit => unit.instanceId);
  const targetIds = [];
  let remaining = Math.min(Math.max(0, Number(count) || 0), candidates.length);
  while (remaining > 0 && candidates.length) {
    const index = Math.floor(session.rng() * candidates.length);
    targetIds.push(candidates.splice(index, 1)[0]);
    remaining -= 1;
  }

  let applied = false;
  const damage = Math.max(0, Number(amount) || 0);
  for (const instanceId of targetIds) {
    const live = session.findBoardCard(enemyIndex, instanceId);
    if (!live || session.phase === "ended") continue;
    session.damageFollower(enemyIndex, live.instanceId, damage, {
      actor: playerIndex,
      source,
      reason: "ability",
      resolveDeath: false
    });
    applied = true;
    const damaged = session.findBoardCard(enemyIndex, instanceId);
    if (!damaged || currentDefense(damaged) > 0) continue;
    destroyFollower?.(session, enemyIndex, damaged.instanceId, {
      actor: playerIndex,
      source,
      reason: "ability",
      byAbility: true
    });
  }
  return applied;
}

export function resolveWorldsBeyondSplitEnemyFollowerDamage(session, {`,
"random damage resolver");

const commandsPath = "src/core/rulesets/svwb/v6/effect-commands.js";
replaceOnce(commandsPath,
`  DAMAGE_LEADER: "damage-leader",
  SPLIT_DAMAGE_ENEMY_FOLLOWERS: "svwb:split-damage-enemy-followers",`,
`  DAMAGE_LEADER: "damage-leader",
  RANDOM_DAMAGE_ENEMY_FOLLOWERS: "svwb:random-damage-enemy-followers",
  SPLIT_DAMAGE_ENEMY_FOLLOWERS: "svwb:split-damage-enemy-followers",`,
"command type");

replaceOnce(commandsPath,
`export function createWorldsBeyondSplitEnemyFollowerDamageCommand(playerIndex, amount, options = {}) {`,
`export function createWorldsBeyondRandomEnemyFollowerDamageCommand(playerIndex, amount, count, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.RANDOM_DAMAGE_ENEMY_FOLLOWERS, {
    playerIndex,
    amount: Math.max(0, Number(amount) || 0),
    count: Math.max(0, Number(count) || 0),
    amountFrom: options.amountFrom ?? null,
    reason: options.reason ?? "ability",
    sourceCardId: options.sourceCardId ?? null,
    sourceCardName: options.sourceCardName ?? null
  }, options.metadata);
}

export function createWorldsBeyondSplitEnemyFollowerDamageCommand(playerIndex, amount, options = {}) {`,
"command creator");

replaceOnce(commandsPath,
`  for (const match of value.matchAll(/\\bdeal\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+damage to (?:the )?enemy leader\\b/gi)) {`,
`  for (const match of value.matchAll(/\\bdeal\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+damage to\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+random enemy followers\\b/gi)) {
    indexed.push({
      index: match.index ?? 0,
      command: createWorldsBeyondRandomEnemyFollowerDamageCommand(playerIndex, numberWord(match[1]), numberWord(match[2]), sourceOptions)
    });
  }

  for (const match of value.matchAll(/\\bdeal damage to (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+) random enemy followers equal to the number of Neutral cards in your hand\\b/gi)) {
    indexed.push({
      index: match.index ?? 0,
      command: createWorldsBeyondRandomEnemyFollowerDamageCommand(playerIndex, 0, numberWord(match[1]), {
        ...sourceOptions,
        amountFrom: "neutral-hand-count"
      })
    });
  }

  for (const match of value.matchAll(/\\bdeal\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+damage to (?:the )?enemy leader\\b/gi)) {`,
"compile random damage");

replaceOnce(commandsPath,
`  if (command.type === SVWB_EFFECT_COMMAND.SPLIT_DAMAGE_ENEMY_FOLLOWERS) {`,
`  if (command.type === SVWB_EFFECT_COMMAND.RANDOM_DAMAGE_ENEMY_FOLLOWERS) {
    const count = positiveAmount(payload.count);
    const amount = payload.amountFrom === "neutral-hand-count"
      ? countNeutralCardsInHand(session.getPlayer(playerIndex))
      : Math.max(0, Number(payload.amount) || 0);
    if (!count) return { applied: false, requested: 0, amount };
    const applied = Boolean(session.ruleset?.resolveRandomEnemyFollowerDamage?.(session, {
      playerIndex,
      source,
      amount,
      count
    }));
    return { applied, requested: count, amount };
  }

  if (command.type === SVWB_EFFECT_COMMAND.SPLIT_DAMAGE_ENEMY_FOLLOWERS) {`,
"resolve random command");

replaceOnce(commandsPath,
`function resolveAddToHand(session, playerIndex, payload) {`,
`function countNeutralCardsInHand(player) {
  return (player?.hand ?? []).filter(instance =>
    String(instance?.card?.class ?? instance?.card?.className ?? instance?.class ?? instance?.className ?? "").trim().toLowerCase() === "neutral"
  ).length;
}

function resolveAddToHand(session, playerIndex, payload) {`,
"neutral hand command helper");

const rulesetPath = "src/core/rulesets/worlds-beyond.js";
replaceOnce(rulesetPath,
`  resolveWorldsBeyondSplitAllEnemiesDamage,
  resolveWorldsBeyondSplitEnemyFollowerDamage`,
`  resolveWorldsBeyondRandomEnemyFollowerDamage,
  resolveWorldsBeyondSplitAllEnemiesDamage,
  resolveWorldsBeyondSplitEnemyFollowerDamage`,
"ruleset import");

replaceOnce(rulesetPath,
`  resolveSplitEnemyFollowerDamage(session, { playerIndex, source, amount }) {`,
`  resolveRandomEnemyFollowerDamage(session, { playerIndex, source, amount, count }) {
    return resolveWorldsBeyondRandomEnemyFollowerDamage(session, {
      playerIndex,
      source,
      amount,
      count,
      destroyFollower: destroyWorldsBeyondFollower
    });
  },
  resolveSplitEnemyFollowerDamage(session, { playerIndex, source, amount }) {`,
"ruleset method");

const testPath = "tests/worlds-beyond-random-multi-damage-v6.test.js";
fs.writeFileSync(testPath, `import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

function card(id, extra = {}) {
  return { id, name: String(id), class: "Swordcraft", type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], traits: [], ...extra };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(\`${'${prefix}'}-${'${index}'}\`));
}

function readyGame(cardCatalog = []) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "random-multi-damage-v6",
    firstPlayer: 0,
    cardCatalog,
    players: [
      { name: "Human", className: "Swordcraft", deck: deck("A") },
      { name: "CPU", className: "Swordcraft", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHand(game, index, sourceCard) {
  const instance = game.players[0].hand[index];
  assert.ok(instance);
  instance.card = sourceCard;
  instance.cardId = sourceCard.id;
  instance.attackBonus = 0;
  instance.defenseBonus = 0;
  instance.spellboost = 0;
  return instance;
}

function enemy(game, id, defense = 6) {
  const instance = game.players[1].hand.shift() ?? game.players[1].deck.shift();
  assert.ok(instance);
  const source = card(id, { class: "Neutral", attack: 1, defense });
  instance.card = source;
  instance.cardId = source.id;
  instance.attack = 1;
  instance.defense = defense;
  instance.maxDefense = defense;
  instance.attacksRemaining = 0;
  instance.canAttackFollowers = false;
  instance.canAttackLeader = false;
  game.players[1].board.push(instance);
  return instance;
}

function play(game, source) {
  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === source.instanceId);
  assert.ok(action);
  game.dispatch(action);
}

test("Seria deals 1 damage to 2 distinct random enemy followers", () => {
  const game = readyGame();
  const seria = card(10221110, {
    name: "Seria, Gunslinger Maid",
    cost: 0,
    attack: 2,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Deal 1 damage to 2 random enemy followers."
  });
  const source = replaceHand(game, 0, seria);
  const targets = [enemy(game, "e1"), enemy(game, "e2"), enemy(game, "e3")];
  play(game, source);
  const damaged = targets.filter(unit => game.findBoardCard(1, unit.instanceId)?.defense === 5);
  const untouched = targets.filter(unit => game.findBoardCard(1, unit.instanceId)?.defense === 6);
  assert.equal(damaged.length, 2);
  assert.equal(untouched.length, 1);
});

test("multi-random damage never hits the same follower twice when too few targets exist", () => {
  const game = readyGame();
  const sourceCard = card("three-random", { cost: 0, keywords: ["Fanfare"], text: "Fanfare: Deal 3 damage to 3 random enemy followers." });
  const source = replaceHand(game, 0, sourceCard);
  const only = enemy(game, "only", 10);
  play(game, source);
  assert.equal(game.findBoardCard(1, only.instanceId)?.defense, 7);
});

test("Waterbending Charmwielder damages 3 distinct followers and Spellboosts the hand 3 times", () => {
  const game = readyGame();
  const charmwielder = card(10531120, {
    name: "Waterbending Charmwielder",
    class: "Runecraft",
    cost: 0,
    attack: 3,
    defense: 3,
    keywords: ["Fanfare"],
    text: "Fanfare: Deal 3 damage to 3 random enemy followers. Spellboost your hand 3 times."
  });
  const source = replaceHand(game, 0, charmwielder);
  const boostable = replaceHand(game, 1, card("boostable", { class: "Runecraft", text: "Spellboost: Subtract 1 from the cost of this card." }));
  const targets = [enemy(game, "w1"), enemy(game, "w2"), enemy(game, "w3"), enemy(game, "w4")];
  play(game, source);
  assert.equal(targets.filter(unit => game.findBoardCard(1, unit.instanceId)?.defense === 3).length, 3);
  assert.equal(targets.filter(unit => game.findBoardCard(1, unit.instanceId)?.defense === 6).length, 1);
  assert.equal(boostable.spellboost, 3);
});

test("March of the Brutes resolves follower damage before its enemy-leader damage", () => {
  const game = readyGame();
  const march = card(10351310, {
    name: "March of the Brutes",
    class: "Abysscraft",
    type: "Spell",
    cost: 0,
    text: "Deal 2 damage to 2 random enemy followers and the enemy leader."
  });
  const source = replaceHand(game, 0, march);
  const targets = [enemy(game, "m1", 5), enemy(game, "m2", 5), enemy(game, "m3", 5)];
  game.players[1].hp = 2;
  play(game, source);
  assert.equal(targets.filter(unit => game.findBoardCard(1, unit.instanceId)?.defense === 3).length, 2);
  assert.equal(game.players[1].hp, 0);
  assert.equal(game.phase, "ended");
});

test("Neutral-cards-in-hand X resolves directly when no earlier effect mutates the hand", () => {
  const player = {
    hand: [
      { card: card("n1", { class: "Neutral" }) },
      { card: card("n2", { class: "Neutral", type: "Spell" }) },
      { card: card("s1", { class: "Swordcraft" }) }
    ],
    board: [],
    resources: {}
  };
  const result = evaluateWorldsBeyondClassCondition(
    "Deal X damage to 2 random enemy followers. X is the number of Neutral cards in your hand.",
    player,
    card("warden", { class: "Neutral" })
  );
  assert.equal(result.text, "Deal 2 damage to 2 random enemy followers.");
  assert.ok(result.notes.includes("X = Neutral cards in hand 2"));
});

test("Warden counts the generated Jailor before resolving live Neutral-hand damage", () => {
  const jailor = card(10901120, { name: "Jailor of Antiquity", class: "Neutral", cost: 6, attack: 6, defense: 6 });
  const game = readyGame([jailor]);
  const warden = card(10903110, {
    name: "Warden of Selflessness",
    class: "Neutral",
    cost: 0,
    attack: 4,
    defense: 4,
    keywords: ["Fanfare", "Evolve"],
    text: "Fanfare: Add a Jailor of Antiquity to your hand. Deal X damage to 2 random enemy followers. X is the number of Neutral cards in your hand.\\n\\nEvolve: Recover 1 play point."
  });
  const source = replaceHand(game, 0, warden);
  replaceHand(game, 1, card("neutral-a", { class: "Neutral" }));
  replaceHand(game, 2, card("neutral-b", { class: "Neutral", type: "Spell" }));
  replaceHand(game, 3, card("sword-a", { class: "Swordcraft" }));
  replaceHand(game, 4, card("sword-b", { class: "Swordcraft" }));
  const first = enemy(game, "warden-e1", 6);
  const second = enemy(game, "warden-e2", 6);

  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);
  assert.equal(support.supported, true);
  assert.match(support.text, /equal to the number of Neutral cards in your hand/i);

  play(game, source);
  assert.equal(game.findBoardCard(1, first.instanceId)?.defense, 3);
  assert.equal(game.findBoardCard(1, second.instanceId)?.defense, 3);
  assert.equal(game.players[0].hand.filter(item => item.card?.class === "Neutral").length, 3);
  assert.ok(game.players[0].hand.some(item => item.card?.name === "Jailor of Antiquity"));
});
`);
