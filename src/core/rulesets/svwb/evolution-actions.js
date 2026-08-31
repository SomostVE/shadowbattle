import { BATTLE_EVENT } from "../../battle-events.js";
import { destroyWorldsBeyondAmulet } from "./amulets.js";
import {
  destroyWorldsBeyondFollower,
  getWorldsBeyondTargetOptions,
  getWorldsBeyondTargetRequirement,
  getWorldsBeyondTriggerSupport,
  resolveWorldsBeyondTrigger
} from "./effect-resolver.js";
import {
  getSimpleWorldsBeyondModeChoices,
  worldsBeyondModeChoiceKey
} from "./mode-selection.js";
import {
  getWorldsBeyondOptionalAlliedCardOptions,
  getWorldsBeyondOptionalAlliedCardSpec,
  resolveWorldsBeyondOptionalAlliedCardSelection,
  validateWorldsBeyondOptionalAlliedCardSelection
} from "./optional-allied-card.js";
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
  if (!player.resources[availableKey]) throw new Error(superEvolution ? "Super Evolution is not available yet" : "Evolution is not available yet");
  if (Number(player.resources[pointsKey] ?? 0) <= 0) throw new Error(superEvolution ? "No Super Evolution points remain" : "No Evolution points remain");

  const replacementSuper = superEvolution && superEvolutionReplacesEvolve(follower);
  const additiveSuper = superEvolution && !replacementSuper;
  const evolveSelection = additiveSuper
    ? prepareEvolutionSelection(session, playerIndex, follower, EVOLVE, {
      modeKey: actionFieldOrLegacy(action, "evolveModeKey", null),
      targetInstanceId: actionFieldOrLegacy(action, "evolveTargetInstanceId", "targetInstanceId"),
      optionalAlliedCardInstanceId: actionFieldOrLegacy(action, "evolveOptionalAlliedCardInstanceId", "optionalAlliedCardInstanceId")
    })
    : null;
  const primaryTrigger = superEvolution ? SUPER_EVOLVE : EVOLVE;
  const primarySelection = prepareEvolutionSelection(session, playerIndex, follower, primaryTrigger, {
    modeKey: additiveSuper
      ? actionFieldOrLegacy(action, "superEvolveModeKey", "evolutionModeKey")
      : action.evolutionModeKey,
    targetInstanceId: additiveSuper
      ? actionFieldOrLegacy(action, "superEvolveTargetInstanceId", "targetInstanceId")
      : action.targetInstanceId,
    optionalAlliedCardInstanceId: additiveSuper
      ? actionFieldOrLegacy(action, "superEvolveOptionalAlliedCardInstanceId", "optionalAlliedCardInstanceId")
      : action.optionalAlliedCardInstanceId
  });

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

  const eventSelection = primarySelection.targetInstanceId || primarySelection.optionalAlliedCardInstanceId
    ? primarySelection
    : evolveSelection;
  const eventTargetId = eventSelection?.optionalAlliedCardInstanceId ?? eventSelection?.targetInstanceId ?? null;
  const eventTarget = eventTargetId
    ? session.findBoardCard(playerIndex, eventTargetId) ?? session.findBoardCard(1 - playerIndex, eventTargetId)
    : null;
  session.emit(superEvolution ? BATTLE_EVENT.SUPER_EVOLVE : BATTLE_EVENT.EVOLVE, {
    actor: playerIndex,
    payload: {
      card: session.cardView(follower),
      pointsRemaining: player.resources[pointsKey],
      statBonus: bonus,
      target: eventTarget ? session.cardView(eventTarget) : null,
      targetOptional: Boolean(eventSelection?.optionalSpec),
      mode: primarySelection.mode ? modeView(primarySelection.mode) : null,
      evolveMode: evolveSelection?.mode ? modeView(evolveSelection.mode) : null
    }
  });

  if (!additiveSuper) {
    resolvePreparedEvolutionSelection(session, primarySelection);
    return session.getSnapshot(playerIndex);
  }

  const beforeEvolveIds = new Set(player.board.map(unit => unit.instanceId));
  resolvePreparedEvolutionSelection(session, evolveSelection);
  const antecedentInstanceIds = player.board
    .filter(unit => !beforeEvolveIds.has(unit.instanceId))
    .map(unit => unit.instanceId);
  resolvePreparedEvolutionSelection(session, primarySelection, { antecedentInstanceIds });
  return session.getSnapshot(playerIndex);
}

function appendEvolutionBranches(actions, session, playerIndex, follower, superEvolution) {
  const type = superEvolution ? SUPER_EVOLVE : EVOLVE;
  const base = {
    type,
    player: playerIndex,
    followerInstanceId: follower.instanceId
  };

  if (superEvolution && !superEvolutionReplacesEvolve(follower)) {
    const evolveBranches = getEvolutionBranches(session, playerIndex, follower, EVOLVE);
    const superBranches = getEvolutionBranches(session, playerIndex, follower, SUPER_EVOLVE);
    for (const evolveBranch of evolveBranches) {
      for (const superBranch of superBranches) {
        actions.push(additiveSuperEvolutionAction(base, evolveBranch, superBranch));
      }
    }
    return;
  }

  for (const branch of getEvolutionBranches(session, playerIndex, follower, type)) {
    actions.push(singleEvolutionAction(base, branch));
  }
}

function getEvolutionBranches(session, playerIndex, follower, trigger) {
  const player = session.getPlayer(playerIndex);
  const modeChoices = getEvolutionModeChoices(follower, trigger, player);
  const modes = modeChoices.length ? modeChoices : [null];
  const branches = [];

  for (const mode of modes) {
    const effectSource = mode ? evolutionModeSource(follower, trigger, mode) : follower;
    if (mode && !getWorldsBeyondTriggerSupport(effectSource, trigger, null, player).supported) continue;

    const optionalText = mode
      ? evolutionModeText(trigger, mode.text)
      : optionalEvolutionEffectText(follower, trigger);
    const optionalSpec = getWorldsBeyondOptionalAlliedCardSpec(follower, optionalText);
    if (optionalSpec) {
      for (const target of getWorldsBeyondOptionalAlliedCardOptions(player, follower, optionalSpec)) {
        branches.push({
          trigger,
          mode,
          optionalSpec,
          optionalAlliedCardInstanceId: target?.instanceId ?? null,
          targetInstanceId: null,
          requirement: null
        });
      }
      continue;
    }

    const requirement = getWorldsBeyondTargetRequirement(effectSource, trigger, null, player);
    const targets = requirement ? getWorldsBeyondTargetOptions(session, { trigger, playerIndex, source: effectSource }) : [];
    if (!targets.length) {
      branches.push({ trigger, mode, optionalSpec: null, optionalAlliedCardInstanceId: null, targetInstanceId: null, requirement });
      continue;
    }
    for (const target of targets) {
      branches.push({
        trigger,
        mode,
        optionalSpec: null,
        optionalAlliedCardInstanceId: null,
        targetInstanceId: target.instanceId,
        requirement
      });
    }
  }
  return branches;
}

function singleEvolutionAction(base, branch) {
  const action = { ...base };
  if (branch.mode) {
    action.evolutionModeKey = worldsBeyondModeChoiceKey(branch.mode);
    action.evolutionMode = modeView(branch.mode);
  }
  applyLegacyTargetFields(action, branch);
  return action;
}

function additiveSuperEvolutionAction(base, evolveBranch, superBranch) {
  const action = {
    ...base,
    evolveModeKey: evolveBranch.mode ? worldsBeyondModeChoiceKey(evolveBranch.mode) : null,
    superEvolveModeKey: superBranch.mode ? worldsBeyondModeChoiceKey(superBranch.mode) : null,
    evolveTargetInstanceId: evolveBranch.targetInstanceId,
    superEvolveTargetInstanceId: superBranch.targetInstanceId,
    evolveOptionalAlliedCardInstanceId: evolveBranch.optionalAlliedCardInstanceId,
    superEvolveOptionalAlliedCardInstanceId: superBranch.optionalAlliedCardInstanceId
  };

  if (evolveBranch.mode) action.evolveMode = modeView(evolveBranch.mode);
  if (superBranch.mode) {
    action.superEvolveMode = modeView(superBranch.mode);
    action.evolutionModeKey = worldsBeyondModeChoiceKey(superBranch.mode);
    action.evolutionMode = modeView(superBranch.mode);
  } else if (evolveBranch.mode) {
    action.evolutionModeKey = worldsBeyondModeChoiceKey(evolveBranch.mode);
    action.evolutionMode = modeView(evolveBranch.mode);
  }

  const displayBranch = branchHasSelection(superBranch) ? superBranch : evolveBranch;
  applyLegacyTargetFields(action, displayBranch);
  if (evolveBranch.requirement) {
    action.evolveTargetKind = evolveBranch.requirement.kind;
    action.evolveTargetAmount = Number(evolveBranch.requirement.amount ?? 0);
  }
  if (superBranch.requirement) {
    action.superEvolveTargetKind = superBranch.requirement.kind;
    action.superEvolveTargetAmount = Number(superBranch.requirement.amount ?? 0);
  }
  if (evolveBranch.optionalSpec) action.evolveTargetOptional = true;
  if (superBranch.optionalSpec) action.superEvolveTargetOptional = true;
  return action;
}

function branchHasSelection(branch) {
  return Boolean(branch?.mode || branch?.optionalSpec || branch?.requirement || branch?.targetInstanceId || branch?.optionalAlliedCardInstanceId);
}

function applyLegacyTargetFields(action, branch) {
  const targetId = branch.optionalSpec ? branch.optionalAlliedCardInstanceId : branch.targetInstanceId;
  if (targetId) action.targetInstanceId = targetId;
  if (branch.optionalSpec) {
    action.targetOptional = true;
    action.targetSide = "allied";
    action.targetKind = branch.optionalSpec.kind;
    action.optionalSelectionKind = branch.optionalSpec.kind;
    action.optionalFollowUpKind = branch.optionalSpec.followUpKind;
    action.optionalFollowUpAmount = branch.optionalSpec.amount;
    action.optionalAlliedCardInstanceId = branch.optionalAlliedCardInstanceId;
    return;
  }
  if (branch.requirement) {
    action.targetKind = branch.requirement.kind;
    action.targetAmount = Number(branch.requirement.amount ?? 0);
  }
}

function prepareEvolutionSelection(session, playerIndex, follower, trigger, {
  modeKey = null,
  targetInstanceId = null,
  optionalAlliedCardInstanceId = null
} = {}) {
  const player = session.getPlayer(playerIndex);
  const modeChoices = getEvolutionModeChoices(follower, trigger, player);
  const selectedMode = selectEvolutionMode(modeChoices, modeKey);
  if (modeChoices.length && !selectedMode) throw new Error("Selected evolution mode is not legal");
  const effectSource = selectedMode ? evolutionModeSource(follower, trigger, selectedMode) : follower;
  if (selectedMode && !getWorldsBeyondTriggerSupport(effectSource, trigger, null, player).supported) {
    throw new Error("This evolution mode is not fully supported by the Worlds Beyond resolver");
  }

  const optionalText = selectedMode
    ? evolutionModeText(trigger, selectedMode.text)
    : optionalEvolutionEffectText(follower, trigger);
  const optionalSpec = getWorldsBeyondOptionalAlliedCardSpec(follower, optionalText);
  if (optionalSpec) {
    const optionalTargetId = optionalAlliedCardInstanceId ?? targetInstanceId ?? null;
    validateWorldsBeyondOptionalAlliedCardSelection(player, follower, optionalSpec, optionalTargetId);
    return {
      trigger,
      playerIndex,
      follower,
      mode: selectedMode,
      optionalSpec,
      optionalAlliedCardInstanceId: optionalTargetId,
      targetInstanceId: null,
      requirement: null
    };
  }

  if (optionalAlliedCardInstanceId) throw new Error("This evolution ability does not allow an optional allied-card selection");
  const requirement = getWorldsBeyondTargetRequirement(effectSource, trigger, null, player);
  const targets = requirement ? getWorldsBeyondTargetOptions(session, { trigger, playerIndex, source: effectSource }) : [];
  if (targets.length && !targetInstanceId) throw new Error("This evolution ability requires an effect target");
  if (targetInstanceId && !targets.some(target => target.instanceId === targetInstanceId)) {
    throw new Error("Selected evolution target is not legal");
  }
  return {
    trigger,
    playerIndex,
    follower,
    mode: selectedMode,
    optionalSpec: null,
    optionalAlliedCardInstanceId: null,
    targetInstanceId: targetInstanceId ?? null,
    requirement
  };
}

function resolvePreparedEvolutionSelection(session, selection, { antecedentInstanceIds = [] } = {}) {
  if (!selection) return;
  const {
    trigger,
    playerIndex,
    follower,
    mode,
    optionalSpec,
    optionalAlliedCardInstanceId,
    targetInstanceId
  } = selection;

  if (optionalSpec) {
    resolveWorldsBeyondOptionalAlliedCardSelection(session, {
      trigger,
      playerIndex,
      source: follower,
      spec: optionalSpec,
      targetInstanceId: optionalAlliedCardInstanceId,
      destroyFollower: destroyWorldsBeyondFollower,
      destroyAmulet: destroyWorldsBeyondAmulet
    });
    return;
  }

  const previousActiveText = follower.activeText;
  if (mode) follower.activeText = evolutionModeText(trigger, mode.text);
  try {
    resolveWorldsBeyondTrigger(session, {
      trigger,
      playerIndex,
      source: follower,
      targetInstanceId,
      antecedentInstanceIds
    });
  } finally {
    if (previousActiveText == null) delete follower.activeText;
    else follower.activeText = previousActiveText;
  }
}

function actionFieldOrLegacy(action, field, legacyField) {
  if (Object.prototype.hasOwnProperty.call(action ?? {}, field)) return action[field] ?? null;
  return legacyField ? action?.[legacyField] ?? null : null;
}

function getEvolutionModeChoices(follower, trigger, player) {
  return getSimpleWorldsBeyondModeChoices(evolutionEffectText(follower, trigger), player);
}

function superEvolutionReplacesEvolve(follower) {
  return /\binstead\b/i.test(section(String(follower?.card?.text ?? ""), SUPER_EVOLVE));
}

function evolutionEffectText(follower, trigger) {
  const text = String(follower?.card?.text ?? "");
  const triggerSection = section(text, trigger);
  if (!/replicate the effects? of this card'?s fanfare ability/i.test(triggerSection)) return triggerSection;
  return baseText(text);
}

function optionalEvolutionEffectText(follower, trigger) {
  const text = String(follower?.card?.text ?? "");
  const triggerSection = section(text, trigger);
  if (!/replicate the effects? of this card'?s fanfare ability/i.test(triggerSection)) return triggerSection;
  return section(text, "fanfare");
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
