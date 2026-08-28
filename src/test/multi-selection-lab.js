import { GameSession } from "../core/game-session.js";

const originalListLegalActions = GameSession.prototype.listLegalActions;
let activeSession = null;
let pending = null;
let selectedDiscardInstanceId = null;
let replaying = false;
let pendingHandCopy = null;
let selectedHandCopyIds = new Set();
let replayingHandCopy = false;
let pendingEvolutionMode = null;
let replayingEvolution = false;

GameSession.prototype.listLegalActions = function patchedListLegalActions(playerIndex = this.activePlayer) {
  activeSession = this;
  let actions = originalListLegalActions.call(this, playerIndex);
  if (playerIndex === 1) actions = prioritizeCpuDiscardVariants(actions, this, playerIndex);
  if (playerIndex === 0 && pending && selectedDiscardInstanceId) {
    actions = prioritizeSelectedDiscard(actions, pending, selectedDiscardInstanceId);
  }
  if (playerIndex === 0 && pendingHandCopy && selectedHandCopyIds.size) {
    actions = prioritizeSelectedHandCopy(actions, pendingHandCopy, selectedHandCopyIds);
  }
  if (playerIndex === 0 && pendingEvolutionMode) {
    actions = prioritizeEvolutionMode(actions, pendingEvolutionMode);
  }
  return actions;
};

installStyles();
document.addEventListener("click", captureMultiSelection, true);
document.addEventListener("click", () => queueMicrotask(syncFromRenderedSelection));

function captureMultiSelection(event) {
  if (!activeSession || activeSession.phase !== "main" || activeSession.activePlayer !== 0) return;

  const evolutionButton = event.target.closest?.("#battle-player-board .sb-battle-evolution-button:not(.is-engage)");
  if (evolutionButton && !replayingEvolution) {
    const unit = evolutionButton.closest?.(".sb-battle-unit[data-instance-id]");
    const sourceId = unit?.dataset.instanceId ?? null;
    const type = evolutionButton.classList.contains("is-super") ? "super-evolve" : "evolve";
    const modeActions = uniqueEvolutionModeActions(rawActions(0).filter(action => action.type === type && action.followerInstanceId === sourceId));
    if (modeActions.length > 1) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showEvolutionModeMenu(evolutionButton, { type, sourceId, actions: modeActions });
      return;
    }
  }

  const handCard = event.target.closest?.("#battle-player-hand .sb-battle-card[data-instance-id]");
  if (handCard && pendingHandCopy && !replayingHandCopy && isHandCopyCandidate(handCard.dataset.instanceId)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleHandCopyCandidate(handCard.dataset.instanceId);
    return;
  }

  if (handCard && pending && !replaying && isDiscardCandidate(handCard.dataset.instanceId)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    selectDiscard(handCard.dataset.instanceId);
    return;
  }

  const boardTarget = event.target.closest?.("#battle-player-board .sb-battle-unit-hitbox, #battle-opponent-board .sb-battle-unit-hitbox");
  if (boardTarget && pending && pendingHasTarget() && !selectedDiscardInstanceId) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setHelp(`Choose a highlighted card in your hand to ${selectionVerb()} before selecting the effect target.`, selectionStatus());
    return;
  }

  if (replaying || replayingHandCopy) return;

  const engageButton = event.target.closest?.("#battle-player-board .sb-battle-evolution-button.is-engage");
  if (engageButton) {
    const unit = engageButton.closest?.(".sb-battle-unit[data-instance-id]");
    const sourceId = unit?.dataset.instanceId ?? null;
    const actions = sourceId
      ? rawActions(0).filter(action => action.type === "engage" && action.amuletInstanceId === sourceId && action.discardInstanceId)
      : [];
    if (actions.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      beginSelection({
        sourceType: "engage",
        sourceId,
        playModeKey: null,
        replayNode: engageButton,
        replayAfterDiscard: true
      });
      return;
    }
  }

  if (!handCard) return;

  const sourceId = handCard.dataset.instanceId;
  const actions = rawActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === sourceId);
  const handCopyActions = actions.filter(action => Array.isArray(action.handCopyInstanceIds) && action.handCopyInstanceIds.length > 0);
  if (handCopyActions.length && uniqueModeKeys(handCopyActions).size <= 1) {
    event.preventDefault();
    event.stopImmediatePropagation();
    beginHandCopySelection({
      sourceId,
      playModeKey: handCopyActions[0]?.playModeKey ?? null,
      replayNode: handCard
    });
    return;
  }

  const discardActions = actions.filter(action => action.discardInstanceId);
  if (discardActions.length && discardActions.every(action => !action.targetInstanceId) && uniqueModeKeys(discardActions).size <= 1) {
    event.preventDefault();
    event.stopImmediatePropagation();
    beginSelection({
      sourceType: "play-card",
      sourceId,
      playModeKey: discardActions[0]?.playModeKey ?? null,
      replayNode: handCard,
      replayAfterDiscard: true
    });
  }
}

function syncFromRenderedSelection() {
  if (!activeSession || activeSession.phase !== "main" || activeSession.activePlayer !== 0) {
    clearSelection();
    clearHandCopySelection();
    clearEvolutionModeSelection();
    return;
  }

  if (pendingEvolutionMode && !rawActions(0).some(action =>
    action.type === pendingEvolutionMode.type
    && action.followerInstanceId === pendingEvolutionMode.sourceId
    && action.evolutionModeKey === pendingEvolutionMode.evolutionModeKey
  )) {
    clearEvolutionModeSelection();
  }

  if (pendingHandCopy) {
    if (!handCopyActions().length) clearHandCopySelection();
    else decorateHandCopyCandidates();
  }

  const selectedPlay = document.querySelector("#battle-player-hand .sb-battle-card.is-selected[data-instance-id]");
  if (selectedPlay && !document.querySelector("#battle-player-hand .sb-battle-mode-menu")) {
    const sourceId = selectedPlay.dataset.instanceId;
    const actions = rawActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === sourceId && action.discardInstanceId);
    if (actions.length) {
      const modeKeys = uniqueModeKeys(actions);
      beginSelection({
        sourceType: "play-card",
        sourceId,
        playModeKey: modeKeys.size === 1 ? actions[0].playModeKey ?? null : pending?.playModeKey ?? null,
        replayNode: selectedPlay,
        replayAfterDiscard: false
      }, { preserveDiscard: pending?.sourceType === "play-card" && pending?.sourceId === sourceId });
      return;
    }
  }

  const selectedEngage = document.querySelector("#battle-player-board .sb-battle-unit.is-engage-selected[data-instance-id]");
  if (selectedEngage && pending?.sourceType === "engage" && selectedEngage.dataset.instanceId === pending.sourceId) {
    decorateDiscardCandidates();
    return;
  }

  if (pending && !pendingSourceStillLegal()) clearSelection();
}

function showEvolutionModeMenu(button, selection) {
  clearEvolutionModeMenu();
  const controls = button.closest?.(".sb-battle-evolution-controls") ?? button.parentElement;
  if (!controls) return;

  const menu = document.createElement("span");
  menu.className = "sb-battle-mode-menu sb-evolution-mode-menu";
  menu.dataset.evolutionModeMenu = "true";
  for (const action of selection.actions) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "sb-battle-mode-button";
    option.textContent = evolutionModeLabel(action);
    option.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectEvolutionMode(button, selection, action);
    }, { capture: true });
    menu.append(option);
  }
  controls.append(menu);
  setHelp(`Choose the ${selection.type === "super-evolve" ? "Super Evo" : "Evo"} ability mode.`, "Choose evolution mode");
}

function selectEvolutionMode(button, selection, action) {
  pendingEvolutionMode = {
    type: selection.type,
    sourceId: selection.sourceId,
    evolutionModeKey: action.evolutionModeKey
  };
  clearEvolutionModeMenu();
  replayingEvolution = true;
  try {
    button.click();
  } finally {
    replayingEvolution = false;
  }
  queueMicrotask(syncFromRenderedSelection);
}

function clearEvolutionModeSelection() {
  pendingEvolutionMode = null;
  clearEvolutionModeMenu();
}

function clearEvolutionModeMenu() {
  for (const menu of document.querySelectorAll("[data-evolution-mode-menu='true']")) menu.remove();
}

function uniqueEvolutionModeActions(actions) {
  const seen = new Set();
  const result = [];
  for (const action of actions) {
    const key = action.evolutionModeKey ?? "default";
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
  }
  return result;
}

function evolutionModeLabel(action) {
  const indices = action?.evolutionMode?.selectedModeIndices ?? [];
  if (indices.length > 1) return `Modes ${indices.join(" + ")}`;
  const index = indices[0] ?? action?.evolutionMode?.modeIndex ?? 1;
  return `Mode ${index}`;
}

function prioritizeEvolutionMode(actions, selection) {
  const preferred = [];
  const sameSourceOtherModes = [];
  const rest = [];
  for (const action of actions) {
    const sameSource = action.type === selection.type && action.followerInstanceId === selection.sourceId;
    if (!sameSource) rest.push(action);
    else if (action.evolutionModeKey === selection.evolutionModeKey) preferred.push(action);
    else sameSourceOtherModes.push(action);
  }
  return [...preferred, ...sameSourceOtherModes, ...rest];
}

function beginSelection(next, { preserveDiscard = false } = {}) {
  clearHandCopySelection();
  pending = next;
  if (!preserveDiscard) selectedDiscardInstanceId = null;
  decorateDiscardCandidates();
  const hasTarget = pendingHasTarget();
  const verb = selectionVerb();
  setHelp(
    selectedDiscardInstanceId
      ? (hasTarget ? `${selectionNoun()} selected. Choose the highlighted effect target.` : `${selectionNoun()} selected. Resolving selection…`)
      : `Choose a highlighted card in your hand to ${verb}.`,
    selectedDiscardInstanceId ? (hasTarget ? "Choose effect target" : `${selectionNoun()} selected`) : selectionStatus()
  );
}

function beginHandCopySelection(next) {
  pending = null;
  selectedDiscardInstanceId = null;
  pendingHandCopy = next;
  selectedHandCopyIds = new Set();
  decorateHandCopyCandidates();
  updateHandCopyHelp();
}

function toggleHandCopyCandidate(instanceId) {
  const actions = handCopyActions();
  if (!actions.length) return;
  const next = new Set(selectedHandCopyIds);
  if (next.has(instanceId)) next.delete(instanceId);
  else next.add(instanceId);
  const viable = actions.some(action => isSubset(next, new Set(action.handCopyInstanceIds ?? [])));
  if (!viable) return;
  selectedHandCopyIds = next;
  decorateHandCopyCandidates();
  updateHandCopyHelp();

  const complete = actions.find(action => sameIdSet(selectedHandCopyIds, new Set(action.handCopyInstanceIds ?? [])));
  if (!complete || !pendingHandCopy?.replayNode) return;
  const node = pendingHandCopy.replayNode;
  replayingHandCopy = true;
  try {
    node.click();
  } finally {
    replayingHandCopy = false;
  }
  queueMicrotask(syncFromRenderedSelection);
}

function selectDiscard(instanceId) {
  selectedDiscardInstanceId = instanceId;
  decorateDiscardCandidates();

  if (pending?.replayAfterDiscard && pending?.replayNode) {
    const node = pending.replayNode;
    pending.replayAfterDiscard = false;
    replaying = true;
    try {
      node.click();
    } finally {
      replaying = false;
    }
    if (!pending || !pendingSourceStillLegal()) return;
  }

  if (pendingHasTarget()) {
    setHelp(`${selectionNoun()} selected. Choose the highlighted effect target.`, "Choose effect target");
    return;
  }

  setHelp(`${selectionNoun()} selected. Resolving selection…`, `${selectionNoun()} selected`);
}

function decorateDiscardCandidates() {
  clearDiscardDecorations();
  if (!pending) return;
  const candidateIds = new Set(selectionActions().map(action => action.discardInstanceId).filter(Boolean));
  const label = selectionNoun();
  for (const button of document.querySelectorAll("#battle-player-hand .sb-battle-card[data-instance-id]")) {
    const id = button.dataset.instanceId;
    if (!candidateIds.has(id)) continue;
    button.disabled = false;
    button.classList.add("is-discard-candidate");
    button.classList.toggle("is-discard-selected", id === selectedDiscardInstanceId);
    const marker = document.createElement("span");
    marker.className = "sb-battle-card-marker sb-discard-marker";
    marker.dataset.discardMarker = "true";
    marker.textContent = id === selectedDiscardInstanceId ? `${label} ✓` : label;
    button.append(marker);
  }
}

function decorateHandCopyCandidates() {
  clearHandCopyDecorations();
  if (!pendingHandCopy) return;
  const candidateIds = new Set(handCopyActions().flatMap(action => action.handCopyInstanceIds ?? []));
  for (const button of document.querySelectorAll("#battle-player-hand .sb-battle-card[data-instance-id]")) {
    const id = button.dataset.instanceId;
    if (!candidateIds.has(id)) continue;
    button.disabled = false;
    button.classList.add("is-copy-candidate");
    button.classList.toggle("is-copy-selected", selectedHandCopyIds.has(id));
    const marker = document.createElement("span");
    marker.className = "sb-battle-card-marker sb-copy-marker";
    marker.dataset.copyMarker = "true";
    marker.textContent = selectedHandCopyIds.has(id) ? "Copy ✓" : "Copy";
    button.append(marker);
  }
}

function clearDiscardDecorations() {
  for (const button of document.querySelectorAll("#battle-player-hand .sb-battle-card.is-discard-candidate")) {
    button.classList.remove("is-discard-candidate", "is-discard-selected");
  }
  for (const marker of document.querySelectorAll("[data-discard-marker='true']")) marker.remove();
}

function clearHandCopyDecorations() {
  for (const button of document.querySelectorAll("#battle-player-hand .sb-battle-card.is-copy-candidate")) {
    button.classList.remove("is-copy-candidate", "is-copy-selected");
  }
  for (const marker of document.querySelectorAll("[data-copy-marker='true']")) marker.remove();
}

function clearDecorations() {
  clearDiscardDecorations();
  clearHandCopyDecorations();
}

function clearSelection() {
  pending = null;
  selectedDiscardInstanceId = null;
  clearDiscardDecorations();
}

function clearHandCopySelection() {
  pendingHandCopy = null;
  selectedHandCopyIds = new Set();
  clearHandCopyDecorations();
}

function rawActions(playerIndex) {
  return activeSession ? originalListLegalActions.call(activeSession, playerIndex) : [];
}

function selectionActions() {
  if (!pending) return [];
  return rawActions(0).filter(action => {
    if (!action.discardInstanceId) return false;
    if (pending.sourceType === "engage") {
      return action.type === "engage" && action.amuletInstanceId === pending.sourceId;
    }
    return action.type === "play-card"
      && action.cardInstanceId === pending.sourceId
      && (!pending.playModeKey || action.playModeKey === pending.playModeKey);
  });
}

function handCopyActions() {
  if (!pendingHandCopy) return [];
  return rawActions(0).filter(action =>
    action.type === "play-card"
    && action.cardInstanceId === pendingHandCopy.sourceId
    && Array.isArray(action.handCopyInstanceIds)
    && (!pendingHandCopy.playModeKey || action.playModeKey === pendingHandCopy.playModeKey)
  );
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

function isHandCopyCandidate(instanceId) {
  return handCopyActions().some(action => (action.handCopyInstanceIds ?? []).includes(instanceId));
}

function prioritizeSelectedDiscard(actions, selection, discardInstanceId) {
  return prioritizeDiscardGroups(actions, action => {
    const sameSource = selection.sourceType === "engage"
      ? action.type === "engage" && action.amuletInstanceId === selection.sourceId
      : action.type === "play-card"
        && action.cardInstanceId === selection.sourceId
        && (!selection.playModeKey || action.playModeKey === selection.playModeKey);
    if (!sameSource || !action.discardInstanceId) return 1;
    return action.discardInstanceId === discardInstanceId ? 0 : 2;
  });
}

function prioritizeSelectedHandCopy(actions, selection, selectedIds) {
  const preferred = [];
  const rest = [];
  for (const action of actions) {
    const sameSource = action.type === "play-card"
      && action.cardInstanceId === selection.sourceId
      && Array.isArray(action.handCopyInstanceIds)
      && (!selection.playModeKey || action.playModeKey === selection.playModeKey);
    if (sameSource && sameIdSet(selectedIds, new Set(action.handCopyInstanceIds ?? []))) preferred.push(action);
    else rest.push(action);
  }
  return [...preferred, ...rest];
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
    action.cardInstanceId ?? "",
    action.amuletInstanceId ?? "",
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

function updateHandCopyHelp() {
  const actions = handCopyActions();
  const required = Number(actions[0]?.handCopySelectionCount ?? actions[0]?.handCopySelectionMax ?? 0);
  const selected = selectedHandCopyIds.size;
  setHelp(
    `Choose Artifact followers in your hand to summon exact copies (${selected}/${required}).`,
    `Choose copies ${selected}/${required}`
  );
}

function selectionKind() {
  const source = pendingSourceInstance();
  return /\breturn it to (?:your\s+)?deck\b/i.test(String(source?.card?.text ?? source?.activeText ?? "")) ? "return" : "discard";
}

function selectionVerb() {
  return selectionKind() === "return" ? "return it to your deck" : "discard it";
}

function selectionNoun() {
  return selectionKind() === "return" ? "Return" : "Discard";
}

function selectionStatus() {
  return selectionKind() === "return" ? "Choose return" : "Choose discard";
}

function pendingSourceInstance() {
  if (!activeSession || !pending?.sourceId) return null;
  if (pending.sourceType === "engage") return activeSession.findBoardCard(0, pending.sourceId);
  return activeSession.findHandCard(0, pending.sourceId);
}

function isSubset(left, right) {
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

function sameIdSet(left, right) {
  if (left.size !== right.size) return false;
  return isSubset(left, right);
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
    #battle-player-hand .sb-battle-card.is-discard-candidate,
    #battle-player-hand .sb-battle-card.is-copy-candidate {
      outline: 2px solid currentColor;
      outline-offset: 3px;
      filter: brightness(1.16) saturate(1.08);
    }
    #battle-player-hand .sb-battle-card.is-discard-selected,
    #battle-player-hand .sb-battle-card.is-copy-selected {
      transform: translateY(-10px) scale(1.04);
      filter: brightness(1.28) saturate(1.18);
    }
    #battle-player-hand .sb-discard-marker,
    #battle-player-hand .sb-copy-marker {
      letter-spacing: .04em;
    }
    #battle-player-board .sb-evolution-mode-menu {
      display: inline-flex;
      gap: .35rem;
      margin-left: .35rem;
      vertical-align: middle;
    }
  `;
  document.head.append(style);
}
