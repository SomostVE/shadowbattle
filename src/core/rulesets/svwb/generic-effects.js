import { BATTLE_EVENT } from "../../battle-events.js";
import { resolveEffectCommands } from "../../effect-commands.js";
import { grantWorldsBeyondKeyword } from "./combat-readiness.js";
import { addWorldsBeyondGeneratedCard } from "./generated-cards.js";
import { LIVE_HAND_SIZE_LEADER_HEAL } from "./post-draw-hand-x.js";
import { createWorldsBeyondLeaderHealCommand } from "./v6/effect-commands.js";

const NUMBER = "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)";
const CARD_NAME = "([A-Z][A-Za-z0-9'’&,:\\- ]+?)";
const ALLIED_GOLEM_AREA_DAMAGE = /\bdeal damage to all enemy followers equal to the number of allied Golem followers on the field\b/gi;

const GENERIC_EFFECT_PATTERNS = Object.freeze([
  new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage split between all enemy followers\\b`, "gi"),
  new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage split between all enemies\\b`, "gi"),
  new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage to your leader\\b`, "gi"),
  new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage to both leaders\\b`, "gi"),
  ALLIED_GOLEM_AREA_DAMAGE,
  LIVE_HAND_SIZE_LEADER_HEAL,
  /\bgive all other allied followers(?: on the field)?\s+\+\d+\s*\/\s*\+\d+\b/gi,
  /\bgive all allied followers(?: on the field)?\s+Barrier\b/gi,
  /\bgive all enemy followers(?: on the field)?\s+-\d+\s*\/\s*-\d+\b/gi,
  /\bdestroy all damaged enemy followers\b/gi,
  new RegExp(`\\bgain\\s+${NUMBER}\\s+shadows?\\b`, "gi"),
  new RegExp(`\\bgain\\s+${NUMBER}\\s+max play points?\\b`, "gi"),
  new RegExp(`\\brecover\\s+${NUMBER}\\s+evolution points?\\b`, "gi"),
  new RegExp(`\\badd\\s+${NUMBER}\\s+copies of\\s+[^.]+?\\s+to your hand\\s*\\.?\\s*$`, "gi"),
  new RegExp(`^\\s*add\\s+(?:a|an|one)\\s+${CARD_NAME}\\s+to your hand\\s*\\.?`, "gi"),
  new RegExp(`[.!?]\\s+add\\s+(?:a|an|one)\\s+${CARD_NAME}\\s+to your hand\\s*\\.?\\s*$`, "gi"),
  new RegExp(`\\bdraw\\s+${NUMBER}\\s+amulets?\\s*\\.?\\s*$`, "gi"),
  new RegExp(`\\bdraw\\s+${NUMBER}\\s+spells?\\s*\\.?\\s*$`, "gi"),
  /\bsuper[- ]evolve this follower\b/gi,
  /(?<!super[- ])\bevolve this follower\b/gi,
  /\bgive (?:this follower|it)\s+Barrier\b/gi
]);

export function stripWorldsBeyondGenericEffectText(text) {
  let inspect = String(text ?? "");
  for (const pattern of GENERIC_EFFECT_PATTERNS) {
    pattern.lastIndex = 0;
    inspect = inspect.replace(pattern, " ");
  }
  return inspect;
}

export function resolveWorldsBeyondGenericEffects(session, {
  text,
  playerIndex,
  source,
  destroyFollower,
  gainShadows
} = {}) {
  const value = String(text ?? "");
  const effects = [];

  collect(value, new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage to your leader\\b`, "gi"), match => ({
    kind: "self-leader-damage",
    amount: numberWord(match[1])
  }), effects);
  collect(value, new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage to both leaders\\b`, "gi"), match => ({
    kind: "both-leaders-damage",
    amount: numberWord(match[1])
  }), effects);
  collect(value, ALLIED_GOLEM_AREA_DAMAGE, () => ({
    kind: "enemy-area-damage-by-allied-golem-count"
  }), effects);
  collect(value, LIVE_HAND_SIZE_LEADER_HEAL, () => ({
    kind: "leader-heal-by-live-hand-size"
  }), effects);
  collect(value, /\bgive all other allied followers(?: on the field)?\s+\+(\d+)\s*\/\s*\+(\d+)\b/gi, match => ({
    kind: "allied-buff",
    attack: Number(match[1]) || 0,
    defense: Number(match[2]) || 0,
    excludeSource: true
  }), effects);
  collect(value, /\bgive all allied followers(?: on the field)?\s+Barrier\b/gi, () => ({
    kind: "allied-barrier"
  }), effects);
  collect(value, /\bgive all enemy followers(?: on the field)?\s+-(\d+)\s*\/\s*-(\d+)\b/gi, match => ({
    kind: "enemy-debuff",
    attack: Number(match[1]) || 0,
    defense: Number(match[2]) || 0
  }), effects);
  collect(value, /\bdestroy all damaged enemy followers\b/gi, () => ({
    kind: "destroy-damaged-enemies"
  }), effects);
  collect(value, new RegExp(`\\bgain\\s+${NUMBER}\\s+shadows?\\b`, "gi"), match => ({
    kind: "gain-shadows",
    amount: numberWord(match[1])
  }), effects);
  collect(value, new RegExp(`\\bgain\\s+${NUMBER}\\s+max play points?\\b`, "gi"), match => ({
    kind: "gain-max-pp",
    amount: numberWord(match[1])
  }), effects);
  collect(value, new RegExp(`\\brecover\\s+${NUMBER}\\s+evolution points?\\b`, "gi"), match => ({
    kind: "recover-evolution-points",
    amount: numberWord(match[1])
  }), effects);
  collect(value, new RegExp(`[.!?]\\s+add\\s+(?:a|an|one)\\s+${CARD_NAME}\\s+to your hand\\s*\\.?\\s*$`, "gi"), match => ({
    kind: "add-to-hand",
    cardName: match[1].trim()
  }), effects);
  collect(value, /\bsuper[- ]evolve this follower\b/gi, () => ({
    kind: "ability-super-evolve"
  }), effects);
  collect(value, /(?<!super[- ])\bevolve this follower\b/gi, () => ({
    kind: "ability-evolve"
  }), effects);
  collect(value, /\bgive (?:this follower|it)\s+Barrier\b/gi, () => ({
    kind: "self-barrier"
  }), effects);

  effects.sort((left, right) => left.index - right.index);
  let applied = false;
  for (const effect of effects) {
    if (session.phase === "ended") break;
    if (effect.kind === "self-leader-damage") {
      applied = session.damageLeader(playerIndex, effect.amount, { actor: playerIndex, source, reason: "ability" }) > 0 || applied;
      continue;
    }
    if (effect.kind === "both-leaders-damage") {
      applied = damageLeadersSimultaneously(session, [playerIndex, 1 - playerIndex], effect.amount, { actor: playerIndex, source }) || applied;
      continue;
    }
    if (effect.kind === "enemy-area-damage-by-allied-golem-count") {
      applied = damageEnemyFollowersByAlliedGolemCount(session, playerIndex, source, destroyFollower) || applied;
      continue;
    }
    if (effect.kind === "leader-heal-by-live-hand-size") {
      applied = healLeaderByLiveHandSize(session, playerIndex, source) || applied;
      continue;
    }
    if (effect.kind === "allied-buff") {
      applied = buffAlliedFollowers(session, playerIndex, source, effect) || applied;
      continue;
    }
    if (effect.kind === "allied-barrier") {
      applied = grantAlliedBarrier(session, playerIndex) || applied;
      continue;
    }
    if (effect.kind === "enemy-debuff") {
      applied = debuffEnemyFollowers(session, playerIndex, source, effect, destroyFollower) || applied;
      continue;
    }
    if (effect.kind === "destroy-damaged-enemies") {
      applied = destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) || applied;
      continue;
    }
    if (effect.kind === "gain-shadows") {
      if (effect.amount > 0) {
        gainShadows?.(session, playerIndex, effect.amount);
        applied = true;
      }
      continue;
    }
    if (effect.kind === "gain-max-pp") {
      applied = gainMaximumPlayPoints(session, playerIndex, effect.amount) || applied;
      continue;
    }
    if (effect.kind === "recover-evolution-points") {
      applied = recoverEvolutionPoints(session, playerIndex, effect.amount) || applied;
      continue;
    }
    if (effect.kind === "add-to-hand") {
      applied = addGeneratedCardToHand(session, playerIndex, effect.cardName) || applied;
      continue;
    }
    if (effect.kind === "ability-super-evolve") {
      applied = Boolean(session.ruleset?.superEvolveFollowerByAbility?.(session, playerIndex, source)) || applied;
      continue;
    }
    if (effect.kind === "ability-evolve") {
      applied = Boolean(session.ruleset?.evolveFollowerByAbility?.(session, playerIndex, source)) || applied;
      continue;
    }
    if (effect.kind === "self-barrier") {
      applied = grantSelfBarrier(session, playerIndex, source) || applied;
    }
  }
  return applied;
}

function collect(text, pattern, factory, effects) {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) effects.push({ index: match.index ?? 0, ...factory(match) });
}

export function resolveWorldsBeyondSplitEnemyFollowerDamage(session, {
  playerIndex,
  source,
  amount,
  destroyFollower
} = {}) {
  let remaining = Math.max(0, Number(amount) || 0);
  if (!remaining) return false;
  const enemyIndex = 1 - playerIndex;
  const targetIds = session.getPlayer(enemyIndex).board
    .filter(unit => cardType(unit) === "follower")
    .map(unit => unit.instanceId);
  let applied = false;

  for (const instanceId of targetIds) {
    if (remaining <= 0 || session.phase === "ended") break;
    const live = session.findBoardCard(enemyIndex, instanceId);
    if (!live) continue;
    const allocation = Math.min(remaining, Math.max(0, currentDefense(live)));
    if (!allocation) continue;
    remaining -= allocation;
    session.damageFollower(enemyIndex, live.instanceId, allocation, {
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

export function resolveWorldsBeyondSplitAllEnemiesDamage(session, {
  playerIndex,
  source = null,
  amount,
  destroyFollower,
  reason = "ability"
} = {}) {
  let remaining = Math.max(0, Number(amount) || 0);
  if (!remaining || session.phase === "ended") return false;
  const enemyIndex = 1 - playerIndex;
  let applied = false;

  while (remaining > 0 && session.phase !== "ended") {
    const followers = session.getPlayer(enemyIndex).board.filter(unit => cardType(unit) === "follower");
    const pick = Math.floor(session.rng() * (followers.length + 1));
    if (pick >= followers.length) {
      session.damageLeader(enemyIndex, 1, { actor: playerIndex, source, reason });
      applied = true;
    } else {
      const target = followers[pick];
      session.damageFollower(enemyIndex, target.instanceId, 1, {
        actor: playerIndex,
        source,
        reason,
        resolveDeath: false
      });
      applied = true;
      const damaged = session.findBoardCard(enemyIndex, target.instanceId);
      if (damaged && currentDefense(damaged) <= 0) {
        destroyFollower?.(session, enemyIndex, damaged.instanceId, {
          actor: playerIndex,
          source,
          reason,
          byAbility: true
        });
      }
    }
    remaining -= 1;
  }
  return applied;
}

function damageEnemyFollowersByAlliedGolemCount(session, playerIndex, source, destroyFollower) {
  const alliedGolems = session.getPlayer(playerIndex).board.filter(unit =>
    cardType(unit) === "follower" && hasCardTrait(unit, "Golem")
  ).length;
  const enemyIndex = 1 - playerIndex;
  const targetIds = session.getPlayer(enemyIndex).board
    .filter(unit => cardType(unit) === "follower")
    .map(unit => unit.instanceId);
  let applied = false;

  for (const instanceId of targetIds) {
    const live = session.findBoardCard(enemyIndex, instanceId);
    if (!live || session.phase === "ended") continue;
    session.damageFollower(enemyIndex, live.instanceId, alliedGolems, {
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

function healLeaderByLiveHandSize(session, playerIndex, source) {
  const amount = session.getPlayer(playerIndex).hand.filter(Boolean).length;
  const sourceCardId = source?.cardId ?? source?.card?.id ?? null;
  const sourceCardName = source?.card?.name ?? null;
  const [result] = resolveEffectCommands(session, [
    createWorldsBeyondLeaderHealCommand(playerIndex, amount, {
      sourceCardId,
      sourceCardName,
      reason: "ability"
    })
  ]);
  return Boolean(result?.applied);
}

function buffAlliedFollowers(session, playerIndex, source, effect) {
  const followers = session.getPlayer(playerIndex).board.filter(unit => cardType(unit) === "follower");
  let applied = false;
  for (const unit of followers) {
    if (effect.excludeSource && unit.instanceId === source?.instanceId) continue;
    const attack = Math.max(0, Number(effect.attack) || 0);
    const defense = Math.max(0, Number(effect.defense) || 0);
    unit.attack = currentAttack(unit) + attack;
    unit.maxDefense = currentMaxDefense(unit) + defense;
    unit.defense = currentDefense(unit) + defense;
    session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
      actor: playerIndex,
      payload: {
        card: session.cardView(unit),
        attack,
        defense,
        reason: "ability",
        source: source ? session.cardView(source) : null
      }
    });
    applied = true;
  }
  return applied;
}

function grantAlliedBarrier(session, playerIndex) {
  let applied = false;
  for (const unit of session.getPlayer(playerIndex).board.filter(card => cardType(card) === "follower")) {
    applied = grantWorldsBeyondKeyword(unit, "Barrier") || applied;
  }
  return applied;
}

function grantSelfBarrier(session, playerIndex, source) {
  const follower = source?.instanceId ? session.findBoardCard(playerIndex, source.instanceId) : null;
  if (!follower || cardType(follower) !== "follower") return false;
  const granted = grantWorldsBeyondKeyword(follower, "Barrier");
  if (!granted) return false;
  session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
    actor: playerIndex,
    payload: {
      card: session.cardView(follower),
      attack: 0,
      defense: 0,
      keywords: ["Barrier"],
      reason: "ability-keyword",
      source: session.cardView(source)
    }
  });
  return true;
}

function gainMaximumPlayPoints(session, playerIndex, amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return false;
  const player = session.getPlayer(playerIndex);
  const before = Math.max(0, Number(player.resources?.maxPp ?? 0));
  const cap = Math.max(before, Number(session.ruleset?.maxPp ?? 10) || 10);
  const after = Math.min(cap, before + value);
  if (after === before) return false;
  player.resources.maxPp = after;
  return true;
}

function recoverEvolutionPoints(session, playerIndex, amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return false;
  const player = session.getPlayer(playerIndex);
  const before = Math.max(0, Number(player.resources?.evolutionPoints ?? 0));
  const starting = session.ruleset?.startingEvolutionPoints ?? {};
  const cap = Math.max(0, Number(starting[player.goingFirst ? "first" : "second"] ?? 2) || 2);
  const after = Math.min(cap, before + value);
  player.resources.evolutionPoints = after;
  return after > before;
}

function addGeneratedCardToHand(session, playerIndex, cardName) {
  const definition = session.findCardDefinition({ name: cardName });
  if (!definition) return false;
  const result = addWorldsBeyondGeneratedCard(session, playerIndex, definition, { reason: "ability" });
  return Boolean(result.added || result.burned);
}

function destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) {
  const enemyIndex = 1 - playerIndex;
  const targetIds = session.getPlayer(enemyIndex).board
    .filter(unit => cardType(unit) === "follower" && currentDefense(unit) < currentMaxDefense(unit))
    .map(unit => unit.instanceId);
  let applied = false;
  for (const instanceId of targetIds) {
    const live = session.findBoardCard(enemyIndex, instanceId);
    if (!live) continue;
    const destroyed = destroyFollower?.(session, enemyIndex, instanceId, {
      actor: playerIndex,
      source,
      reason: "ability",
      byAbility: true,
      abilityDestroy: true
    });
    applied = Boolean(destroyed) || applied;
  }
  return applied;
}

function debuffEnemyFollowers(session, playerIndex, source, effect, destroyFollower) {
  const enemyIndex = 1 - playerIndex;
  const targets = [...session.getPlayer(enemyIndex).board].filter(unit => cardType(unit) === "follower");
  if (!targets.length) return false;

  for (const unit of targets) {
    if (!session.findBoardCard(enemyIndex, unit.instanceId)) continue;
    const beforeAttack = currentAttack(unit);
    const beforeDefense = currentDefense(unit);
    const beforeMaxDefense = currentMaxDefense(unit);
    unit.attack = Math.max(0, beforeAttack - Math.max(0, Number(effect.attack) || 0));
    unit.defense = Math.max(0, beforeDefense - Math.max(0, Number(effect.defense) || 0));
    unit.maxDefense = Math.max(0, beforeMaxDefense - Math.max(0, Number(effect.defense) || 0));
    session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
      actor: playerIndex,
      payload: {
        card: session.cardView(unit),
        attack: unit.attack - beforeAttack,
        defense: unit.defense - beforeDefense,
        reason: "ability",
        source: source ? session.cardView(source) : null
      }
    });
  }

  for (const unit of targets) {
    const live = session.findBoardCard(enemyIndex, unit.instanceId);
    if (!live || currentDefense(live) > 0) continue;
    destroyFollower?.(session, enemyIndex, live.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
  }
  return true;
}

function damageLeadersSimultaneously(session, targetPlayerIndexes, amount, { actor, source } = {}) {
  const targets = [...new Set(targetPlayerIndexes)].filter(index => index === 0 || index === 1);
  const damage = Math.max(0, Number(amount) || 0);
  if (!targets.length || !damage || session.phase === "ended") return false;

  const lethal = [];
  for (const targetPlayer of targets) {
    const player = session.getPlayer(targetPlayer);
    player.hp = Math.max(0, Number(player.hp ?? 0) - damage);
    session.emit(BATTLE_EVENT.LEADER_DAMAGE, {
      actor,
      payload: {
        targetPlayer,
        amount: damage,
        hp: player.hp,
        source: source ? session.cardView(source) : null,
        reason: "ability"
      }
    });
    if (player.hp <= 0) lethal.push(targetPlayer);
  }

  if (lethal.length) {
    const loser = lethal.length > 1 ? session.activePlayer : lethal[0];
    session.finishMatch(1 - loser, "leader-defense-zero", {
      loser,
      losers: lethal,
      simultaneous: lethal.length > 1
    });
  }
  return true;
}

function hasCardTrait(instance, traitName) {
  const target = String(traitName ?? "").trim().toLowerCase();
  if (!target) return false;
  const traits = instance?.card?.traits ?? instance?.traits ?? [];
  return (Array.isArray(traits) ? traits : [traits]).some(trait => String(trait ?? "").trim().toLowerCase() === target);
}

function cardType(instance) {
  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}

function currentAttack(instance) {
  return Number(instance?.attack ?? (Number(instance?.card?.attack ?? 0) + Number(instance?.attackBonus ?? 0)));
}

function currentDefense(instance) {
  return Number(instance?.defense ?? (Number(instance?.card?.defense ?? 0) + Number(instance?.defenseBonus ?? 0)));
}

function currentMaxDefense(instance) {
  return Number(instance?.maxDefense ?? currentDefense(instance));
}

function numberWord(value) {
  if (/^\d+$/.test(String(value))) return Number(value);
  return ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[String(value).toLowerCase()] ?? 0;
}
