import { BATTLE_EVENT } from "../../battle-events.js";
import { restoreOriginalCardForm } from "../../zone-actions.js";
import { advanceWorldsBeyondAmuletCountdown, destroyWorldsBeyondAmulet } from "./amulets.js";
import { applyWorldsBeyondCombatAction } from "./combat-actions.js";
import { hasWorldsBeyondKeyword } from "./combat-readiness.js";
import {
  canSkipWorldsBeyondHandDiscard,
  destroyWorldsBeyondFollower,
  gainWorldsBeyondShadows,
  getWorldsBeyondTargetOptions,
  getWorldsBeyondTargetRequirement,
  getWorldsBeyondTriggerSupport,
  requiresWorldsBeyondHandDiscard,
  resolveWorldsBeyondTrigger
} from "./effect-resolver.js";
import { getWorldsBeyondEngageAdvanceAmount, getWorldsBeyondEngageInfo } from "./engage.js";
import {
  getWorldsBeyondFuseActions,
  hasWorldsBeyondTrait,
  resolveWorldsBeyondFuse
} from "./fuse.js";
import { modes as v5Modes } from "./v5/battle-engine-v5-modes.js";

export const SVWB_ACTION = Object.freeze({
  PLAY_CARD: "play-card",
  FUSE: "fuse",
  ENGAGE: "engage",
  ATTACK: "attack",
  EVOLVE: "evolve",
  SUPER_EVOLVE: "super-evolve"
});

export function applyWorldsBeyondAction(session, action) {
  switch (action.type) {
    case SVWB_ACTION.PLAY_CARD: return playCard(session, action);
    case SVWB_ACTION.FUSE: return fuse(session, action);
    case SVWB_ACTION.ENGAGE: return engage(session, action);
    case SVWB_ACTION.ATTACK: return applyWorldsBeyondCombatAction(session, action);
    case SVWB_ACTION.EVOLVE: return evolve(session, action, false);
    case SVWB_ACTION.SUPER_EVOLVE: return evolve(session, action, true);
    default: throw new Error(`Unsupported Worlds Beyond action: ${action.type}`);
  }
}

export function prepareWorldsBeyondTurn(player) {
  player.cardsPlayedThisTurn = 0;
  player.spellsPlayedThisTurn = 0;
  player.evolutionActionUsed = false;
  if (player.resources) player.resources.combo = 0;
  for (const unit of player.board) {
    if (cardType(unit) === "amulet") {
      unit.engagedThisTurn = false;
      continue;
    }
    if (cardType(unit) !== "follower") continue;
    unit.attacksRemaining = 1;
    unit.hasAttacked = false;
    unit.canAttackFollowers = true;
    unit.canAttackLeader = true;
  }
  for (const item of player.hand) item.fusedThisTurn = false;
}

export function listWorldsBeyondActions(session, playerIndex) {
  if (session.phase !== "main" || session.activePlayer !== playerIndex || session.winner != null) return [];
  const player = session.getPlayer(playerIndex);
  const actions = [...getWorldsBeyondFuseActions(session, playerIndex)];

  for (const card of player.hand) {
    for (const mode of playModes(card, player)) {
      const type = effectivePlayType(card, mode);
      const needsBoard = type === "follower" || type === "amulet";
      if (needsBoard && player.board.length >= session.ruleset.maxBoardSize) continue;
      if (type === "spell" && !getWorldsBeyondTriggerSupport(card, "play", mode, player).supported) continue;

      const baseAction = {
        type: SVWB_ACTION.PLAY_CARD,
        player: playerIndex,
        cardInstanceId: card.instanceId,
        cost: mode.cost,
        playModeKey: modeKey(mode),
        playMode: modeView(mode),
        effectiveType: type
      };
      const targetRequirement = getWorldsBeyondTargetRequirement(card, "play", mode, player);
      const discardRequired = requiresWorldsBeyondHandDiscard(card, "play", mode, player);
      const discardOptions = discardRequired ? handDiscardOptions(player, card) : [null];
      if (discardRequired && !discardOptions.length) continue;

      if (!targetRequirement) {
        for (const discard of discardOptions) actions.push(withDiscardSelection(baseAction, discard, discardRequired));
        continue;
      }

      const targets = getWorldsBeyondTargetOptions(session, { trigger: "play", playerIndex, source: card, mode });
      if (targets.length) {
        for (const target of targets) {
          for (const discard of discardOptions) {
            actions.push(withDiscardSelection({
              ...baseAction,
              targetInstanceId: target.instanceId,
              targetKind: targetRequirement.kind,
              targetAmount: targetRequirement.amount ?? 0
            }, discard, discardRequired));
          }
        }
      } else if (type !== "spell") {
        for (const discard of discardOptions) actions.push(withDiscardSelection(baseAction, discard, discardRequired));
      }
    }
  }

  for (const amulet of player.board) {
    if (cardType(amulet) !== "amulet" || amulet.engagedThisTurn) continue;
    const info = getWorldsBeyondEngageInfo(amulet);
    if (!info || info.cost > Number(player.resources.pp ?? 0)) continue;
    if (!getWorldsBeyondTriggerSupport(amulet, "engage", null, player).supported) continue;
    const baseAction = {
      type: SVWB_ACTION.ENGAGE,
      player: playerIndex,
      amuletInstanceId: amulet.instanceId,
      cost: info.cost
    };
    const targetRequirement = getWorldsBeyondTargetRequirement(amulet, "engage", null, player);
    const discardRequired = requiresWorldsBeyondHandDiscard(amulet, "engage", null, player);
    const discardCanSkip = discardRequired && canSkipWorldsBeyondHandDiscard(amulet, "engage", null, player);
    const discardCandidates = discardRequired ? handDiscardOptions(player, amulet) : [null];
    if (discardRequired && !discardCandidates.length && !discardCanSkip) continue;
    const discardOptions = discardRequired && !discardCandidates.length ? [null] : discardCandidates;

    if (!targetRequirement) {
      for (const discard of discardOptions) actions.push(withDiscardSelection(baseAction, discard, discardRequired));
      continue;
    }
    const targets = getWorldsBeyondTargetOptions(session, { trigger: "engage", playerIndex, source: amulet });
    if (!targets.length) continue;
    for (const target of targets) {
      for (const discard of discardOptions) {
        actions.push(withDiscardSelection({
          ...baseAction,
          targetInstanceId: target.instanceId,
          targetKind: targetRequirement.kind,
          targetAmount: targetRequirement.amount ?? 0
        }, discard, discardRequired));
      }
    }
  }

  for (const unit of player.board) {
    if (cardType(unit) !== "follower") continue;
    if (!unit.evolved && !player.evolutionActionUsed && player.resources.evolutionAvailable && player.resources.evolutionPoints > 0) {
      actions.push({ type: SVWB_ACTION.EVOLVE, player: playerIndex, followerInstanceId: unit.instanceId });
    }
    if (!unit.evolved && !player.evolutionActionUsed && player.resources.superEvolutionAvailable && player.resources.superEvolutionPoints > 0) {
      actions.push({ type: SVWB_ACTION.SUPER_EVOLVE, player: playerIndex, followerInstanceId: unit.instanceId });
    }
  }
  return actions;
}

function playCard(session, action) {
  const playerIndex = assertMainActor(session, action.player);
  const player = session.getPlayer(playerIndex);
  const index = player.hand.findIndex(card => card.instanceId === action.cardInstanceId);
  if (index < 0) throw new Error("Card is not in the active player's hand");
  const instance = player.hand[index];
  const availableModes = playModes(instance, player);
  const mode = selectPlayMode(availableModes, action);
  if (!mode) throw new Error("Selected play mode is not legal");
  const type = effectivePlayType(instance, mode);
  const cost = Number(mode.cost) || 0;
  if (cost > player.resources.pp) throw new Error(`Not enough PP to play ${instance.card?.name ?? "card"}`);
  if ((type === "follower" || type === "amulet") && player.board.length >= session.ruleset.maxBoardSize) throw new Error("The board is full");
  if (!new Set(["follower", "spell", "amulet"]).has(type)) throw new Error(`Unsupported card type: ${instance.card?.type ?? "unknown"}`);
  if (type === "spell" && !getWorldsBeyondTriggerSupport(instance, "play", mode, player).supported) {
    throw new Error("This spell effect is not fully supported by the Worlds Beyond resolver");
  }

  const requirement = getWorldsBeyondTargetRequirement(instance, "play", mode, player);
  const targets = requirement ? getWorldsBeyondTargetOptions(session, { trigger: "play", playerIndex, source: instance, mode }) : [];
  const discardRequired = requiresWorldsBeyondHandDiscard(instance, "play", mode, player);
  validateDiscardSelection(player, instance, discardRequired, action.discardInstanceId);
  if (targets.length && !action.targetInstanceId) throw new Error("This card requires an effect target");
  if (action.targetInstanceId && !targets.some(target => target.instanceId === action.targetInstanceId)) throw new Error("Selected effect target is not legal");
  if (requirement && type === "spell" && !targets.length) throw new Error("This spell has no legal target");

  player.resources.pp -= cost;
  player.hand.splice(index, 1);
  player.cardsPlayedThisTurn = Number(player.cardsPlayedThisTurn ?? 0) + 1;
  player.resources.combo = player.cardsPlayedThisTurn;
  if (type === "spell") player.spellsPlayedThisTurn = Number(player.spellsPlayedThisTurn ?? 0) + 1;

  if (isAlternativeMode(mode)) activateAlternativeForm(instance, mode, type);
  session.emit(BATTLE_EVENT.CARD_PLAY, {
    actor: playerIndex,
    payload: {
      card: session.cardView(instance),
      cost,
      ppRemaining: player.resources.pp,
      type,
      mode: mode.kind,
      enhanced: Boolean(mode.enhanced),
      accelerated: Boolean(mode.accelerated),
      crystallized: Boolean(mode.crystallized || mode.kind === "crystallize"),
      modeIndex: Number(mode.modeIndex ?? 0)
    }
  });

  if (type === "follower") {
    prepareFollower(instance, session.turn);
    player.board.push(instance);
    session.emit(BATTLE_EVENT.FOLLOWER_ENTER, { actor: playerIndex, payload: { card: session.cardView(instance), position: player.board.length - 1 } });
  } else if (type === "amulet") {
    instance.countdown = readCountdown(mode.text || instance.card?.text);
    instance.playedTurn = session.turn;
    instance.engagedThisTurn = false;
    player.board.push(instance);
    session.emit(BATTLE_EVENT.AMULET_ENTER, { actor: playerIndex, payload: { card: session.cardView(instance), position: player.board.length - 1, countdown: instance.countdown, mode: mode.kind } });
  } else {
    player.cemetery.push(instance);
    session.emit(BATTLE_EVENT.SPELL_CAST, { actor: playerIndex, payload: { card: session.cardView(instance), mode: mode.kind } });
  }

  resolveWorldsBeyondTrigger(session, {
    trigger: "play",
    playerIndex,
    source: instance,
    targetInstanceId: action.targetInstanceId ?? null,
    discardInstanceId: action.discardInstanceId ?? null,
    mode
  });
  if (type === "spell") gainWorldsBeyondShadows(session, playerIndex, 1);
  if (mode.accelerated || mode.kind === "accelerate") restoreOriginalCardForm(instance);
  return session.getSnapshot(playerIndex);
}

function fuse(session, action) {
  const result = resolveWorldsBeyondFuse(session, action, {
    afterMaterials: ({ playerIndex, materials }) => applyFuseReactiveEffects(session, playerIndex, materials)
  });
  return result.snapshot;
}

function applyFuseReactiveEffects(session, playerIndex, materials) {
  const player = session.getPlayer(playerIndex);
  const enemyIndex = 1 - playerIndex;

  for (const cannon of player.board.filter(unit => cardType(unit) === "amulet" && normalizeName(unit.card?.name) === "ancient cannon")) {
    const target = randomEnemyFollower(session, enemyIndex);
    if (!target) continue;
    session.damageFollower(enemyIndex, target.instanceId, 2, { actor: playerIndex, source: cannon, reason: "fuse-reaction", resolveDeath: false });
    if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, source: cannon, reason: "fuse-reaction", byAbility: true });
  }

  const lootMaterials = materials.filter(item => hasWorldsBeyondTrait(item.card, "Loot"));
  if (!lootMaterials.length) return;
  for (const congregant of player.board.filter(unit => cardType(unit) === "follower" && normalizeName(unit.card?.name) === "congregant of usurpation")) {
    for (const material of lootMaterials) {
      const target = randomEnemyFollower(session, enemyIndex);
      if (!target) break;
      session.damageFollower(enemyIndex, target.instanceId, 3, { actor: playerIndex, source: congregant, reason: `fuse-${material.card?.name ?? "loot"}`, resolveDeath: false });
      if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, source: congregant, reason: "fuse-reaction", byAbility: true });
    }
  }
}

function engage(session, action) {
  const playerIndex = assertMainActor(session, action.player);
  const player = session.getPlayer(playerIndex);
  const amulet = player.board.find(item => item.instanceId === action.amuletInstanceId);
  if (!amulet || cardType(amulet) !== "amulet") throw new Error("Engage source is not an allied amulet");
  if (amulet.engagedThisTurn) throw new Error("This amulet has already Engaged this turn");
  const info = getWorldsBeyondEngageInfo(amulet);
  if (!info) throw new Error("This amulet has no Engage ability");
  if (info.cost > Number(player.resources.pp ?? 0)) throw new Error("Not enough PP to Engage this amulet");
  if (!getWorldsBeyondTriggerSupport(amulet, "engage", null, player).supported) {
    throw new Error("This Engage effect is not fully supported by the Worlds Beyond resolver");
  }

  const requirement = getWorldsBeyondTargetRequirement(amulet, "engage", null, player);
  const targets = requirement ? getWorldsBeyondTargetOptions(session, { trigger: "engage", playerIndex, source: amulet }) : [];
  const discardRequired = requiresWorldsBeyondHandDiscard(amulet, "engage", null, player);
  const discardCanSkip = discardRequired && canSkipWorldsBeyondHandDiscard(amulet, "engage", null, player);
  validateDiscardSelection(player, amulet, discardRequired, action.discardInstanceId, { allowMissing: discardCanSkip });
  if (targets.length && !action.targetInstanceId) throw new Error("This Engage ability requires a target");
  if (action.targetInstanceId && !targets.some(target => target.instanceId === action.targetInstanceId)) throw new Error("Selected Engage target is not legal");
  if (requirement && !targets.length) throw new Error("This Engage ability has no legal target");

  player.resources.pp -= info.cost;
  amulet.engagedThisTurn = true;
  const targetOwner = requirement?.targetSide === "allied" ? playerIndex : 1 - playerIndex;
  session.emit(BATTLE_EVENT.ENGAGE, {
    actor: playerIndex,
    payload: {
      card: session.cardView(amulet),
      cost: info.cost,
      ppRemaining: player.resources.pp,
      target: action.targetInstanceId ? session.cardView(session.findBoardCard(targetOwner, action.targetInstanceId)) : null,
      discardRequired,
      discardSkipped: discardCanSkip && !action.discardInstanceId
    }
  });

  const advanceAmount = getWorldsBeyondEngageAdvanceAmount(info, player);
  if (info.advanceCountdown && session.findBoardCard(playerIndex, amulet.instanceId)) {
    advanceWorldsBeyondAmuletCountdown(session, playerIndex, amulet.instanceId, advanceAmount, {
      actor: playerIndex,
      source: amulet,
      reason: "engage"
    });
    if (session.phase === "ended") return session.getSnapshot(playerIndex);
  }

  resolveWorldsBeyondTrigger(session, {
    trigger: "engage",
    playerIndex,
    source: amulet,
    targetInstanceId: action.targetInstanceId ?? null,
    discardInstanceId: action.discardInstanceId ?? null
  });

  if (info.destroySource && session.findBoardCard(playerIndex, amulet.instanceId)) {
    destroyWorldsBeyondAmulet(session, playerIndex, amulet.instanceId, {
      actor: playerIndex,
      source: amulet,
      reason: "engage"
    });
  }
  return session.getSnapshot(playerIndex);
}

function evolve(session, action, superEvolution) {
  const playerIndex = assertMainActor(session, action.player);
  const player = session.getPlayer(playerIndex);
  const follower = player.board.find(unit => unit.instanceId === action.followerInstanceId);
  if (!follower || cardType(follower) !== "follower") throw new Error("Evolution target is not an allied follower");
  if (follower.evolved) throw new Error("Follower is already evolved");
  if (player.evolutionActionUsed) throw new Error("An evolution action was already used this turn");
  const availableKey = superEvolution ? "superEvolutionAvailable" : "evolutionAvailable";
  const pointsKey = superEvolution ? "superEvolutionPoints" : "evolutionPoints";
  if (!player.resources[availableKey]) throw new Error(superEvolution ? "Super Evolution is not available yet" : "Evolution is not available yet");
  if (Number(player.resources[pointsKey] ?? 0) <= 0) throw new Error(superEvolution ? "No Super Evolution points remain" : "No Evolution points remain");
  const bonus = superEvolution ? 3 : 2;
  follower.attack = currentAttack(follower) + bonus;
  follower.maxDefense = currentMaxDefense(follower) + bonus;
  follower.defense = Number(follower.defense ?? currentMaxDefense(follower)) + bonus;
  follower.evolved = true;
  follower.superEvolved = superEvolution;
  follower.imageOverride = follower.card?.evolved?.image ?? follower.imageOverride ?? null;
  if (Number(follower.attacksRemaining ?? 0) > 0) follower.canAttackFollowers = true;
  player.resources[pointsKey] -= 1;
  player.evolutionActionUsed = true;
  session.emit(superEvolution ? BATTLE_EVENT.SUPER_EVOLVE : BATTLE_EVENT.EVOLVE, { actor: playerIndex, payload: { card: session.cardView(follower), pointsRemaining: player.resources[pointsKey], statBonus: bonus } });
  resolveWorldsBeyondTrigger(session, { trigger: superEvolution ? "super-evolve" : "evolve", playerIndex, source: follower });
  return session.getSnapshot(playerIndex);
}

function handDiscardOptions(player, source) {
  return player.hand.filter(item => item.instanceId !== source?.instanceId);
}

function withDiscardSelection(action, discard, required) {
  if (!required || !discard) return action;
  return {
    ...action,
    discardInstanceId: discard.instanceId,
    discardCardId: discard.cardId ?? discard.card?.id ?? null
  };
}

function validateDiscardSelection(player, source, required, discardInstanceId, { allowMissing = false } = {}) {
  if (!required) {
    if (discardInstanceId) throw new Error("This action does not require a discard selection");
    return null;
  }
  if (!discardInstanceId) {
    if (allowMissing) return null;
    throw new Error("This action requires a card to discard");
  }
  const discard = player.hand.find(item => item.instanceId === discardInstanceId && item.instanceId !== source?.instanceId) ?? null;
  if (!discard) throw new Error("Selected discard card is not in the active player's hand");
  return discard;
}

function playModes(instance, player) {
  return v5Modes(instance, {
    ...player,
    pp: Number(player.resources?.pp ?? 0),
    crests: player.resources?.crests ?? player.crests ?? []
  });
}

function selectPlayMode(availableModes, action) {
  if (!availableModes.length) return null;
  if (action.playModeKey) return availableModes.find(mode => modeKey(mode) === action.playModeKey) ?? null;
  if (availableModes.length === 1) return availableModes[0];
  if (action.cost != null) {
    const byCost = availableModes.filter(mode => Number(mode.cost) === Number(action.cost));
    if (byCost.length === 1) return byCost[0];
  }
  return null;
}

function modeKey(mode) {
  return [mode.kind, Number(mode.cost) || 0, Number(mode.modeIndex) || 0, mode.enhanced ? 1 : 0, mode.accelerated ? 1 : 0, mode.crystallized ? 1 : 0].join(":");
}

function modeView(mode) {
  return {
    kind: mode.kind,
    cost: Number(mode.cost) || 0,
    modeIndex: Number(mode.modeIndex) || 0,
    selectedModeCount: Number(mode.selectedModeCount) || 0,
    enhanced: Boolean(mode.enhanced),
    accelerated: Boolean(mode.accelerated),
    crystallized: Boolean(mode.crystallized || mode.kind === "crystallize")
  };
}

function effectivePlayType(instance, mode) {
  if (mode.accelerated || mode.kind === "accelerate") return "spell";
  if (mode.crystallized || mode.kind === "crystallize") return "amulet";
  return cardType(instance);
}

function isAlternativeMode(mode) {
  return Boolean(mode.accelerated || mode.crystallized || mode.kind === "accelerate" || mode.kind === "crystallize");
}

function activateAlternativeForm(instance, mode, type) {
  if (!instance.originalCard) instance.originalCard = instance.card;
  instance.activeText = String(mode.text ?? "");
  instance.alternativeMode = mode.kind;
  instance.card = { ...instance.card, type: type === "spell" ? "Spell" : "Amulet", text: instance.activeText };
}

function prepareFollower(instance, turn) {
  const baseAttack = Number(instance.card?.attack ?? 0) + Number(instance.attackBonus ?? 0);
  const baseDefense = Number(instance.card?.defense ?? 0) + Number(instance.defenseBonus ?? 0);
  instance.attack = baseAttack;
  instance.defense = baseDefense;
  instance.maxDefense = baseDefense;
  instance.playedTurn = turn;
  instance.evolved = false;
  instance.superEvolved = false;
  instance.attacksRemaining = 1;
  instance.hasAttacked = false;
  instance.canAttackFollowers = hasWorldsBeyondKeyword(instance, "Rush") || hasWorldsBeyondKeyword(instance, "Storm");
  instance.canAttackLeader = hasWorldsBeyondKeyword(instance, "Storm");
}

function randomEnemyFollower(session, playerIndex) {
  const targets = session.getPlayer(playerIndex).board.filter(unit => cardType(unit) === "follower");
  if (!targets.length) return null;
  return targets[Math.floor(session.rng() * targets.length)] ?? targets[0];
}

function assertMainActor(session, playerIndex) {
  if (session.phase !== "main") throw new Error(`Expected phase main, got ${session.phase}`);
  if (session.winner != null) throw new Error("The match has ended");
  if (playerIndex !== 0 && playerIndex !== 1) throw new Error(`Invalid player index: ${playerIndex}`);
  if (session.activePlayer !== playerIndex) throw new Error(`It is not player ${playerIndex}'s turn`);
  return playerIndex;
}
function currentAttack(instance) { return Number(instance.attack ?? (Number(instance.card?.attack ?? 0) + Number(instance.attackBonus ?? 0))); }
function currentMaxDefense(instance) { return Number(instance.maxDefense ?? (Number(instance.card?.defense ?? 0) + Number(instance.defenseBonus ?? 0))); }
function cardType(instance) { return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase(); }
function normalizeName(value) { return String(value ?? "").trim().toLowerCase(); }
function readCountdown(text) { const value = String(text ?? "").match(/Countdown\s*\(?\s*(\d+)\s*\)?/i)?.[1]; return value == null ? null : Number(value); }