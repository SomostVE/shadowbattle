import { BATTLE_EVENT } from "../../battle-events.js";
import { restoreOriginalCardForm } from "../../zone-actions.js";
import {
  destroyWorldsBeyondFollower,
  gainWorldsBeyondShadows,
  getWorldsBeyondTargetOptions,
  getWorldsBeyondTargetRequirement,
  resolveWorldsBeyondTrigger
} from "./effect-resolver.js";
import { getWorldsBeyondEngageInfo } from "./engage.js";
import { modes as v5Modes } from "./v5/battle-engine-v5-modes.js";

export const SVWB_ACTION = Object.freeze({
  PLAY_CARD: "play-card",
  ENGAGE: "engage",
  ATTACK: "attack",
  EVOLVE: "evolve",
  SUPER_EVOLVE: "super-evolve"
});

export function applyWorldsBeyondAction(session, action) {
  switch (action.type) {
    case SVWB_ACTION.PLAY_CARD: return playCard(session, action);
    case SVWB_ACTION.ENGAGE: return engage(session, action);
    case SVWB_ACTION.ATTACK: return attack(session, action);
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
  const enemy = session.getPlayer(1 - playerIndex);
  const actions = [];

  for (const card of player.hand) {
    for (const mode of playModes(card, player)) {
      const type = effectivePlayType(card, mode);
      const needsBoard = type === "follower" || type === "amulet";
      if (needsBoard && player.board.length >= session.ruleset.maxBoardSize) continue;

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
      if (!targetRequirement) {
        actions.push(baseAction);
        continue;
      }

      const targets = getWorldsBeyondTargetOptions(session, { trigger: "play", playerIndex, source: card, mode });
      if (targets.length) {
        for (const target of targets) {
          actions.push({
            ...baseAction,
            targetInstanceId: target.instanceId,
            targetKind: targetRequirement.kind,
            targetAmount: targetRequirement.amount ?? 0
          });
        }
      } else if (type !== "spell") {
        actions.push(baseAction);
      }
    }
  }

  for (const amulet of player.board) {
    if (cardType(amulet) !== "amulet" || amulet.engagedThisTurn) continue;
    const info = getWorldsBeyondEngageInfo(amulet);
    if (!info || info.cost > Number(player.resources.pp ?? 0)) continue;
    const baseAction = {
      type: SVWB_ACTION.ENGAGE,
      player: playerIndex,
      amuletInstanceId: amulet.instanceId,
      cost: info.cost
    };
    const targetRequirement = getWorldsBeyondTargetRequirement(amulet, "engage", null, player);
    if (!targetRequirement) {
      actions.push(baseAction);
      continue;
    }
    const targets = getWorldsBeyondTargetOptions(session, { trigger: "engage", playerIndex, source: amulet });
    if (!targets.length) continue;
    for (const target of targets) {
      actions.push({
        ...baseAction,
        targetInstanceId: target.instanceId,
        targetKind: targetRequirement.kind,
        targetAmount: targetRequirement.amount ?? 0
      });
    }
  }

  const wards = enemy.board.filter(unit => cardType(unit) === "follower" && hasKeyword(unit, "Ward"));
  for (const unit of player.board) {
    if (cardType(unit) !== "follower" || Number(unit.attacksRemaining ?? 0) <= 0) continue;
    if (unit.canAttackFollowers) {
      for (const target of (wards.length ? wards : enemy.board.filter(item => cardType(item) === "follower"))) {
        actions.push({ type: SVWB_ACTION.ATTACK, player: playerIndex, attackerInstanceId: unit.instanceId, targetInstanceId: target.instanceId });
      }
    }
    if (unit.canAttackLeader && wards.length === 0) actions.push({ type: SVWB_ACTION.ATTACK, player: playerIndex, attackerInstanceId: unit.instanceId, target: "leader" });
    if (!unit.evolved && !player.evolutionActionUsed && player.resources.evolutionAvailable && player.resources.evolutionPoints > 0) actions.push({ type: SVWB_ACTION.EVOLVE, player: playerIndex, followerInstanceId: unit.instanceId });
    if (!unit.evolved && !player.evolutionActionUsed && player.resources.superEvolutionAvailable && player.resources.superEvolutionPoints > 0) actions.push({ type: SVWB_ACTION.SUPER_EVOLVE, player: playerIndex, followerInstanceId: unit.instanceId });
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

  const requirement = getWorldsBeyondTargetRequirement(instance, "play", mode, player);
  const targets = requirement ? getWorldsBeyondTargetOptions(session, { trigger: "play", playerIndex, source: instance, mode }) : [];
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

  resolveWorldsBeyondTrigger(session, { trigger: "play", playerIndex, source: instance, targetInstanceId: action.targetInstanceId ?? null, mode });
  if (type === "spell") gainWorldsBeyondShadows(session, playerIndex, 1);
  if (mode.accelerated || mode.kind === "accelerate") restoreOriginalCardForm(instance);
  return session.getSnapshot(playerIndex);
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

  const requirement = getWorldsBeyondTargetRequirement(amulet, "engage", null, player);
  const targets = requirement ? getWorldsBeyondTargetOptions(session, { trigger: "engage", playerIndex, source: amulet }) : [];
  if (targets.length && !action.targetInstanceId) throw new Error("This Engage ability requires a target");
  if (action.targetInstanceId && !targets.some(target => target.instanceId === action.targetInstanceId)) throw new Error("Selected Engage target is not legal");
  if (requirement && !targets.length) throw new Error("This Engage ability has no legal target");

  player.resources.pp -= info.cost;
  amulet.engagedThisTurn = true;
  session.emit(BATTLE_EVENT.ENGAGE, {
    actor: playerIndex,
    payload: {
      card: session.cardView(amulet),
      cost: info.cost,
      ppRemaining: player.resources.pp,
      target: action.targetInstanceId ? session.cardView(session.findBoardCard(1 - playerIndex, action.targetInstanceId)) : null
    }
  });
  resolveWorldsBeyondTrigger(session, { trigger: "engage", playerIndex, source: amulet, targetInstanceId: action.targetInstanceId ?? null });
  return session.getSnapshot(playerIndex);
}

function attack(session, action) {
  const playerIndex = assertMainActor(session, action.player);
  const enemyIndex = 1 - playerIndex;
  const player = session.getPlayer(playerIndex);
  const enemy = session.getPlayer(enemyIndex);
  const attacker = player.board.find(unit => unit.instanceId === action.attackerInstanceId);
  if (!attacker || cardType(attacker) !== "follower") throw new Error("Attacker is not an allied follower");
  if (Number(attacker.attacksRemaining ?? 0) <= 0) throw new Error("Follower has already attacked this turn");
  const wards = enemy.board.filter(unit => cardType(unit) === "follower" && hasKeyword(unit, "Ward"));
  const targetLeader = action.target === "leader" || !action.targetInstanceId;
  let target = null;
  if (targetLeader) {
    if (!attacker.canAttackLeader) throw new Error("Follower cannot attack the enemy leader yet");
    if (wards.length) throw new Error("An enemy Ward follower must be attacked first");
  } else {
    if (!attacker.canAttackFollowers) throw new Error("Follower cannot attack enemy followers yet");
    target = enemy.board.find(unit => unit.instanceId === action.targetInstanceId);
    if (!target || cardType(target) !== "follower") throw new Error("Attack target is not an enemy follower");
    if (wards.length && !hasKeyword(target, "Ward")) throw new Error("An enemy Ward follower must be attacked first");
  }

  attacker.attacksRemaining = Math.max(0, Number(attacker.attacksRemaining ?? 1) - 1);
  attacker.hasAttacked = true;
  attacker.canAttackLeader = false;
  attacker.canAttackFollowers = false;
  session.emit(BATTLE_EVENT.ATTACK_START, { actor: playerIndex, payload: { attacker: session.cardView(attacker), target: target ? session.cardView(target) : { leader: enemyIndex } } });

  resolveWorldsBeyondTrigger(session, { trigger: "strike", playerIndex, source: attacker });
  if (session.phase === "ended") return session.getSnapshot(playerIndex);
  const liveAttacker = session.findBoardCard(playerIndex, attacker.instanceId);
  if (!liveAttacker) return session.getSnapshot(playerIndex);
  if (target && !session.findBoardCard(enemyIndex, target.instanceId)) return session.getSnapshot(playerIndex);

  if (!target) {
    const amount = currentAttack(liveAttacker);
    session.emit(BATTLE_EVENT.ATTACK_IMPACT, { actor: playerIndex, payload: { attacker: liveAttacker.instanceId, target: "leader", damage: amount } });
    const dealt = session.damageLeader(enemyIndex, amount, { actor: playerIndex, source: liveAttacker });
    if (dealt > 0 && hasKeyword(liveAttacker, "Drain")) healFromDrain(session, playerIndex, dealt, liveAttacker);
    return session.getSnapshot(playerIndex);
  }

  const liveTarget = session.findBoardCard(enemyIndex, target.instanceId);
  if (!liveTarget) return session.getSnapshot(playerIndex);
  const attackDamage = currentAttack(liveAttacker);
  const counterDamage = currentAttack(liveTarget);
  const dealtByAttacker = session.damageFollower(enemyIndex, liveTarget.instanceId, attackDamage, { actor: playerIndex, source: liveAttacker, resolveDeath: false });
  const dealtByTarget = session.damageFollower(playerIndex, liveAttacker.instanceId, counterDamage, { actor: enemyIndex, source: liveTarget, resolveDeath: false });
  session.emit(BATTLE_EVENT.ATTACK_IMPACT, { actor: playerIndex, payload: { attacker: liveAttacker.instanceId, target: liveTarget.instanceId, attackerDamage: attackDamage, counterDamage } });
  if (dealtByAttacker > 0 && hasKeyword(liveAttacker, "Drain")) healFromDrain(session, playerIndex, dealtByAttacker, liveAttacker);
  let targetDestroyed = Number(liveTarget.defense ?? 0) <= 0 || (dealtByAttacker > 0 && hasKeyword(liveAttacker, "Bane"));
  const attackerDestroyed = Number(liveAttacker.defense ?? 0) <= 0 || (dealtByTarget > 0 && hasKeyword(liveTarget, "Bane"));
  if (targetDestroyed) targetDestroyed = Boolean(destroyWorldsBeyondFollower(session, enemyIndex, liveTarget.instanceId, { actor: playerIndex, source: liveAttacker, reason: "combat" }));
  if (attackerDestroyed) destroyWorldsBeyondFollower(session, playerIndex, liveAttacker.instanceId, { actor: enemyIndex, source: liveTarget, reason: "combat" });
  if (targetDestroyed && liveAttacker.superEvolved && session.phase !== "ended") session.damageLeader(enemyIndex, 1, { actor: playerIndex, source: liveAttacker, reason: "super-evolution-combat" });
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

function healFromDrain(session, playerIndex, amount, source) {
  const player = session.getPlayer(playerIndex);
  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + Math.max(0, Number(amount) || 0));
  const healed = player.hp - before;
  session.emit(BATTLE_EVENT.HEAL, { actor: playerIndex, payload: { targetPlayer: playerIndex, amount: healed, hp: player.hp, source: session.cardView(source), reason: "drain" } });
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
  instance.canAttackFollowers = hasKeyword(instance, "Rush") || hasKeyword(instance, "Storm");
  instance.canAttackLeader = hasKeyword(instance, "Storm");
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
function hasKeyword(instance, keyword) {
  const wanted = String(keyword).toLowerCase();
  const keywords = Array.isArray(instance?.card?.keywords) ? instance.card.keywords : [];
  if (keywords.some(value => String(value).toLowerCase() === wanted)) return true;
  return new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i").test(String(instance?.card?.text ?? ""));
}
function readCountdown(text) { const value = String(text ?? "").match(/Countdown\s*\(?\s*(\d+)\s*\)?/i)?.[1]; return value == null ? null : Number(value); }
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
