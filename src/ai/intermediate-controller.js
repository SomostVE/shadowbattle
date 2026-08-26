import { chooseIntermediateAction, getAiSkillProfile } from "./skill-profile.js";

const DEFAULT_STRATEGY = Object.freeze({
  faceBias: 0.5,
  tradeBias: 0.5,
  mulliganMaxCost: 3
});

export function createIntermediateController({
  seed = "shadowbattle-intermediate",
  profile = getAiSkillProfile("intermediate"),
  strategy = DEFAULT_STRATEGY
} = {}) {
  const rng = createRng(seed);
  const normalizedStrategy = normalizeStrategy(strategy);

  return Object.freeze({
    id: "svwb-intermediate",
    profile,
    strategy: Object.freeze({ ...normalizedStrategy }),
    chooseAction(session, playerIndex) {
      return chooseIntermediateGameAction(session, playerIndex, {
        profile,
        strategy: normalizedStrategy,
        rng
      });
    },
    chooseMulligan(session, playerIndex) {
      return chooseIntermediateMulligan(session, playerIndex, { strategy: normalizedStrategy });
    },
    shouldUseBonusPp(session, playerIndex) {
      return shouldUseIntermediateBonusPp(session, playerIndex, { strategy: normalizedStrategy });
    }
  });
}

export function chooseIntermediateGameAction(session, playerIndex, {
  profile = getAiSkillProfile("intermediate"),
  strategy = DEFAULT_STRATEGY,
  rng = Math.random
} = {}) {
  const ranked = evaluateIntermediateActions(session, playerIndex, { strategy });
  if (!ranked.length) return null;
  if (ranked[0].score < Number(profile.actionFloor ?? 0)) return null;

  const chosen = chooseIntermediateAction(ranked, { profile, rng });
  if (!chosen) return null;
  return {
    action: chosen.action,
    score: chosen.score,
    reasons: [...chosen.reasons],
    alternatives: ranked.slice(0, Math.max(1, Number(profile.explanationLimit) || 4)).map(candidate => ({
      action: candidate.action,
      score: candidate.score,
      reasons: [...candidate.reasons]
    }))
  };
}

export function evaluateIntermediateActions(session, playerIndex, { strategy = DEFAULT_STRATEGY } = {}) {
  if (!session || session.phase !== "main" || session.activePlayer !== playerIndex || session.winner != null) return [];
  const view = session.getSnapshot(playerIndex);
  const actions = session.listLegalActions(playerIndex);
  const context = createDecisionContext(view, playerIndex, normalizeStrategy(strategy));

  return actions
    .map((action, index) => {
      const evaluation = scoreAction(action, context);
      return {
        id: actionKey(action, index),
        action,
        legal: true,
        score: roundScore(evaluation.score),
        reasons: evaluation.reasons
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function chooseIntermediateMulligan(session, playerIndex, { strategy = DEFAULT_STRATEGY } = {}) {
  if (!session || session.phase !== "mulligan") return [];
  const view = session.getSnapshot(playerIndex);
  const player = view.players?.[playerIndex];
  if (!player || player.mulliganDone) return [];

  const threshold = Math.max(0, Number(normalizeStrategy(strategy).mulliganMaxCost) || 0);
  const hand = (player.hand ?? []).filter(Boolean);
  if (!hand.length) return [];

  const cheap = hand.filter(card => Number(card.cost ?? 0) <= threshold);
  const keepFallback = cheap.length ? null : [...hand].sort((a, b) => Number(a.cost ?? 0) - Number(b.cost ?? 0))[0];
  return hand
    .filter(card => card !== keepFallback && Number(card.cost ?? 0) > threshold)
    .map(card => card.instanceId);
}

export function shouldUseIntermediateBonusPp(session, playerIndex, { strategy = DEFAULT_STRATEGY } = {}) {
  if (!session || session.phase !== "main" || session.activePlayer !== playerIndex || session.winner != null) return false;
  const view = session.getSnapshot(playerIndex);
  const player = view.players?.[playerIndex];
  if (!player?.resources?.bonusPpAvailable) return false;

  const pp = Number(player.resources.pp ?? 0);
  const boardOpen = (player.board?.length ?? 0) < 5;
  const unlocks = (player.hand ?? []).filter(Boolean).filter(card => {
    if (Number(card.cost ?? 0) !== pp + 1) return false;
    const type = normalize(card.type);
    return type === "spell" || boardOpen;
  });
  if (!unlocks.length) return false;

  const normalizedStrategy = normalizeStrategy(strategy);
  const bestUnlock = Math.max(...unlocks.map(card => visibleCardValue(card)));
  const currentActions = evaluateIntermediateActions(session, playerIndex, { strategy: normalizedStrategy });
  const currentBest = currentActions[0]?.score ?? 0;
  return bestUnlock * (0.8 + normalizedStrategy.faceBias * 0.2) > currentBest + 0.35;
}

function createDecisionContext(view, playerIndex, strategy) {
  const player = view.players?.[playerIndex] ?? {};
  const enemy = view.players?.[1 - playerIndex] ?? {};
  return {
    playerIndex,
    enemyIndex: 1 - playerIndex,
    player,
    enemy,
    strategy,
    ownHand: indexByInstance(player.hand),
    ownBoard: indexByInstance(player.board),
    enemyBoard: indexByInstance(enemy.board)
  };
}

function scoreAction(action, context) {
  switch (action?.type) {
    case "attack": return scoreAttack(action, context);
    case "play-card": return scorePlay(action, context);
    case "engage": return scoreEngage(action, context);
    case "evolve": return scoreEvolution(action, context, false);
    case "super-evolve": return scoreEvolution(action, context, true);
    case "fuse": return scoreFuse(action, context);
    default: return { score: 0, reasons: ["unknown-action"] };
  }
}

function scoreAttack(action, context) {
  const attacker = context.ownBoard.get(action.attackerInstanceId);
  if (!attacker) return { score: -100, reasons: ["missing-attacker"] };
  const attack = Math.max(0, Number(attacker.attack ?? 0));
  const reasons = [];

  if (action.target === "leader" || !action.targetInstanceId) {
    if (attack >= Number(context.enemy.hp ?? 0)) return { score: 1000 + attack, reasons: ["lethal"] };
    const pressure = attack * (1.6 + context.strategy.faceBias * 2.5);
    const closing = Math.max(0, 10 - Number(context.enemy.hp ?? 20)) * context.strategy.faceBias * 0.18;
    reasons.push("leader-pressure");
    return { score: 2.1 + pressure + closing, reasons };
  }

  const target = context.enemyBoard.get(action.targetInstanceId);
  if (!target) return { score: -100, reasons: ["missing-target"] };
  const targetValue = visibleCardValue(target);
  const attackerValue = visibleCardValue(attacker);
  const kills = attack >= Number(target.defense ?? 0);
  const survives = Number(attacker.defense ?? 0) > Number(target.attack ?? 0);
  let score = 1.2 + targetValue * (0.55 + context.strategy.tradeBias * 1.25);
  if (kills) {
    score += 2.2;
    reasons.push("removes-follower");
  }
  if (survives) {
    score += Math.min(2, attackerValue * 0.22);
    reasons.push("favorable-trade");
  } else if (kills) {
    score -= attackerValue * 0.28;
    reasons.push("trade-off");
  }
  return { score, reasons: reasons.length ? reasons : ["board-trade"] };
}

function scorePlay(action, context) {
  const card = context.ownHand.get(action.cardInstanceId);
  if (!card) return { score: -100, reasons: ["missing-hand-card"] };
  const pp = Math.max(1, Number(context.player.resources?.pp ?? 0));
  const cost = Math.max(0, Number(action.cost ?? card.cost ?? 0));
  const reasons = ["develop"];
  let score = 2.25 + cost * 0.55 + Math.min(1.5, cost / pp * 1.5);

  if (normalize(action.effectiveType ?? card.type) === "follower") score += visibleCardValue(card) * 0.32;
  if (action.playMode?.enhanced) {
    score += 1.1;
    reasons.push("enhance");
  } else if (action.playMode?.crystallized) {
    score += 0.4;
    reasons.push("crystallize");
  } else if (action.playMode?.accelerated) {
    score += 0.3;
    reasons.push("accelerate");
  }

  score += targetAdjustment(action, context, reasons);
  if (context.player.handCount >= 8) {
    score += 0.45;
    reasons.push("hand-space");
  }
  return { score, reasons };
}

function scoreEngage(action, context) {
  const reasons = ["engage"];
  let score = 2 + Math.max(0, Number(action.cost ?? 0)) * 0.35;
  score += targetAdjustment(action, context, reasons);
  return { score, reasons };
}

function scoreEvolution(action, context, superEvolution) {
  const follower = context.ownBoard.get(action.followerInstanceId);
  if (!follower) return { score: -100, reasons: ["missing-evolution-source"] };
  const resources = context.player.resources ?? {};
  const points = Number(superEvolution ? resources.superEvolutionPoints : resources.evolutionPoints) || 0;
  const reasons = [superEvolution ? "super-evolve" : "evolve"];
  let score = (superEvolution ? 4 : 3.25) + visibleCardValue(follower) * 0.38;
  if (points <= 1) {
    score -= superEvolution ? 0.9 : 0.55;
    reasons.push("last-evolution-point");
  }
  score += targetAdjustment(action, context, reasons) * 1.15;
  return { score, reasons };
}

function scoreFuse(action, context) {
  const materialCount = action.materialInstanceIds?.length ?? 0;
  const reasons = ["fuse"];
  let score = 0.7 - materialCount * 0.28;
  if (action.projectedTransform) {
    score += 5.4;
    reasons.push("transform");
  }
  if (context.player.handCount >= 8) {
    score += 1.5;
    reasons.push("hand-space");
  }
  if (materialCount === 1) score += 0.25;
  return { score, reasons };
}

function targetAdjustment(action, context, reasons) {
  const id = action.targetInstanceId;
  if (!id) return 0;
  const allied = context.ownBoard.get(id);
  const enemy = context.enemyBoard.get(id);
  const kind = normalize(action.targetKind);

  if (enemy) {
    const value = visibleCardValue(enemy);
    reasons.push("enemy-target");
    if (kind === "damage" || kind === "destroy") return value * (0.45 + context.strategy.tradeBias * 0.55);
    return value * 0.25;
  }
  if (allied) {
    const value = visibleCardValue(allied);
    reasons.push("allied-target");
    if (kind === "damage" || kind === "destroy") return -value * 0.42;
    return value * 0.32;
  }
  return 0;
}

function normalizeStrategy(strategy) {
  return {
    ...DEFAULT_STRATEGY,
    ...(strategy ?? {}),
    faceBias: clamp01(strategy?.faceBias ?? DEFAULT_STRATEGY.faceBias),
    tradeBias: clamp01(strategy?.tradeBias ?? DEFAULT_STRATEGY.tradeBias),
    mulliganMaxCost: Math.max(0, Number(strategy?.mulliganMaxCost ?? DEFAULT_STRATEGY.mulliganMaxCost) || 0)
  };
}

function visibleCardValue(card) {
  if (!card) return 0;
  const attack = Math.max(0, Number(card.attack ?? 0));
  const defense = Math.max(0, Number(card.defense ?? 0));
  return attack * 1.3 + defense * 0.72 + Number(Boolean(card.evolved)) * 0.5 + Number(Boolean(card.superEvolved));
}

function indexByInstance(items) {
  const map = new Map();
  for (const item of items ?? []) if (item?.instanceId) map.set(item.instanceId, item);
  return map;
}

function actionKey(action, index) {
  return [
    action?.type ?? "action",
    action?.cardInstanceId ?? action?.attackerInstanceId ?? action?.followerInstanceId ?? action?.amuletInstanceId ?? action?.targetInstanceId ?? "",
    action?.playModeKey ?? "",
    action?.targetInstanceId ?? action?.target ?? "",
    (action?.materialInstanceIds ?? []).join(","),
    index
  ].join(":");
}

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
