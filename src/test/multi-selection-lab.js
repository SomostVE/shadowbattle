import { GameSession } from "../core/game-session.js";

const originalListLegalActions = GameSession.prototype.listLegalActions;
let activeSession = null;
let pending = null;
let selectedDiscardInstanceId = null;
let replaying = false;

GameSession.prototype.listLegalActions = function patchedListLegalActions(playerIndex = this.activePlayer) {
  activeSession = this;
  const actions = originalListLegalActions.call(this, playerIndex);
  if (playerIndex === 1) return prioritizeCpuDiscardVariants(actions, this, playerIndex);
  if (playerIndex === 0 && pending && selectedDiscardInstanceId) {
    return prioritizeSelectedDiscard(actions, pending, selectedDiscardInstanceId);
  }
  return actions;
};

installStyles();
document.addEventListener("click", captureMultiSelection, true);
document.addEventListener("click", () => queueMicrotask(syncFromRenderedSelection));

function captureMultiSelection(event) {
  if (!activeSession || activeSession.phase !== "main" || activeSession.activePlayer !== 0) return;

  const handCard = event.target.closest?.("#battle-player-hand .sb-battle-card[data-instance-id]");
  if (handCard && pending && !replaying && isDiscardCandidate(handCard.dataset.instanceId)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    selectDiscard(handCard.dataset.instanceId);
    return;
  }

  const enemyTarget = event.target.closest?.("#battle-opponent-board .sb-battle-unit-hitbox");
  if (enemyTarget && pending && pendingHasTarget() && !selectedDiscardInstanceId) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setHelp("Choose a highlighted card in your hand to discard before selecting the enemy target.", "Choose discard");
    return;
  }

  if (replaying) return;

  const engageButton = event.target.closest?.("#battle-player-board .sb-battle-evolution-button.is-engage");
  if (engageButton) {
    const unit = engageButton.closest(".sb-battle-unit[data-instance-id]");
    const sourceId = unit?.dataset.instanceId;
    const actions = sourceId ? rawActions(0).filter(action => action.type === "engage" && action.amuletInstanceId === sourceId) : [];
    if (actions.some(action => action.discardInstanceId)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      beginSelection({ kind: "engage", sourceId, replayNode: engageButton });
      return;
    }
  }

  if (handCard) {
    const sourceId = handCard.dataset.instanceId;
    const actions = rawActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === sourceId);
    const discardActions = actions.filter(action => action.discardInstanceId);
    if (discardActions.length && discardActions.every(action => !action.targetInstanceId) && uniqueModeKeys(discardActions).size <= 1) {
      event.preventDefault();
      event.stopImmediatePropagation();
      beginSelection({ kind: "play-card", sourceId, playModeKey: discardActions[0]?.playModeKey ?? null, replayNode: handCard });
    }
  }
}

function syncFromRenderedSelection() {
  if (!activeSession || activeSession.phase !== "main" || activeSession.activePlayer !== 0) {
    clearSelection();
    return;
  }

  const selectedPlay = document.querySelector("#battle-player-hand .sb-battle-card.is-selected[data-instance-id]");
  if (selectedPlay && !document.querySelector("#battle-player-hand .sb-battle-mode-menu")) {
    const sourceId = selectedPlay.dataset.instanceId;
    const actions = rawActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === sourceId && action.discardInstanceId);
    if (actions.length) {
      const modeKeys = uniqueModeKeys(actions);
      beginSelection({
        kind: "play-card",
        sourceId,
        playModeKey: modeKeys.size === 1 ? actions[0].playModeKey ?? null : pending?.playModeKey ?? null,
        replayNode: selectedPlay
      }, { preserveDiscard: pending?.sourceId === sourceId });
      return;
    }
  }

  const selectedEngage = document.querySelector("#battle-player-board .sb-battle-unit.is-engage-selected[data-instance-id]");
  if (selectedEngage) {
    const sourceId = selectedEngage.dataset.instanceId;
    const actions = rawActions(0).filter(action => action.type === "engage" && action.amuletInstanceId === sourceId && action.discardInstanceId);
    if (actions.length) {
      beginSelection({ kind: "engage", sourceId, replayNode: selectedEngage.querySelector(".sb-battle-evolution-button.is-engage") }, { preserveDiscard: pending?.sourceId === sourceId });
      return;
    }
  }

  if (pending && !pendingSourceStillLegal()) clearSelection();
}

function beginSelection(next, { preserveDiscard = false } = {}) {
  pending = next;
  if (!preserveDiscard) selectedDiscardInstanceId = null;
  decorateDiscardCandidates();
  const hasTarget = pendingHasTarget();
  setHelp(
    selectedDiscardInstanceId
      ? (hasTarget ? "Discard selected. Choose the highlighted enemy follower." : "Discard selected. Resolving selection…")
      : "Choose a highlighted card in your hand to discard.",
    selectedDiscardInstanceId ? (hasTarget ? "Choose effect target" : "Discard selected") : "Choose discard"
  );
}

function selectDiscard(instanceId) {
  selectedDiscardInstanceId = instanceId;
  decorateDiscardCandidates();

  if (!pendingHasTarget() && pending?.replayNode) {
    const node = pending.replayNode;
    replaying = true;
    try {
      node.click();
    } finally {
      replaying = false;
    }
    return;
  }

  setHelp("Discard selected. Choose the highlighted enemy follower.", "Choose effect target");
}

function decorateDiscardCandidates() {
  clearDecorations();
  if (!pending) return;
  const candidateIds = new Set(selectionActions().map(action => action.discardInstanceId).filter(Boolean));
  for (const button of document.querySelectorAll("#battle-player-hand .sb-battle-card[data-instance-id]")) {
    const id = button.dataset.instanceId;
    if (!candidateIds.has(id)) continue;
    button.disabled = false;
    button.classList.add("is-discard-candidate");
    button.classList.toggle("is-discard-selected", id === selectedDiscardInstanceId);
    const marker = document.createElement("span");
    marker.className = "sb-battle-card-marker sb-discard-marker";
    marker.dataset.discardMarker = "true";
    marker.textContent = id === selectedDiscardInstanceId ? "Discard ✓" : "Discard";
    button.append(marker);
  }
}

function clearDecorations() {
  for (const button of document.querySelectorAll("#battle-player-hand .sb-battle-card.is-discard-candidate")) {
    button.classList.remove("is-discard-candidate", "is-discard-selected");
  }
  for (const marker of document.querySelectorAll("[data-discard-marker='true']")) marker.remove();
}

function clearSelection() {
  pending = null;
  selectedDiscardInstanceId = null;
  clearDecorations();
}

function rawActions(playerIndex) {
  return activeSession ? originalListLegalActions.call(activeSession, playerIndex) : [];
}

function selectionActions() {
  if (!pending) return [];
  return rawActions(0).filter(action => {
    if (!action.discardInstanceId) return false;
    if (pending.kind === "play-card") {
      return action.type === "play-card"
        && action.cardInstanceId === pending.sourceId
        && (!pending.playModeKey || action.playModeKey === pending.playModeKey);
    }
    return action.type === "engage" && action.amuletInstanceId === pending.sourceId;
  });
}

function pendingHasTarget() {
  return selectionActions().some(action => action.targetInstanceId);
}

function pendingSourceStillLegal() {
  return selectionActions().length > 0;
}

function isDiscardCandidate(instanceId) {
  return selectionActions().some(action => action.discardInstanceId === instanceId);
}

function prioritizeSelectedDiscard(actions, selection, discardInstanceId) {
  return prioritizeDiscardGroups(actions, action => {
    const sameSource = selection.kind === "play-card"
      ? action.type === "play-card" && action.cardInstanceId === selection.sourceId && (!selection.playModeKey || action.playModeKey === selection.playModeKey)
      : action.type === "engage" && action.amuletInstanceId === selection.sourceId;
    if (!sameSource || !action.discardInstanceId) return 1;
    return action.discardInstanceId === discardInstanceId ? 0 : 2;
  });
}

function prioritizeCpuDiscardVariants(actions, session, playerIndex) {
  return prioritizeDiscardGroups(actions, action => {
    if (!action.discardInstanceId) return 1;
    const card = session.findHandCard(playerIndex, action.discardInstanceId);
    return discardValue(card);
  });
}

function prioritizeDiscardGroups(actions, score) {
  const result = [];
  for (let index = 0; index < actions.length;) {
    const action = actions[index];
    if (!action.discardInstanceId) {
      result.push(action);
      index += 1;
      continue;
    }
    const key = discardGroupKey(action);
    const group = [];
    let cursor = index;
    while (cursor < actions.length && discardGroupKey(actions[cursor]) === key) {
      group.push(actions[cursor]);
      cursor += 1;
    }
    group.sort((left, right) => score(left) - score(right));
    result.push(...group);
    index = cursor;
  }
  return result;
}

function discardGroupKey(action) {
  if (!action?.discardInstanceId) return "";
  return [
    action.type,
    action.cardInstanceId ?? action.amuletInstanceId ?? "",
    action.playModeKey ?? "",
    action.targetInstanceId ?? "",
    action.cost ?? 0
  ].join("|");
}

function discardValue(instance) {
  if (!instance) return 9999;
  const card = instance.card ?? {};
  return Math.max(0, Number(card.cost ?? 0)) * 4
    + Math.max(0, Number(card.attack ?? 0))
    + Math.max(0, Number(card.defense ?? 0))
    + (Array.isArray(card.keywords) ? card.keywords.length * 2 : 0);
}

function uniqueModeKeys(actions) {
  return new Set(actions.map(action => action.playModeKey ?? `base:${action.cost ?? 0}`));
}

function setHelp(text, status) {
  const help = document.querySelector("#battle-help");
  const statusNode = document.querySelector("#battle-lab-status");
  if (help) help.textContent = text;
  if (statusNode) {
    statusNode.textContent = status;
    statusNode.dataset.status = "ready";
  }
}

function installStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #battle-player-hand .sb-battle-card.is-discard-candidate {
      outline: 2px solid currentColor;
      outline-offset: 3px;
      filter: brightness(1.16) saturate(1.08);
    }
    #battle-player-hand .sb-battle-card.is-discard-selected {
      transform: translateY(-10px) scale(1.04);
      filter: brightness(1.28) saturate(1.18);
    }
    #battle-player-hand .sb-discard-marker {
      letter-spacing: .04em;
    }
  `;
  document.head.append(style);
}
