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
  const withoutDefinition = value.slice(0, neutralMatch.index) + " " + value.slice(neutralMatch.index + neutralMatch[0].length);
  return {
    note: "X = Neutral cards in hand at resolution",
    text: normalizeResolvedText(withoutDefinition.replace(
      randomDamage,
      (_, count) => "Deal damage to " + count + " random enemy followers equal to the number of Neutral cards in your hand"
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
const RANDOM_ENEMY_FOLLOWER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to\\\\s+" + NUMBER + "\\\\s+random enemy followers\\\\b", "gi");
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
