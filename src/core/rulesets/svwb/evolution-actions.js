import { BATTLE_EVENT } from "../../battle-events.js";
import {
  getWorldsBeyondTargetOptions,
  getWorldsBeyondTargetRequirement,
  getWorldsBeyondTriggerSupport,
  resolveWorldsBeyondTrigger
} from "./effect-resolver.js";
import {
  getSimpleWorldsBeyondModeChoices,
  worldsBeyondModeChoiceKey
} from "./mode-selection.js";
import { baseText, section } from "./v5/battle-engine-v5-text.js";

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

  const modeChoices = getEvolutionModeChoices(follower, trigger, player);
  const selectedMode = selectEvolutionMode(modeChoices, action.evolutionModeKey);
  if (modeChoices.length && !selectedMode) throw new Error("Selected evolution mode is not legal");
  const effectSource = selectedMode ? evolutionModeSource(follower, trigger, selectedMode) : follower;
  if (selectedMode && !getWorldsBeyondTriggerSupport(effectSource, trigger, null, player).supported) {
    throw new Error("This evolution mode is not fully supported by the Worlds Beyond resolver");
  }

  const requirement = getWorldsBeyondTargetRequirement(effectSource, trigger, null, player);
  const targets = requirement ? getWorldsBeyondTargetOptions(session, { trigger, playerIndex, source: effectSource }) : [];
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
      target: target ? session.cardView(target) : null,
      mode: selectedMode ? modeView(selectedMode) : null
    }
  });

  const previousActiveText = follower.activeText;
  if (selectedMode) follower.activeText = evolutionModeText(trigger, selectedMode.text);
  try {
    resolveWorldsBeyondTrigger(session, {
      trigger,
      playerIndex,
      source: follower,
      targetInstanceId: action.targetInstanceId ?? null
    });
  } finally {
    if (previousActiveText == null) delete follower.activeText;
    else follower.activeText = previousActiveText;
  }
  return session.getSnapshot(playerIndex);
}

function appendEvolutionBranches(actions, session, playerIndex, follower, superEvolution) {
  const type = superEvolution ? SUPER_EVOLVE : EVOLVE;
  const player = session.getPlayer(playerIndex);
  const modeChoices = getEvolutionModeChoices(follower, type, player);
  const variants = modeChoices.length ? modeChoices : [null];

  for (const mode of variants) {
    const effectSource = mode ? evolutionModeSource(follower, type, mode) : follower;
    if (mode && !getWorldsBeyondTriggerSupport(effectSource, type, null, player).supported) continue;

    const base = {
      type,
      player: playerIndex,
      followerInstanceId: follower.instanceId,
      ...(mode ? {
        evolutionModeKey: worldsBeyondModeChoiceKey(mode),
        evolutionMode: modeView(mode)
      } : {})
    };
    const requirement = getWorldsBeyondTargetRequirement(effectSource, type, null, player);
    const targets = requirement ? getWorldsBeyondTargetOptions(session, { trigger: type, playerIndex, source: effectSource }) : [];
    if (!targets.length) {
      actions.push(base);
      continue;
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
}

function getEvolutionModeChoices(follower, trigger, player) {
  return getSimpleWorldsBeyondModeChoices(evolutionEffectText(follower, trigger), player);
}

function evolutionEffectText(follower, trigger) {
  const text = String(follower?.card?.text ?? "");
  const triggerSection = section(text, trigger);
  if (!/replicate the effects? of this card'?s fanfare ability/i.test(triggerSection)) return triggerSection;
  return baseText(text);
}

function evolutionModeSource(follower, trigger, mode) {
  return {
    ...follower,
    activeText: evolutionModeText(trigger, mode.text)
  };
}

function evolutionModeText(trigger, text) {
  return `${trigger === SUPER_EVOLVE ? "Super-Evolve" : "Evolve"}: ${String(text ?? "")}`;
}

function selectEvolutionMode(choices, key) {
  if (!choices.length) return null;
  if (key) return choices.find(choice => worldsBeyondModeChoiceKey(choice) === key) ?? null;
  return choices.length === 1 ? choices[0] : null;
}

function modeView(mode) {
  return {
    kind: "mode",
    modeIndex: Number(mode?.modeIndex ?? 0),
    selectedModeCount: Number(mode?.selectedModeCount ?? 0),
    selectedModeIndices: [...(mode?.selectedModeIndices ?? [])]
  };
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
