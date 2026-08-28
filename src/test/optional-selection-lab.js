import { GameSession } from "../core/game-session.js";

const previousListLegalActions = GameSession.prototype.listLegalActions;
let activeSession = null;
let pendingOptional = null;
let replayingOptionalSkip = false;

GameSession.prototype.listLegalActions = function patchedOptionalSelectionActions(playerIndex = this.activePlayer) {
  activeSession = this;
  const actions = previousListLegalActions.call(this, playerIndex);
  if (playerIndex !== 0 || !replayingOptionalSkip || !pendingOptional) return actions;
  return keepOnlyOptionalSkipBranch(actions, pendingOptional);
};

document.addEventListener("click", captureOptionalSelection, true);
document.addEventListener("click", () => queueMicrotask(syncOptionalSelection));

function captureOptionalSelection(event) {
  if (!activeSession || activeSession.phase !== "main" || activeSession.activePlayer !== 0 || replayingOptionalSkip) return;

  const evolutionButton = event.target.closest?.("#battle-player-board .sb-battle-evolution-button:not(.is-engage)");
  if (evolutionButton) {
    const unit = evolutionButton.closest?.(".sb-battle-unit[data-instance-id]");
    const sourceId = unit?.dataset.instanceId ?? null;
    const type = evolutionButton.classList.contains("is-super") ? "super-evolve" : "evolve";
    const actions = optionalEvolutionActions(type, sourceId);
    if (hasChoiceAndSkip(actions)) {
      const next = { sourceType: "evolution", type, sourceId };
      if (samePending(next)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        replayOptionalSkip(evolutionButton, next);
        return;
      }
      pendingOptional = next;
      setOptionalHelp(type === "super-evolve" ? "Super Evo" : "Evo");
    }
    return;
  }

  const handCard = event.target.closest?.("#battle-player-hand .sb-battle-card[data-instance-id]");
  if (!handCard) return;
  const sourceId = handCard.dataset.instanceId;
  const actions = optionalPlayActions(sourceId);
  if (!hasChoiceAndSkip(actions)) return;
  const modeKeys = new Set(actions.map(action => action.playModeKey ?? `base:${action.cost ?? 0}`));
  if (modeKeys.size !== 1) return;
  const next = {
    sourceType: "play-card",
    sourceId,
    playModeKey: actions[0]?.playModeKey ?? null
  };
  if (samePending(next)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    replayOptionalSkip(handCard, next);
    return;
  }
  pendingOptional = next;
  setOptionalHelp("card effect");
}

function replayOptionalSkip(node, selection) {
  pendingOptional = selection;
  replayingOptionalSkip = true;
  try {
    node.click();
  } finally {
    replayingOptionalSkip = false;
  }
  queueMicrotask(syncOptionalSelection);
}

function syncOptionalSelection() {
  if (!activeSession || activeSession.phase !== "main" || activeSession.activePlayer !== 0) {
    pendingOptional = null;
    return;
  }
  if (!pendingOptional) return;

  const actions = pendingOptional.sourceType === "play-card"
    ? optionalPlayActions(pendingOptional.sourceId, pendingOptional.playModeKey)
    : optionalEvolutionActions(pendingOptional.type, pendingOptional.sourceId);
  if (!hasChoiceAndSkip(actions) || !pendingSourceIsRenderedSelected()) {
    pendingOptional = null;
    return;
  }
  setOptionalHelp(pendingOptional.sourceType === "play-card"
    ? "card effect"
    : (pendingOptional.type === "super-evolve" ? "Super Evo" : "Evo"));
}

function optionalPlayActions(sourceId, playModeKey = null) {
  if (!activeSession || !sourceId) return [];
  return previousListLegalActions.call(activeSession, 0).filter(action =>
    action.type === "play-card"
    && action.cardInstanceId === sourceId
    && isOptionalAlliedCardAction(action)
    && (!playModeKey || action.playModeKey === playModeKey)
  );
}

function optionalEvolutionActions(type, sourceId) {
  if (!activeSession || !sourceId || !type) return [];
  return previousListLegalActions.call(activeSession, 0).filter(action =>
    action.type === type
    && action.followerInstanceId === sourceId
    && isOptionalAlliedCardAction(action)
  );
}

function keepOnlyOptionalSkipBranch(actions, selection) {
  const result = [];
  for (const action of actions) {
    const sameSource = selection.sourceType === "play-card"
      ? action.type === "play-card"
        && action.cardInstanceId === selection.sourceId
        && (!selection.playModeKey || action.playModeKey === selection.playModeKey)
      : action.type === selection.type && action.followerInstanceId === selection.sourceId;
    if (!sameSource) {
      result.push(action);
      continue;
    }
    if (isOptionalAlliedCardAction(action) && isOptionalSkip(action)) result.push(action);
  }
  return result;
}

function hasChoiceAndSkip(actions) {
  return actions.some(isOptionalSkip) && actions.some(action => Boolean(action.optionalAlliedCardInstanceId));
}

function isOptionalAlliedCardAction(action) {
  return Boolean(action?.targetOptional && action?.optionalSelectionKind === "optional-allied-card-destroy");
}

function isOptionalSkip(action) {
  return isOptionalAlliedCardAction(action) && !action.optionalAlliedCardInstanceId && !action.targetInstanceId;
}

function samePending(next) {
  if (!pendingOptional || pendingOptional.sourceType !== next.sourceType || pendingOptional.sourceId !== next.sourceId) return false;
  if (next.sourceType === "play-card") return (pendingOptional.playModeKey ?? null) === (next.playModeKey ?? null);
  return pendingOptional.type === next.type;
}

function pendingSourceIsRenderedSelected() {
  if (!pendingOptional) return false;
  if (pendingOptional.sourceType === "play-card") {
    return Boolean(document.querySelector(`#battle-player-hand .sb-battle-card.is-selected[data-instance-id="${cssEscape(pendingOptional.sourceId)}"]`));
  }
  const unit = document.querySelector(`#battle-player-board .sb-battle-unit.is-attacker-selected[data-instance-id="${cssEscape(pendingOptional.sourceId)}"]`);
  const alliedEffectTarget = document.querySelector("#battle-player-board .sb-battle-unit.is-effect-target");
  return Boolean(unit && alliedEffectTarget);
}

function setOptionalHelp(label) {
  const help = document.querySelector("#battle-help");
  const status = document.querySelector("#battle-lab-status");
  if (help) help.textContent = `Choose a highlighted allied card for the ${label}, or click the source again to skip the optional selection.`;
  if (status) {
    status.textContent = "Choose optional target";
    status.dataset.status = "ready";
  }
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}
