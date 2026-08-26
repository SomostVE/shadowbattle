import { BATTLE_EVENT } from "../../battle-events.js";
import {
  getWorldsBeyondTargetOptions,
  getWorldsBeyondTargetRequirement,
  resolveWorldsBeyondTrigger
} from "./effect-resolver.js";

const EVOLVE = "evolve";
const SUPER_EVOLVE = "super-evolve";

export function listWorldsBeyondEvolutionActions(session, playerIndex) {
  if (!session || session.phase !== "main" || session.activePlayer !== playerIndex || session.winner != null) return [];
  const player = session.getPlayer(playerIndex);
  if (player.evolutionActionUsed) return [];
  const actions = [];

  for (const follower of player.board) {
    if (cardType(follower) !== "follower" || follower.evolved) continue;
    if (player.resources.evolutionAvailable && Number(player.resources.evolutionPoints ?? 0) > 0) {
      appendEvolutionBranches(actions, session, playerIndex, follower, false);
    }
    if (player.resources.superEvolutionAvailable && Number(player.resources.superEvolutionPoints ?? 0) > 0) {
      appendEvolutionBranches(actions, session, playerIndex, follower, true);
    }
  }
  return actions;
}

export function applyWorldsBeyondEvolutionAction(session, action) {
  const superEvolution = action?.type === SUPER_EVOLVE;
  if (!superEvolution && action?.type !== EVOLVE) throw new Error(`Unsupported evolution action: ${action?.type ?? "unknown"}`);
  const playerIndex = assertMainActor(session, action.player);
  const player = session.getPlayer(playerIndex);
  const follower = player.board.find(unit => unit.instanceId === action.followerInstanceId);
  if (!follower || cardType(follower) !== "follower") throw new Error("Evolution target is not an allied follower");
  if (follower.evolved) throw new Error("Follower is already evolved");
  if (player.evolutionActionUsed) throw new Error("An evolution action was already used this turn");

  const availableKey = superEvolution ? "superEvolutionAvailable" : "evolutionAvailable";
  const pointsKey = superEvolution ? "superEvolutionPoints" : "evolutionPoints";
  const trigger = superEvolution ? SUPER_EVOLVE : EVOLVE;
  if (!player.resources[availableKey]) throw new Error(superEvolution ? "Super Evolution is not available yet" : "Evolution is not available yet");
  if (Number(player.resources[pointsKey] ?? 0) <= 0) throw new Error(superEvolution ? "No Super Evolution points remain" : "No Evolution points remain");

  const requirement = getWorldsBeyondTargetRequirement(follower, trigger, null, player);
  const targets = requirement ? getWorldsBeyondTargetOptions(session, { trigger, playerIndex, source: follower }) : [];
  if (targets.length && !action.targetInstanceId) throw new Error("This evolution ability requires an effect target");
  if (action.targetInstanceId && !targets.some(target => target.instanceId === action.targetInstanceId)) {
    throw new Error("Selected evolution target is not legal");
  }

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

  const target = action.targetInstanceId ? session.findBoardCard(1 - playerIndex, action.targetInstanceId) : null;
  session.emit(superEvolution ? BATTLE_EVENT.SUPER_EVOLVE : BATTLE_EVENT.EVOLVE, {
    actor: playerIndex,
    payload: {
      card: session.cardView(follower),
      pointsRemaining: player.resources[pointsKey],
      statBonus: bonus,
      target: target ? session.cardView(target) : null
    }
  });
  resolveWorldsBeyondTrigger(session, {
    trigger,
    playerIndex,
    source: follower,
    targetInstanceId: action.targetInstanceId ?? null
  });
  return session.getSnapshot(playerIndex);
}

function appendEvolutionBranches(actions, session, playerIndex, follower, superEvolution) {
  const type = superEvolution ? SUPER_EVOLVE : EVOLVE;
  const player = session.getPlayer(playerIndex);
  const base = { type, player: playerIndex, followerInstanceId: follower.instanceId };
  const requirement = getWorldsBeyondTargetRequirement(follower, type, null, player);
  const targets = requirement ? getWorldsBeyondTargetOptions(session, { trigger: type, playerIndex, source: follower }) : [];
  if (!targets.length) {
    actions.push(base);
    return;
  }
  for (const target of targets) {
    actions.push({
      ...base,
      targetInstanceId: target.instanceId,
      targetKind: requirement.kind,
      targetAmount: Number(requirement.amount ?? 0)
    });
  }
}

function assertMainActor(session, playerIndex) {
  if (session.phase !== "main") throw new Error(`Expected phase main, got ${session.phase}`);
  if (session.winner != null) throw new Error("The match has ended");
  if (playerIndex !== 0 && playerIndex !== 1) throw new Error(`Invalid player index: ${playerIndex}`);
  if (session.activePlayer !== playerIndex) throw new Error(`It is not player ${playerIndex}'s turn`);
  return playerIndex;
}

function currentAttack(instance) {
  return Number(instance.attack ?? (Number(instance.card?.attack ?? 0) + Number(instance.attackBonus ?? 0)));
}

function currentMaxDefense(instance) {
  return Number(instance.maxDefense ?? (Number(instance.card?.defense ?? 0) + Number(instance.defenseBonus ?? 0)));
}

function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}
