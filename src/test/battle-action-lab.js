import { createIntermediateController } from "../ai/intermediate-controller.js";
import { loadReferenceDecks } from "../ai/reference-decks.js";
import { GAME_IDS } from "../core/game-catalog.js";
import { resolveMatchSeed } from "../core/match-seed.js";
import { GAME_PHASE, GameSession } from "../core/game-session.js";
import { worldsBeyondProvider } from "../data/providers/worlds-beyond.js";
import { BattleAnimationQueue } from "../ui/battle-animation-queue.js";

const ui = {
  game: document.querySelector("#test-game"),
  seed: document.querySelector("#test-seed"),
  playerDeck: document.querySelector("#battle-player-deck"),
  cpuDeck: document.querySelector("#battle-cpu-deck"),
  start: document.querySelector("#battle-start"),
  mulligan: document.querySelector("#battle-mulligan"),
  bonusPp: document.querySelector("#battle-bonus-pp"),
  endTurn: document.querySelector("#battle-end-turn"),
  status: document.querySelector("#battle-lab-status"),
  stage: document.querySelector("#battle-stage"),
  overlay: document.querySelector("#battle-overlay"),
  turnLabel: document.querySelector("#battle-turn-label"),
  phaseLabel: document.querySelector("#battle-phase-label"),
  help: document.querySelector("#battle-help"),
  eventLog: document.querySelector("#battle-event-log"),
  playerName: document.querySelector("#battle-player-name"),
  playerResource: document.querySelector("#battle-player-resource"),
  playerHp: document.querySelector("#battle-player-hp"),
  playerHand: document.querySelector("#battle-player-hand"),
  playerBoard: document.querySelector("#battle-player-board"),
  opponentName: document.querySelector("#battle-opponent-name"),
  opponentResource: document.querySelector("#battle-opponent-resource"),
  opponentHp: document.querySelector("#battle-opponent-hp"),
  opponentHand: document.querySelector("#battle-opponent-hand"),
  opponentBoard: document.querySelector("#battle-opponent-board"),
  opponentLeader: document.querySelector(".sb-battle-side-opponent .sb-player-line")
};

let cards = new Map();
let decks = [];
let session = null;
let eventCursor = 0;
let mulliganSelection = new Set();
let selectedAttacker = null;
let selectedPlayCard = null;
let selectedPlayModeKey = null;
let selectedEngageAmulet = null;
let selectedEvolution = null;
let selectedFuseTarget = null;
let selectedFuseMaterials = new Set();
let cpuBusy = false;
let dataReady = false;
let queue = createQueue();
let cpuController = null;

claimControls();
initialize();

async function initialize() {
  try {
    setStatus("Loading action resolver…", "planned");
    const [cardRows, referenceDecks] = await Promise.all([
      worldsBeyondProvider.loadCards(),
      loadReferenceDecks(GAME_IDS.WORLDS_BEYOND, { baseUrl: new URL("../", document.baseURI).href })
    ]);
    cards = new Map(cardRows.map(card => [String(card.sourceCardId ?? card.id), card]));
    decks = referenceDecks.filter(deck => deck.cards.reduce((sum, row) => sum + Number(row.qty ?? 1), 0) === 40 && deck.cards.every(row => cards.has(String(row.cardId))));
    if (decks.length < 2) throw new Error("Two complete Worlds Beyond reference decks are required");
    fillSelect(ui.playerDeck, decks, 0);
    fillSelect(ui.cpuDeck, decks, Math.min(1, decks.length - 1));
    dataReady = true;
    syncAvailability();
  } catch (error) {
    console.error(error);
    dataReady = false;
    setStatus("Action lab unavailable", "planned");
    ui.help.textContent = error instanceof Error ? error.message : String(error);
  }
}

function claimControls() {
  bindCapture(ui.start, startMatch);
  bindCapture(ui.mulligan, confirmMulligan);
  bindCapture(ui.bonusPp, useBonusPp);
  bindCapture(ui.endTurn, endHumanTurn);
  ui.game?.addEventListener("change", syncAvailability);
  ui.opponentLeader?.addEventListener("click", attackOpponentLeader);
}

function bindCapture(node, handler) {
  node?.addEventListener("click", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    Promise.resolve(handler()).catch(showError);
  }, { capture: true });
}

function syncAvailability() {
  const supported = ui.game?.value === GAME_IDS.WORLDS_BEYOND;
  ui.playerDeck.disabled = !supported || !dataReady || cpuBusy;
  ui.cpuDeck.disabled = !supported || !dataReady || cpuBusy;
  ui.start.disabled = !supported || !dataReady || cpuBusy;
  if (!supported) {
    setStatus("Ruleset migration pending", "planned");
    ui.help.textContent = "This action lab is currently bound to Worlds Beyond V6 Alpha. SV1 and Champion's Battle will reuse the same GameSession action API.";
  } else if (!session && dataReady) {
    setStatus("SVWB action resolver ready", "ready");
    ui.help.textContent = "Start a match. Play modes, Fuse, Engage, targeting, combat, Evo and class resources are resolved action by action.";
  }
}

async function startMatch() {
  if (!dataReady || ui.game.value !== GAME_IDS.WORLDS_BEYOND || cpuBusy) return;
  const humanDeck = decks.find(deck => deck.id === ui.playerDeck.value);
  const cpuDeck = decks.find(deck => deck.id === ui.cpuDeck.value);
  if (!humanDeck || !cpuDeck) return;

  const matchSeed = resolveMatchSeed(ui.seed.value);
  cpuController = createIntermediateController({
    seed: `${matchSeed}:cpu:1`,
    strategy: cpuDeck.strategy
  });
  eventCursor = 0;
  mulliganSelection = new Set();
  clearSelections();
  ui.eventLog.replaceChildren();
  queue = createQueue();
  session = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: matchSeed,
    firstPlayer: "random",
    cardCatalog: [...cards.values()],
    players: [
      { name: humanDeck.name, className: humanDeck.class, deck: expandDeck(humanDeck) },
      { name: cpuDeck.name, className: cpuDeck.class, deck: expandDeck(cpuDeck) }
    ]
  });
  session.start();
  session.submitMulligan(1, cpuController.chooseMulligan(session, 1));
  render();
  await consumeEvents();
}

async function confirmMulligan() {
  if (!session || session.phase !== GAME_PHASE.MULLIGAN || session.players[0].mulliganDone) return;
  session.submitMulligan(0, [...mulliganSelection]);
  mulliganSelection.clear();
  await consumeEvents();
  render();
  await runCpuTurnIfNeeded();
}

async function useBonusPp() {
  if (!isHumanTurn()) return;
  session.useBonusPp(0);
  await consumeEvents();
  render();
}

async function endHumanTurn() {
  if (!isHumanTurn()) return;
  clearSelections();
  session.endTurn(0);
  await consumeEvents();
  render();
  await runCpuTurnIfNeeded();
}

async function playHumanCard(instanceId) {
  if (!isHumanTurn()) return;
  const actions = legalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === instanceId);
  if (!actions.length) return;
  const modes = uniqueModeActions(actions);
  clearEngageAndAttack();
  clearFuseSelectionState();

  if (modes.length > 1) {
    if (selectedPlayCard === instanceId && selectedPlayModeKey == null) selectedPlayCard = null;
    else selectedPlayCard = instanceId;
    selectedPlayModeKey = null;
    render();
    return;
  }
  await choosePlayMode(instanceId, modes[0]?.playModeKey ?? actions[0].playModeKey ?? null);
}

async function choosePlayMode(instanceId, playModeKey) {
  if (!isHumanTurn()) return;
  const actions = legalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === instanceId && (!playModeKey || action.playModeKey === playModeKey));
  if (!actions.length) return;
  const targeted = actions.filter(action => action.targetInstanceId);
  clearEngageAndAttack();
  clearFuseSelectionState();
  selectedPlayCard = instanceId;
  selectedPlayModeKey = playModeKey ?? actions[0].playModeKey ?? null;
  if (targeted.length) {
    render();
    return;
  }
  const action = actions[0];
  clearSelections();
  await resolveAction(action);
}

function selectFuseTarget(instanceId) {
  if (!isHumanTurn()) return;
  const actions = fuseActionsForTarget(instanceId);
  if (!actions.length) return;
  const toggleOff = selectedFuseTarget === instanceId;
  clearSelections();
  if (!toggleOff) selectedFuseTarget = instanceId;
  render();
}

function toggleFuseMaterial(instanceId) {
  if (!isHumanTurn() || !selectedFuseTarget) return;
  const actions = fuseActionsForTarget(selectedFuseTarget);
  const candidateIds = new Set(actions.flatMap(action => action.materialInstanceIds ?? []));
  if (!candidateIds.has(instanceId)) return;

  const next = new Set(selectedFuseMaterials);
  if (next.has(instanceId)) next.delete(instanceId);
  else next.add(instanceId);
  const viable = actions.some(action => isSubset(next, new Set(action.materialInstanceIds ?? [])));
  if (!viable) return;
  selectedFuseMaterials = next;
  render();
}

async function confirmFuse() {
  if (!isHumanTurn()) return;
  const action = selectedFuseAction();
  if (!action) return;
  clearSelections();
  await resolveAction(action);
}

function selectedFuseAction() {
  if (!selectedFuseTarget) return null;
  return fuseActionsForTarget(selectedFuseTarget).find(action => sameIdSet(selectedFuseMaterials, new Set(action.materialInstanceIds ?? []))) ?? null;
}

function fuseActionsForTarget(instanceId) {
  return legalActions(0).filter(action => action.type === "fuse" && action.targetInstanceId === instanceId);
}

async function engageAmulet(instanceId) {
  if (!isHumanTurn()) return;
  const actions = legalActions(0).filter(action => action.type === "engage" && action.amuletInstanceId === instanceId);
  if (!actions.length) return;
  clearSelections();
  const targeted = actions.filter(action => action.targetInstanceId);
  if (targeted.length) {
    selectedEngageAmulet = instanceId;
    render();
    return;
  }
  await resolveAction(actions[0]);
}

async function selectAttacker(instanceId) {
  if (!isHumanTurn()) return;
  const attacks = legalActions(0).filter(action => action.type === "attack" && action.attackerInstanceId === instanceId);
  if (!attacks.length) return;
  const toggledOff = selectedAttacker === instanceId;
  clearSelections();
  selectedAttacker = toggledOff ? null : instanceId;
  render();
}

async function resolveEffectFollowerTarget(instanceId) {
  if (selectedPlayCard) {
    const action = legalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === selectedPlayCard && (!selectedPlayModeKey || item.playModeKey === selectedPlayModeKey) && item.targetInstanceId === instanceId);
    if (!action) return false;
    clearSelections();
    await resolveAction(action);
    return true;
  }
  if (selectedEngageAmulet) {
    const action = legalActions(0).find(item => item.type === "engage" && item.amuletInstanceId === selectedEngageAmulet && item.targetInstanceId === instanceId);
    if (!action) return false;
    clearSelections();
    await resolveAction(action);
    return true;
  }
  if (selectedEvolution) {
    const action = legalActions(0).find(item => item.type === selectedEvolution.type && item.followerInstanceId === selectedEvolution.followerInstanceId && item.targetInstanceId === instanceId);
    if (!action) return false;
    clearSelections();
    await resolveAction(action);
    return true;
  }
  return false;
}

async function resolveAlliedFollowerTarget(instanceId) {
  if (!isHumanTurn()) return;
  await resolveEffectFollowerTarget(instanceId);
}

async function resolveEnemyFollowerTarget(instanceId) {
  if (!isHumanTurn()) return;
  if (await resolveEffectFollowerTarget(instanceId)) return;
  if (!selectedAttacker) return;
  const action = legalActions(0).find(item => item.type === "attack" && item.attackerInstanceId === selectedAttacker && item.targetInstanceId === instanceId);
  if (!action) return;
  clearSelections();
  await resolveAction(action);
}

async function attackOpponentLeader() {
  if (!isHumanTurn() || !selectedAttacker || selectedPlayCard || selectedEngageAmulet || selectedEvolution || selectedFuseTarget) return;
  const action = legalActions(0).find(item => item.type === "attack" && item.attackerInstanceId === selectedAttacker && item.target === "leader");
  if (!action) return;
  clearSelections();
  await resolveAction(action);
}

async function evolveFollower(instanceId, superEvolution) {
  if (!isHumanTurn()) return;
  const type = superEvolution ? "super-evolve" : "evolve";
  const actions = legalActions(0).filter(item => item.type === type && item.followerInstanceId === instanceId);
  if (!actions.length) return;
  const targeted = actions.filter(action => action.targetInstanceId);
  clearSelections();
  if (targeted.length) {
    selectedEvolution = { type, followerInstanceId: instanceId };
    render();
    return;
  }
  await resolveAction(actions[0]);
}

async function resolveAction(action) {
  session.dispatch(action);
  await consumeEvents();
  render();
}

async function runCpuTurnIfNeeded() {
  if (!session || session.phase !== GAME_PHASE.MAIN || session.activePlayer !== 1 || cpuBusy) return;
  cpuBusy = true;
  clearSelections();
  render();
  try {
    for (let step = 0; step < 24 && session.phase === GAME_PHASE.MAIN && session.activePlayer === 1; step += 1) {
      if (cpuController?.shouldUseBonusPp(session, 1)) {
        session.useBonusPp(1);
        await consumeEvents();
        render();
        await pause(120);
        continue;
      }
      const decision = cpuController?.chooseAction(session, 1) ?? null;
      const action = decision?.action ?? null;
      if (!action) break;
      session.dispatch(action);
      await consumeEvents();
      render();
      await pause(90);
    }
    if (session.phase === GAME_PHASE.MAIN && session.activePlayer === 1) {
      session.endTurn(1);
      await consumeEvents();
      render();
    }
  } finally {
    cpuBusy = false;
    render();
  }
}

function legalActions(playerIndex) {
  return session?.listLegalActions(playerIndex) ?? [];
}

function isHumanTurn() {
  return Boolean(session && session.phase === GAME_PHASE.MAIN && session.activePlayer === 0 && !cpuBusy);
}

function render() {
  if (!session) return;
  const snapshot = session.getSnapshot(0);
  const human = snapshot.players[0];
  const cpu = snapshot.players[1];
  ui.stage.dataset.phase = snapshot.phase;
  ui.stage.dataset.activePlayer = String(snapshot.activePlayer ?? "");
  renderLeader(human, ui.playerName, ui.playerResource, ui.playerHp);
  renderLeader(cpu, ui.opponentName, ui.opponentResource, ui.opponentHp);
  renderHand(ui.playerHand, human, true);
  renderHand(ui.opponentHand, cpu, false);
  renderBoard(ui.playerBoard, human.board, 0);
  renderBoard(ui.opponentBoard, cpu.board, 1);

  const humanActions = isHumanTurn() ? legalActions(0) : [];
  const canHitLeader = selectedAttacker && !selectedPlayCard && !selectedEngageAmulet && !selectedEvolution && !selectedFuseTarget && humanActions.some(action => action.type === "attack" && action.attackerInstanceId === selectedAttacker && action.target === "leader");
  ui.opponentLeader.classList.toggle("is-targetable", Boolean(canHitLeader));

  ui.mulligan.disabled = snapshot.phase !== GAME_PHASE.MULLIGAN || human.mulliganDone || cpuBusy;
  ui.endTurn.disabled = !isHumanTurn();
  ui.bonusPp.disabled = !isHumanTurn() || !human.resources.bonusPpAvailable;
  ui.start.disabled = !dataReady || cpuBusy || ui.game.value !== GAME_IDS.WORLDS_BEYOND;
  ui.playerDeck.disabled = cpuBusy;
  ui.cpuDeck.disabled = cpuBusy;

  if (snapshot.phase === GAME_PHASE.MULLIGAN) {
    ui.overlay.hidden = true;
    ui.phaseLabel.textContent = "Mulligan";
    ui.turnLabel.textContent = "MULLIGAN";
    ui.help.textContent = "Choose the cards to replace, then confirm. The CPU mulligan stays hidden.";
    setStatus("Mulligan in progress", "ready");
  } else if (snapshot.phase === GAME_PHASE.MAIN) {
    ui.overlay.hidden = true;
    const active = snapshot.players[snapshot.activePlayer];
    ui.phaseLabel.textContent = `${active?.name ?? "Player"}'s turn`;
    ui.turnLabel.textContent = `${snapshot.activePlayer === 0 ? "YOUR" : "CPU"} TURN · ${active?.personalTurn ?? 0}`;
    if (cpuBusy || snapshot.activePlayer === 1) {
      ui.help.textContent = "CPU is executing the V6 Intermediate controller over the legal GameSession action graph.";
      setStatus("CPU resolving actions", "ready");
    } else if (selectedFuseTarget) {
      ui.help.textContent = `Choose highlighted Fuse materials, then confirm. ${selectedFuseMaterials.size} selected.`;
      setStatus("Choose Fuse materials", "ready");
    } else if (selectedPlayCard && selectedPlayModeKey == null && selectedCardModeCount() > 1) {
      ui.help.textContent = "Choose the play mode for the selected card.";
      setStatus("Choose play mode", "ready");
    } else if (selectedPlayCard) {
      ui.help.textContent = "Choose a highlighted follower as the card effect target. Click the selected card again to cancel.";
      setStatus("Choose effect target", "ready");
    } else if (selectedEngageAmulet) {
      ui.help.textContent = "Choose a highlighted follower as the Engage target.";
      setStatus("Choose Engage target", "ready");
    } else if (selectedEvolution) {
      ui.help.textContent = `Choose a highlighted follower as the ${selectedEvolution.type === "super-evolve" ? "Super Evo" : "Evo"} effect target.`;
      setStatus("Choose evolution target", "ready");
    } else if (selectedAttacker) {
      ui.help.textContent = "Choose a highlighted enemy follower or the enemy leader as the attack target.";
      setStatus("Choose attack target", "ready");
    } else {
      ui.help.textContent = "Playable cards glow. Fuse sources expose a dedicated selector; Base, Enhance, Accelerate, Crystallize and Engage share the same legal action graph.";
      setStatus("Human action phase", "ready");
    }
  } else if (snapshot.phase === GAME_PHASE.ENDED) {
    const winner = snapshot.winner == null ? null : snapshot.players[snapshot.winner];
    ui.phaseLabel.textContent = "Match ended";
    ui.turnLabel.textContent = "RESULT";
    ui.overlay.hidden = false;
    ui.overlay.querySelector("strong").textContent = winner ? `${winner.name} wins` : "Match ended";
    ui.overlay.querySelector("span").textContent = snapshot.endReason ?? "resolved";
    setStatus("Match complete", "ready");
  }
}

function renderLeader(player, nameNode, resourceNode, hpNode) {
  nameNode.textContent = player.name;
  hpNode.textContent = String(player.hp);
  const resources = player.resources ?? {};
  const parts = [
    `PP ${resources.pp ?? 0}/${resources.maxPp ?? 0}`,
    `Evo ${resources.evolutionPoints ?? 0}`,
    `Super Evo ${resources.superEvolutionPoints ?? 0}`
  ];
  const className = String(player.className ?? "").toLowerCase();
  if (className.includes("abyss")) parts.push(`Shadows ${resources.shadows ?? 0}`);
  if (className.includes("forest")) parts.push(`Combo ${resources.combo ?? 0}`);
  if (className.includes("dragon")) parts.push(`Overflow ${Number(resources.maxPp ?? 0) >= 7 ? "ON" : "OFF"}`);
  if (Number(player.fusedCount ?? 0) > 0) parts.push(`Fused ${player.fusedCount}`);
  if (resources.bonusPpAvailable) parts.push("Bonus PP");
  resourceNode.textContent = parts.join(" · ");
}

function renderHand(root, player, human) {
  root.replaceChildren();
  const allActions = human && isHumanTurn() ? legalActions(0) : [];
  const actions = allActions.filter(action => action.type === "play-card");
  const fuseActions = allActions.filter(action => action.type === "fuse");
  const playable = new Set(actions.map(action => action.cardInstanceId));
  const fuseTargetIds = new Set(fuseActions.map(action => action.targetInstanceId));
  const activeFuseActions = selectedFuseTarget ? fuseActions.filter(action => action.targetInstanceId === selectedFuseTarget) : [];
  const fuseMaterialIds = new Set(activeFuseActions.flatMap(action => action.materialInstanceIds ?? []));
  let selectedModeActions = [];

  for (const card of player.hand) {
    if (!card) {
      root.append(cardBack());
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sb-battle-card";
    button.dataset.instanceId = card.instanceId;
    button.title = `${card.name ?? "Card"} · ${card.cost ?? 0} PP`;
    const image = document.createElement("img");
    image.src = card.image ?? "";
    image.alt = card.name ?? "Card";
    button.append(image);
    const cost = document.createElement("span");
    cost.className = "sb-battle-card-cost";
    cost.textContent = String(card.cost ?? 0);
    button.append(cost);

    if (human && session.phase === GAME_PHASE.MULLIGAN && !player.mulliganDone) {
      button.classList.add("is-mulligan-selectable");
      button.classList.toggle("is-selected", mulliganSelection.has(card.instanceId));
      const marker = document.createElement("span");
      marker.className = "sb-battle-card-marker";
      marker.textContent = "Replace";
      button.append(marker);
      button.addEventListener("click", () => {
        if (mulliganSelection.has(card.instanceId)) mulliganSelection.delete(card.instanceId);
        else mulliganSelection.add(card.instanceId);
        render();
      });
    } else if (human && selectedFuseTarget) {
      if (card.instanceId === selectedFuseTarget) {
        button.classList.add("is-fuse-target", "is-fuse-selected");
        const marker = document.createElement("span");
        marker.className = "sb-battle-card-marker";
        marker.textContent = "Fuse source";
        button.append(marker);
        button.addEventListener("click", () => selectFuseTarget(card.instanceId));
      } else if (fuseMaterialIds.has(card.instanceId)) {
        button.classList.add("is-fuse-material");
        button.classList.toggle("is-fuse-material-selected", selectedFuseMaterials.has(card.instanceId));
        const marker = document.createElement("span");
        marker.className = "sb-battle-card-marker";
        marker.textContent = selectedFuseMaterials.has(card.instanceId) ? "Selected" : "Material";
        button.append(marker);
        button.addEventListener("click", () => toggleFuseMaterial(card.instanceId));
      } else {
        button.disabled = true;
      }
    } else if (human && playable.has(card.instanceId)) {
      button.classList.add("is-playable");
      if (selectedPlayCard === card.instanceId) {
        button.classList.add("is-selected");
        selectedModeActions = uniqueModeActions(actions.filter(action => action.cardInstanceId === card.instanceId));
        const marker = document.createElement("span");
        marker.className = "sb-battle-card-marker";
        marker.textContent = selectedPlayModeKey ? modeLabel(selectedModeActions.find(action => action.playModeKey === selectedPlayModeKey) ?? selectedModeActions[0]) : (selectedModeActions.length > 1 ? "Mode" : "Target");
        button.append(marker);
      }
      button.addEventListener("click", () => playHumanCard(card.instanceId).catch(showError));
    } else {
      button.disabled = true;
    }
    if (human && !selectedFuseTarget && fuseTargetIds.has(card.instanceId)) button.classList.add("is-fuse-target");
    root.append(button);
  }

  if (human && selectedFuseTarget) root.append(renderFuseSelectionMenu());
  else if (human && selectedPlayCard && selectedModeActions.length > 1 && selectedPlayModeKey == null) root.append(renderModeMenu(selectedModeActions));
  else if (human && !selectedPlayCard && !selectedEngageAmulet && !selectedEvolution && !selectedAttacker && fuseActions.length) root.append(renderFuseTargetMenu(fuseActions));
}

function renderFuseTargetMenu(actions) {
  const menu = document.createElement("div");
  menu.className = "sb-battle-fuse-menu";
  const seen = new Set();
  for (const action of actions) {
    if (seen.has(action.targetInstanceId)) continue;
    seen.add(action.targetInstanceId);
    const source = session.findHandCard(0, action.targetInstanceId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sb-battle-fuse-button";
    button.textContent = `Fuse · ${source?.card?.name ?? "card"}`;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      selectFuseTarget(action.targetInstanceId);
    });
    menu.append(button);
  }
  return menu;
}

function renderFuseSelectionMenu() {
  const menu = document.createElement("div");
  menu.className = "sb-battle-fuse-menu is-selecting";
  const action = selectedFuseAction();
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "sb-battle-fuse-button is-confirm";
  confirm.textContent = action ? `Fuse ${action.materialInstanceIds.length}` : `Select material${selectedFuseMaterials.size === 1 ? "" : "s"}`;
  confirm.disabled = !action;
  confirm.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    confirmFuse().catch(showError);
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "sb-battle-fuse-button is-cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    clearFuseSelectionState();
    render();
  });
  menu.append(confirm, cancel);
  return menu;
}

function renderModeMenu(actions) {
  const menu = document.createElement("div");
  menu.className = "sb-battle-mode-menu";
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sb-battle-mode-button";
    button.textContent = modeLabel(action);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      choosePlayMode(action.cardInstanceId, action.playModeKey).catch(showError);
    });
    menu.append(button);
  }
  return menu;
}

function modeLabel(action) {
  const mode = action?.playMode ?? {};
  if (mode.enhanced) return `Enhance ${action.cost}`;
  if (mode.crystallized) return `Crystallize ${action.cost}`;
  if (mode.accelerated) return `Accelerate ${action.cost}`;
  if (mode.kind === "mode") return `Mode ${mode.modeIndex || 1}`;
  return `Play ${action?.cost ?? 0}`;
}

function uniqueModeActions(actions) {
  const seen = new Set();
  return actions.filter(action => {
    const key = action.playModeKey ?? `base:${action.cost ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectedCardModeCount() {
  if (!selectedPlayCard || !isHumanTurn()) return 0;
  return uniqueModeActions(legalActions(0).filter(action => action.type === "play-card" && action.cardInstanceId === selectedPlayCard)).length;
}

function renderBoard(root, board, owner) {
  root.replaceChildren();
  const actions = isHumanTurn() ? legalActions(0) : [];
  for (let index = 0; index < 5; index += 1) {
    const card = board[index];
    if (!card) {
      const slot = document.createElement("span");
      slot.className = "sb-battle-field-slot";
      root.append(slot);
      continue;
    }
    const unit = document.createElement("div");
    unit.className = "sb-battle-unit";
    unit.dataset.instanceId = card.instanceId;
    unit.classList.toggle("is-evolved", Boolean(card.evolved));
    unit.classList.toggle("is-super-evolved", Boolean(card.superEvolved));
    unit.classList.toggle("is-engage-selected", selectedEngageAmulet === card.instanceId);
    const hitbox = document.createElement("button");
    hitbox.type = "button";
    hitbox.className = "sb-battle-unit-hitbox";
    const image = document.createElement("img");
    image.src = card.image ?? "";
    image.alt = card.name ?? "Board card";
    hitbox.append(image);
    const name = document.createElement("span");
    name.className = "sb-battle-unit-name";
    name.textContent = card.name ?? "Card";
    hitbox.append(name);
    if (String(card.type).toLowerCase() === "follower") hitbox.append(statBadge("attack", card.attack), statBadge("defense", card.defense));
    else if (card.countdown != null) hitbox.append(statBadge("countdown", card.countdown));
    unit.append(hitbox);

    if (owner === 0) {
      const attackReady = actions.some(action => action.type === "attack" && action.attackerInstanceId === card.instanceId);
      const playTarget = Boolean(selectedPlayCard && selectedPlayModeKey && actions.some(action => action.type === "play-card" && action.cardInstanceId === selectedPlayCard && action.playModeKey === selectedPlayModeKey && action.targetInstanceId === card.instanceId));
      const engageTarget = Boolean(selectedEngageAmulet && actions.some(action => action.type === "engage" && action.amuletInstanceId === selectedEngageAmulet && action.targetInstanceId === card.instanceId));
      const evolutionTarget = Boolean(selectedEvolution && actions.some(action => action.type === selectedEvolution.type && action.followerInstanceId === selectedEvolution.followerInstanceId && action.targetInstanceId === card.instanceId));
      const effectTarget = playTarget || engageTarget || evolutionTarget;
      hitbox.disabled = !(effectTarget || attackReady);
      unit.classList.toggle("is-attacker-ready", attackReady && !effectTarget);
      unit.classList.toggle("is-attacker-selected", selectedAttacker === card.instanceId || selectedEvolution?.followerInstanceId === card.instanceId);
      unit.classList.toggle("is-targetable", effectTarget);
      unit.classList.toggle("is-effect-target", effectTarget);
      if (effectTarget) hitbox.addEventListener("click", () => resolveAlliedFollowerTarget(card.instanceId).catch(showError));
      else if (attackReady) hitbox.addEventListener("click", () => selectAttacker(card.instanceId));

      const evolve = actions.find(action => action.type === "evolve" && action.followerInstanceId === card.instanceId);
      const superEvolve = actions.find(action => action.type === "super-evolve" && action.followerInstanceId === card.instanceId);
      const engage = actions.find(action => action.type === "engage" && action.amuletInstanceId === card.instanceId);
      if (!effectTarget && (evolve || superEvolve || engage)) {
        const controls = document.createElement("span");
        controls.className = "sb-battle-evolution-controls";
        if (evolve) controls.append(actionButton("Evo", () => evolveFollower(card.instanceId, false)));
        if (superEvolve) controls.append(actionButton("Super Evo", () => evolveFollower(card.instanceId, true)));
        if (engage) controls.append(actionButton(`Engage ${engage.cost}`, () => engageAmulet(card.instanceId), "is-engage"));
        unit.append(controls);
      }
    } else {
      const attackTarget = Boolean(selectedAttacker && actions.some(action => action.type === "attack" && action.attackerInstanceId === selectedAttacker && action.targetInstanceId === card.instanceId));
      const playTarget = Boolean(selectedPlayCard && selectedPlayModeKey && actions.some(action => action.type === "play-card" && action.cardInstanceId === selectedPlayCard && action.playModeKey === selectedPlayModeKey && action.targetInstanceId === card.instanceId));
      const engageTarget = Boolean(selectedEngageAmulet && actions.some(action => action.type === "engage" && action.amuletInstanceId === selectedEngageAmulet && action.targetInstanceId === card.instanceId));
      const evolutionTarget = Boolean(selectedEvolution && actions.some(action => action.type === selectedEvolution.type && action.followerInstanceId === selectedEvolution.followerInstanceId && action.targetInstanceId === card.instanceId));
      const effectTarget = playTarget || engageTarget || evolutionTarget;
      const targetable = attackTarget || effectTarget;
      hitbox.disabled = !targetable;
      unit.classList.toggle("is-targetable", targetable);
      unit.classList.toggle("is-effect-target", effectTarget);
      if (targetable) hitbox.addEventListener("click", () => resolveEnemyFollowerTarget(card.instanceId).catch(showError));
    }
    root.append(unit);
  }
}

function actionButton(label, handler, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `sb-battle-evolution-button ${label.startsWith("Super") ? "is-super" : ""} ${extraClass}`.trim();
  button.textContent = label;
  button.addEventListener("click", event => {
    event.stopPropagation();
    Promise.resolve(handler()).catch(showError);
  });
  return button;
}

function statBadge(kind, value) {
  const badge = document.createElement("span");
  badge.className = `sb-battle-stat sb-battle-stat-${kind}`;
  badge.textContent = String(value ?? 0);
  return badge;
}

function cardBack() {
  const back = document.createElement("span");
  back.className = "sb-battle-card sb-battle-card-back";
  back.setAttribute("aria-label", "Hidden opponent card");
  const sigil = document.createElement("span");
  sigil.textContent = "✦";
  back.append(sigil);
  return back;
}

async function consumeEvents() {
  if (!session) return;
  const next = session.getSnapshot(0).nextEventSequence;
  const events = session.getEvents({ since: eventCursor, viewer: 0 });
  eventCursor = next;
  for (const event of events) appendEvent(event);
  await queue.enqueueMany(events, { stage: ui.stage });
}

function appendEvent(event) {
  const item = document.createElement("div");
  item.className = "sb-log-entry sb-battle-event";
  const title = document.createElement("strong");
  title.textContent = eventTitle(event);
  const detail = document.createElement("div");
  detail.className = "sb-muted";
  detail.textContent = eventDetail(event);
  item.append(title, detail);
  ui.eventLog.prepend(item);
}

function eventTitle(event) {
  const actor = event.actor == null ? "Game" : session?.players[event.actor]?.name ?? "Player";
  const labels = {
    "match-start": "Match created",
    "opening-draw": `${actor} opening hand`,
    "mulligan": `${actor} mulligan`,
    "mulligan-complete": "Mulligan complete",
    "turn-start": `${actor} turn start`,
    "draw": `${actor} draw`,
    "card-burned": `${actor} burns a card`,
    "card-discarded": `${actor} discards a card`,
    "bonus-pp": `${actor} Bonus PP`,
    "card-play": `${actor} plays a card`,
    "fuse": `${actor} Fuses`,
    "card-transform": `${actor} transforms a card`,
    "follower-enter": `${actor} follower enters`,
    "amulet-enter": `${actor} amulet enters`,
    "engage": `${actor} Engages`,
    "countdown-tick": `${actor} Countdown`,
    "amulet-destroyed": `${actor} amulet destroyed`,
    "card-banished": "Card banished",
    "card-returned": "Card returned",
    "spell-cast": `${actor} casts a spell`,
    "ability-trigger": `${actor} ability`,
    "follower-buff": `${actor} follower buff`,
    "attack-start": `${actor} attacks`,
    "attack-impact": "Attack impact",
    "leader-damage": "Leader damage",
    "follower-damage": "Follower damage",
    "follower-destroyed": "Follower destroyed",
    "heal": `${actor} heals`,
    "evolve": `${actor} evolves`,
    "super-evolve": `${actor} Super Evolves`,
    "turn-end": `${actor} turn end`,
    "match-end": "Match end"
  };
  return labels[event.type] ?? event.type;
}

function eventDetail(event) {
  const p = event.payload ?? {};
  if (event.type === "ability-trigger") return `${p.card?.name ?? "Card"} · ${p.resolved ? "resolved" : "unresolved"}${p.mode ? ` · ${p.mode}` : ""}${p.target?.name ? ` → ${p.target.name}` : ""} · ${p.text ?? ""}`;
  if (event.type === "fuse") return `${p.target?.name ?? "Card"} ⇐ ${(p.materials ?? []).map(card => card?.name ?? "material").join(" + ")} · Fuse zone ${p.fusedZoneCount ?? 0}`;
  if (event.type === "card-transform") return `${p.before?.name ?? "Card"} → ${p.after?.name ?? "Card"}`;
  if (event.type === "engage") return `${p.card?.name ?? "Amulet"} · ${p.cost ?? 0} PP${p.target?.name ? ` → ${p.target.name}` : ""}`;
  if (event.type === "countdown-tick") return `${p.card?.name ?? "Amulet"} · Countdown ${p.countdown ?? 0}`;
  if (event.type === "card-returned") return `${p.card?.name ?? "Card"} → ${p.destination ?? "hand"}${p.handFull ? " · hand full" : ""}`;
  if (p.card?.name) return `${p.card.name}${p.cost != null ? ` · ${p.cost} PP` : ""}${p.mode && p.mode !== "base" ? ` · ${p.mode}` : ""}${p.target?.name ? ` → ${p.target.name}` : ""}`;
  if (event.type === "leader-damage") return `${p.amount ?? 0} damage · ${p.hp ?? 0} defense remaining`;
  if (event.type === "follower-damage") return `${p.target?.name ?? "Follower"} takes ${p.amount ?? 0}${p.prevented ? ` · ${p.prevented} prevented` : ""}`;
  if (event.type === "attack-impact") return p.target === "leader" ? `${p.damage ?? 0} damage to leader` : `${p.attackerDamage ?? 0} / ${p.counterDamage ?? 0} combat damage`;
  if (event.type === "turn-start") return `Turn ${p.personalTurn ?? 0} · PP ${p.pp ?? 0}/${p.maxPp ?? 0}`;
  if (event.type === "turn-end") return `${p.ppRemaining ?? 0} PP remaining`;
  if (event.type === "heal") return `${p.amount ?? 0} defense restored · ${p.hp ?? 0} defense`;
  if (event.type === "match-end") return p.reason ?? "resolved";
  return "GameSession event";
}

function createQueue() {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const animations = new BattleAnimationQueue({ reducedMotion });
  animations.register("card-play", (event, options) => animateCard(event.payload?.card?.instanceId, [
    { transform: "translateY(0) scale(1)", filter: "brightness(1)" },
    { transform: "translateY(-52px) scale(1.18)", filter: "brightness(1.35)" },
    { transform: "translateY(-8px) scale(.88)", filter: "brightness(.7)", opacity: .2 }
  ], options.duration));
  animations.register("fuse", (event, options) => Promise.all([
    animateCard(event.payload?.target?.instanceId, [
      { transform: "translateY(0) scale(1)", filter: "brightness(1) saturate(1)" },
      { transform: "translateY(-18px) scale(1.13)", filter: "brightness(1.8) saturate(1.4)" },
      { transform: "translateY(0) scale(1)", filter: "brightness(1.15) saturate(1.1)" }
    ], options.duration),
    ...(event.payload?.materials ?? []).map((material, index) => animateCard(material?.instanceId, [
      { opacity: 1, transform: "translateY(0) scale(1)", filter: "brightness(1)" },
      { opacity: .75, transform: `translateY(${-14 - index * 3}px) scale(.92)`, filter: "brightness(1.6)" },
      { opacity: 0, transform: "translateY(-34px) scale(.5)", filter: "brightness(2) blur(2px)" }
    ], Math.max(180, options.duration - index * 40)))
  ]));
  animations.register("card-transform", (event, options) => animateCard(event.payload?.after?.instanceId ?? event.payload?.before?.instanceId, [
    { transform: "perspective(500px) rotateY(0deg) scale(1)", filter: "brightness(1)", boxShadow: "none" },
    { transform: "perspective(500px) rotateY(90deg) scale(1.12)", filter: "brightness(2.3)", boxShadow: "0 0 42px rgba(166,120,255,.85)" },
    { transform: "perspective(500px) rotateY(180deg) scale(1.08)", filter: "brightness(1.55)", boxShadow: "0 0 34px rgba(93,208,255,.62)" },
    { transform: "perspective(500px) rotateY(360deg) scale(1)", filter: "brightness(1)", boxShadow: "none" }
  ], options.duration));
  animations.register("follower-enter", (_event, options) => pulseStage(options.duration));
  animations.register("amulet-enter", (_event, options) => pulseStage(options.duration || 360));
  animations.register("engage", (event, options) => animateCard(event.payload?.card?.instanceId, [
    { transform: "scale(1)", filter: "brightness(1)" },
    { transform: "scale(1.14)", filter: "brightness(1.75) saturate(1.25)" },
    { transform: "scale(1)", filter: "brightness(1)" }
  ], options.duration));
  animations.register("countdown-tick", (event, options) => animateCard(event.payload?.card?.instanceId, [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], options.duration));
  animations.register("amulet-destroyed", (event, options) => animateCard(event.payload?.card?.instanceId, [{ opacity: 1, transform: "scale(1)" }, { opacity: .7, transform: "scale(1.12)" }, { opacity: 0, transform: "scale(.45)" }], options.duration));
  animations.register("card-banished", (event, options) => animateCard(event.payload?.card?.instanceId, [{ opacity: 1, filter: "brightness(1) blur(0)" }, { opacity: .6, filter: "brightness(1.8) blur(1px)" }, { opacity: 0, filter: "brightness(.4) blur(6px)" }], options.duration));
  animations.register("card-returned", (event, options) => animateCard(event.payload?.card?.instanceId, [{ opacity: 1, transform: "translateY(0) scale(1)" }, { opacity: .7, transform: `translateY(${event.payload?.owner === 0 ? 42 : -42}px) scale(.8)` }, { opacity: 0, transform: `translateY(${event.payload?.owner === 0 ? 72 : -72}px) scale(.55)` }], options.duration));
  animations.register("ability-trigger", (event, options) => event.payload?.target?.instanceId
    ? animateCard(event.payload.target.instanceId, [{ filter: "brightness(1)" }, { filter: "brightness(1.65)" }, { filter: "brightness(1)" }], options.duration)
    : pulseStage(Math.min(options.duration, 420)));
  animations.register("spell-cast", (_event, options) => flashStage(options.duration, "brightness(1.35) saturate(1.25)"));
  animations.register("attack-start", (event, options) => animateCard(event.payload?.attacker?.instanceId, [
    { transform: "translateY(0) scale(1)" },
    { transform: `translateY(${event.actor === 0 ? -38 : 38}px) scale(1.1)` },
    { transform: "translateY(0) scale(1)" }
  ], options.duration));
  animations.register("attack-impact", (_event, options) => shakeStage(options.duration));
  animations.register("leader-damage", (event, options) => {
    const node = event.payload?.targetPlayer === 0 ? ui.playerHp : ui.opponentHp;
    return animateNode(node, [{ transform: "scale(1)", filter: "brightness(1)" }, { transform: "scale(1.45)", filter: "brightness(1.7)" }, { transform: "scale(1)", filter: "brightness(1)" }], options.duration);
  });
  animations.register("follower-damage", (event, options) => animateCard(event.payload?.target?.instanceId, [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(9px)" }, { transform: "translateX(0)" }], options.duration));
  animations.register("follower-destroyed", (event, options) => animateCard(event.payload?.card?.instanceId, [{ opacity: 1, transform: "scale(1)", filter: "brightness(1)" }, { opacity: .8, transform: "scale(1.16)", filter: "brightness(2)" }, { opacity: 0, transform: "scale(.3)", filter: "brightness(.2)" }], options.duration));
  animations.register("evolve", (event, options) => evolveAnimation(event.payload?.card?.instanceId, options.duration, false));
  animations.register("super-evolve", (event, options) => evolveAnimation(event.payload?.card?.instanceId, options.duration, true));
  animations.register("match-end", (_event, options) => flashStage(options.duration, "brightness(1.45)"));
  animations.register("bonus-pp", (_event, options) => pulseStage(options.duration));
  animations.register("turn-start", (_event, options) => animateNode(ui.turnLabel, [{ opacity: .2, transform: "scale(.9)" }, { opacity: 1, transform: "scale(1.1)" }, { opacity: 1, transform: "scale(1)" }], options.duration));
  return animations;
}

function animateCard(instanceId, keyframes, duration) {
  const node = instanceId ? ui.stage.querySelector(`[data-instance-id="${cssEscape(instanceId)}"]`) : null;
  return animateNode(node, keyframes, duration);
}

function evolveAnimation(instanceId, duration, superEvolution) {
  const node = instanceId ? ui.stage.querySelector(`[data-instance-id="${cssEscape(instanceId)}"]`) : null;
  const glow = superEvolution ? "0 0 45px rgba(255,214,112,.95), 0 0 90px rgba(123,185,255,.72)" : "0 0 42px rgba(136,196,255,.9)";
  return animateNode(node, [
    { transform: "scale(1) rotate(0deg)", filter: "brightness(1)", boxShadow: "none" },
    { transform: "scale(1.22) rotate(-2deg)", filter: "brightness(2.1)", boxShadow: glow },
    { transform: "scale(1.08) rotate(1deg)", filter: "brightness(1.35)", boxShadow: glow },
    { transform: "scale(1) rotate(0deg)", filter: "brightness(1)", boxShadow: "none" }
  ], duration);
}

function pulseStage(duration) {
  return animateNode(ui.stage, [{ filter: "brightness(1)" }, { filter: "brightness(1.18)" }, { filter: "brightness(1)" }], duration);
}
function flashStage(duration, middle) {
  return animateNode(ui.stage, [{ filter: "brightness(1)" }, { filter: middle }, { filter: "brightness(1)" }], duration);
}
function shakeStage(duration) {
  return animateNode(ui.stage, [{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], duration);
}
function animateNode(node, frames, duration) {
  if (!node?.animate || duration <= 0) return Promise.resolve();
  return node.animate(frames, { duration, easing: "cubic-bezier(.2,.75,.2,1)" }).finished.catch(() => {});
}

function expandDeck(reference) {
  const result = [];
  for (const row of reference.cards) {
    const card = cards.get(String(row.cardId));
    if (!card) throw new Error(`Missing Beyond Codex card ${row.cardId}`);
    for (let copy = 0; copy < Number(row.qty ?? 1); copy += 1) result.push(card);
  }
  return result;
}

function fillSelect(select, source, selectedIndex) {
  select.replaceChildren();
  source.forEach((deck, index) => {
    const option = document.createElement("option");
    option.value = deck.id;
    option.textContent = `${deck.name} · ${deck.class}`;
    option.selected = index === selectedIndex;
    select.append(option);
  });
}

function clearEngageAndAttack() {
  selectedAttacker = null;
  selectedEngageAmulet = null;
  selectedEvolution = null;
}

function clearFuseSelectionState() {
  selectedFuseTarget = null;
  selectedFuseMaterials = new Set();
}

function clearSelections() {
  selectedAttacker = null;
  selectedPlayCard = null;
  selectedPlayModeKey = null;
  selectedEngageAmulet = null;
  selectedEvolution = null;
  clearFuseSelectionState();
}

function isSubset(subset, superset) {
  for (const value of subset) if (!superset.has(value)) return false;
  return true;
}

function sameIdSet(left, right) {
  return left.size === right.size && isSubset(left, right);
}

function setStatus(text, status) {
  ui.status.textContent = text;
  ui.status.dataset.status = status;
}

function showError(error) {
  console.error(error);
  clearSelections();
  ui.help.textContent = error instanceof Error ? error.message : String(error);
  setStatus("Action rejected", "planned");
  render();
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function pause(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}
