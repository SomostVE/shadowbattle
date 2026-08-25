import { BATTLE_EVENT } from "../../battle-events.js";
import {
  destroyWorldsBeyondFollower,
  getWorldsBeyondTargetOptions,
  getWorldsBeyondTargetRequirement,
  resolveWorldsBeyondTrigger
} from "./effect-resolver.js";
import { costOf } from "./v5/battle-engine-v5-state.js";

export const SVWB_ACTION = Object.freeze({
  PLAY_CARD: "play-card",
  ATTACK: "attack",
  EVOLVE: "evolve",
  SUPER_EVOLVE: "super-evolve"
});

export function applyWorldsBeyondAction(session, action) {
  switch (action.type) {
    case SVWB_ACTION.PLAY_CARD: return playCard(session, action);
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
  for (const unit of player.board) {
    if (cardType(unit) !== "follower") continue;
    unit.attacksRemaining = 1;
    unit.hasAttacked = false;
    unit.canAttackFollowers = true;
    unit.canAttackLeader = true;
  }
}

export function listWorldsBeyondActions(session, playerIndex) {
  if (session.phase !== "main" || session.activePlayer !== playerIndex || session.winner != null) return [];
  const player = session.getPlayer(playerIndex);
  const enemy = session.getPlayer(1 - playerIndex);
  const actions = [];

  for (const card of player.hand) {
    const type = cardType(card);
    const cost = costOf(card);
    const needsBoard = type === "follower" || type === "amulet";
    if (cost > player.resources.pp || (needsBoard && player.board.length >= session.ruleset.maxBoardSize)) continue;

    const baseAction = { type: SVWB_ACTION.PLAY_CARD, player: playerIndex, cardInstanceId: card.instanceId, cost };
    const targetRequirement = getWorldsBeyondTargetRequirement(card, "play");
    if (!targetRequirement) {
      actions.push(baseAction);
      continue;
    }

    const targets = getWorldsBeyondTargetOptions(session, { trigger: "play", playerIndex, source: card });
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
  const type = cardType(instance);
  const cost = costOf(instance);
  if (cost > player.resources.pp) throw new Error(`Not enough PP to play ${instance.card?.name ?? "card"}`);
  if ((type === "follower" || type === "amulet") && player.board.length >= session.ruleset.maxBoardSize) throw new Error("The board is full");
  if (!new Set(["follower", "spell", "amulet"]).has(type)) throw new Error(`Unsupported card type: ${instance.card?.type ?? "unknown"}`);

  const requirement = getWorldsBeyondTargetRequirement(instance, "play");
  const targets = requirement ? getWorldsBeyondTargetOptions(session, { trigger: "play", playerIndex, source: instance }) : [];
  if (targets.length && !action.targetInstanceId) throw new Error("This card requires an effect target");
  if (action.targetInstanceId && !targets.some(target => target.instanceId === action.targetInstanceId)) throw new Error("Selected effect target is not legal");
  if (requirement && type === "spell" && !targets.length) throw new Error("This spell has no legal target");

  player.resources.pp -= cost;
  player.hand.splice(index, 1);
  player.cardsPlayedThisTurn = Number(player.cardsPlayedThisTurn ?? 0) + 1;
  if (type === "spell") player.spellsPlayedThisTurn = Number(player.spellsPlayedThisTurn ?? 0) + 1;
  session.emit(BATTLE_EVENT.CARD_PLAY, { actor: playerIndex, payload: { card: session.cardView(instance), cost, ppRemaining: player.resources.pp, type } });

  if (type === "follower") {
    prepareFollower(instance, session.turn);
    player.board.push(instance);
    session.emit(BATTLE_EVENT.FOLLOWER_ENTER, { actor: playerIndex, payload: { card: session.cardView(instance), position: player.board.length - 1 } });
  } else if (type === "amulet") {
    instance.countdown = readCountdown(instance.card?.text);
    instance.playedTurn = session.turn;
    player.board.push(instance);
    session.emit(BATTLE_EVENT.AMULET_ENTER, { actor: playerIndex, payload: { card: session.cardView(instance), position: player.board.length - 1, countdown: instance.countdown } });
  } else {
    player.cemetery.push(instance);
    session.emit(BATTLE_EVENT.SPELL_CAST, { actor: playerIndex, payload: { card: session.cardView(instance) } });
  }

  resolveWorldsBeyondTrigger(session, { trigger: "play", playerIndex, source: instance, targetInstanceId: action.targetInstanceId ?? null });
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
  if (!target) {
    const amount = currentAttack(attacker);
    session.emit(BATTLE_EVENT.ATTACK_IMPACT, { actor: playerIndex, payload: { attacker: attacker.instanceId, target: "leader", damage: amount } });
    const dealt = session.damageLeader(enemyIndex, amount, { actor: playerIndex, source: attacker });
    if (dealt > 0 && hasKeyword(attacker, "Drain")) healFromDrain(session, playerIndex, dealt, attacker);
    return session.getSnapshot(playerIndex);
  }
  const attackDamage = currentAttack(attacker);
  const counterDamage = currentAttack(target);
  const dealtByAttacker = session.damageFollower(enemyIndex, target.instanceId, attackDamage, { actor: playerIndex, source: attacker, resolveDeath: false });
  const dealtByTarget = session.damageFollower(playerIndex, attacker.instanceId, counterDamage, { actor: enemyIndex, source: target, resolveDeath: false });
  session.emit(BATTLE_EVENT.ATTACK_IMPACT, { actor: playerIndex, payload: { attacker: attacker.instanceId, target: target.instanceId, attackerDamage: attackDamage, counterDamage } });
  if (dealtByAttacker > 0 && hasKeyword(attacker, "Drain")) healFromDrain(session, playerIndex, dealtByAttacker, attacker);
  let targetDestroyed = Number(target.defense ?? 0) <= 0 || (dealtByAttacker > 0 && hasKeyword(attacker, "Bane"));
  const attackerDestroyed = Number(attacker.defense ?? 0) <= 0 || (dealtByTarget > 0 && hasKeyword(target, "Bane"));
  if (targetDestroyed) targetDestroyed = Boolean(destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, source: attacker, reason: "combat" }));
  if (attackerDestroyed) destroyWorldsBeyondFollower(session, playerIndex, attacker.instanceId, { actor: enemyIndex, source: target, reason: "combat" });
  if (targetDestroyed && attacker.superEvolved && session.phase !== "ended") session.damageLeader(enemyIndex, 1, { actor: playerIndex, source: attacker, reason: "super-evolution-combat" });
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
