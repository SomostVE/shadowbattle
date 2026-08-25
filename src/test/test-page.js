import { chooseIntermediateAction, getAiSkillProfile } from "../ai/skill-profile.js";
import { loadReferenceDecks } from "../ai/reference-decks.js";
import { getGameVisuals } from "../assets/game-visuals.js";
import { GAME_IDS } from "../core/game-catalog.js";
import { GAME_PHASE, GameSession } from "../core/game-session.js";
import { worldsBeyondProvider } from "../data/providers/worlds-beyond.js";
import { BattleAnimationQueue } from "../ui/battle-animation-queue.js";

const gameSelect = document.querySelector("#test-game");
const seedInput = document.querySelector("#test-seed");
const runButton = document.querySelector("#run-decision");
const resetButton = document.querySelector("#reset-test");
const logRoot = document.querySelector("#decision-log");
const profileOutput = document.querySelector("#profile-json");
const visualOutput = document.querySelector("#visual-json");
const chosenOutput = document.querySelector("#chosen-action");

const battleUi = {
  lab: document.querySelector("#game-session-lab"),
  status: document.querySelector("#battle-lab-status"),
  playerDeck: document.querySelector("#battle-player-deck"),
  cpuDeck: document.querySelector("#battle-cpu-deck"),
  start: document.querySelector("#battle-start"),
  mulligan: document.querySelector("#battle-mulligan"),
  bonusPp: document.querySelector("#battle-bonus-pp"),
  endTurn: document.querySelector("#battle-end-turn"),
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
  opponentBoard: document.querySelector("#battle-opponent-board")
};

const profile = getAiSkillProfile("intermediate");
profileOutput.textContent = JSON.stringify(profile, null, 2);

const baseCandidates = Object.freeze([
  { id: "clean-trade", label: "Trade into the highest immediate threat", score: 8.4, legal: true, plan: "stabilize" },
  { id: "tempo-play", label: "Develop a follower and keep the evolution point", score: 8.15, legal: true, plan: "tempo" },
  { id: "hold-resources", label: "Take the safe trade and preserve the key card", score: 7.92, legal: true, plan: "resource" },
  { id: "greedy-face", label: "Push face damage and ignore the board", score: 7.25, legal: true, plan: "pressure" },
  { id: "illegal-test", label: "Play a card without enough PP", score: 99, legal: false, plan: "invalid" }
]);

let referenceDecks = [];
let worldsBeyondCards = new Map();
let battleSession = null;
let battleEventCursor = 0;
let selectedMulligan = new Set();
let animationQueue = createAnimationQueue();
let battleDataReady = false;

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function renderVisualProfile() {
  const visuals = getGameVisuals(gameSelect.value);
  document.body.dataset.game = gameSelect.value;
  visualOutput.textContent = JSON.stringify({
    gameId: visuals.gameId,
    theme: visuals.theme,
    assetPolicy: visuals.assetPolicy,
    cardArtProvider: visuals.cardArtProvider ?? visuals.cardDataProvider ?? null
  }, null, 2);
  syncBattleLabAvailability();
}

function addLog(title, detail, score = null) {
  const item = document.createElement("div");
  item.className = "sb-log-entry";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const body = document.createElement("div");
  body.className = "sb-muted";
  body.textContent = detail;
  item.append(heading, body);
  if (score != null) {
    const scoreLine = document.createElement("div");
    scoreLine.className = "sb-score";
    scoreLine.textContent = `score ${Number(score).toFixed(2)}`;
    item.append(scoreLine);
  }
  logRoot.prepend(item);
}

function runDecision() {
  const seed = `${gameSelect.value}:${seedInput.value}:${logRoot.childElementCount}`;
  const rng = createRng(seed);
  const chosen = chooseIntermediateAction(baseCandidates, { rng, profile });
  if (!chosen) {
    chosenOutput.textContent = "No legal action";
    addLog("No action", "The test position contains no legal candidate.");
    return;
  }

  const best = [...baseCandidates].filter(candidate => candidate.legal).sort((a, b) => b.score - a.score)[0];
  const delta = best.score - chosen.score;
  chosenOutput.textContent = chosen.label;
  addLog(
    chosen.id === best.id ? "Best line selected" : "Near-best line selected",
    `${chosen.label}. Intermediate AI accepted a ${delta.toFixed(2)} score gap inside its ${profile.nearBestWindow.toFixed(2)} near-best window.`,
    chosen.score
  );
}

function resetTest() {
  logRoot.replaceChildren();
  chosenOutput.textContent = "No decision yet";
  seedInput.value = "shadowbattle-demo";
}

async function initializeBattleLab() {
  try {
    setBattleStatus("Loading Beyond Codex…", "planned");
    const [cards, decks] = await Promise.all([
      worldsBeyondProvider.loadCards(),
      loadReferenceDecks(GAME_IDS.WORLDS_BEYOND, { baseUrl: new URL("../", document.baseURI).href })
    ]);
    worldsBeyondCards = new Map(cards.map(card => [String(card.sourceCardId ?? card.id), card]));
    referenceDecks = decks.filter(deck => expandedDeckSize(deck) === 40 && deck.cards.every(row => worldsBeyondCards.has(String(row.cardId))));
    if (referenceDecks.length < 2) throw new Error("At least two complete Worlds Beyond reference decks are required");

    populateDeckSelect(battleUi.playerDeck, referenceDecks, 0);
    populateDeckSelect(battleUi.cpuDeck, referenceDecks, Math.min(1, referenceDecks.length - 1));
    battleDataReady = true;
    syncBattleLabAvailability();
  } catch (error) {
    console.error(error);
    battleDataReady = false;
    setBattleStatus("Battle data unavailable", "planned");
    battleUi.help.textContent = error instanceof Error ? error.message : String(error);
  }
}

function populateDeckSelect(select, decks, selectedIndex) {
  select.replaceChildren();
  decks.forEach((deck, index) => {
    const option = document.createElement("option");
    option.value = deck.id;
    option.textContent = `${deck.name} · ${deck.class}`;
    option.selected = index === selectedIndex;
    select.append(option);
  });
}

function syncBattleLabAvailability() {
  const supported = gameSelect.value === GAME_IDS.WORLDS_BEYOND;
  battleUi.lab.dataset.available = supported ? "true" : "false";
  battleUi.playerDeck.disabled = !supported || !battleDataReady;
  battleUi.cpuDeck.disabled = !supported || !battleDataReady;
  battleUi.start.disabled = !supported || !battleDataReady;
  if (!supported) {
    setBattleStatus("Ruleset migration pending", "planned");
    battleUi.help.textContent = "SV1 and Champion's Battle will use the same GameSession after the Worlds Beyond V5 adapter is complete.";
  } else if (battleDataReady && !battleSession) {
    setBattleStatus("SVWB data ready", "ready");
    battleUi.help.textContent = "Start a session to test opening hands, hidden information, mulligan, PP and turn transitions with real Beyond Codex card art.";
  }
}

async function startBattleSession() {
  const playerDeck = referenceDecks.find(deck => deck.id === battleUi.playerDeck.value);
  const cpuDeck = referenceDecks.find(deck => deck.id === battleUi.cpuDeck.value);
  if (!playerDeck || !cpuDeck) return;

  selectedMulligan = new Set();
  battleEventCursor = 0;
  battleUi.eventLog.replaceChildren();
  animationQueue = createAnimationQueue();
  battleSession = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: seedInput.value || "shadowbattle-demo",
    firstPlayer: "random",
    players: [
      { name: playerDeck.name, className: playerDeck.class, deck: expandReferenceDeck(playerDeck) },
      { name: cpuDeck.name, className: cpuDeck.class, deck: expandReferenceDeck(cpuDeck) }
    ]
  });

  battleSession.start();
  const cpuThreshold = Number(cpuDeck.strategy?.mulliganMaxCost ?? 3);
  const cpuReplacements = battleSession.players[1].hand
    .filter(instance => Number(instance.card?.cost ?? 0) > cpuThreshold)
    .map(instance => instance.instanceId);
  battleSession.submitMulligan(1, cpuReplacements);

  renderBattleSession();
  await consumeBattleEvents();
}

function expandReferenceDeck(reference) {
  const cards = [];
  for (const row of reference.cards) {
    const card = worldsBeyondCards.get(String(row.cardId));
    if (!card) throw new Error(`Missing Beyond Codex card ${row.cardId} for ${reference.name}`);
    for (let copy = 0; copy < Number(row.qty ?? 1); copy += 1) cards.push(card);
  }
  if (cards.length !== 40) throw new Error(`${reference.name} expands to ${cards.length} cards instead of 40`);
  return cards;
}

function expandedDeckSize(reference) {
  return reference.cards.reduce((total, row) => total + Number(row.qty ?? 1), 0);
}

async function confirmMulligan() {
  if (!battleSession || battleSession.phase !== GAME_PHASE.MULLIGAN) return;
  battleSession.submitMulligan(0, [...selectedMulligan]);
  selectedMulligan.clear();
  renderBattleSession();
  await consumeBattleEvents();
  await passCpuTurnIfNeeded();
}

async function endHumanTurn() {
  if (!battleSession || battleSession.phase !== GAME_PHASE.MAIN || battleSession.activePlayer !== 0) return;
  battleSession.endTurn(0);
  renderBattleSession();
  await consumeBattleEvents();
  await passCpuTurnIfNeeded();
}

async function useHumanBonusPp() {
  if (!battleSession || battleSession.phase !== GAME_PHASE.MAIN || battleSession.activePlayer !== 0) return;
  battleSession.useBonusPp(0);
  renderBattleSession();
  await consumeBattleEvents();
}

async function passCpuTurnIfNeeded() {
  if (!battleSession || battleSession.phase !== GAME_PHASE.MAIN || battleSession.activePlayer !== 1) return;
  battleUi.help.textContent = "CPU action resolver is the next V5 migration step. For now the lab auto-passes the CPU turn after visualizing its turn start and draw.";
  await delay(380);
  battleSession.endTurn(1);
  renderBattleSession();
  await consumeBattleEvents();
}

function renderBattleSession() {
  if (!battleSession) return;
  const snapshot = battleSession.getSnapshot(0);
  const human = snapshot.players[0];
  const opponent = snapshot.players[1];
  battleUi.stage.dataset.phase = snapshot.phase;
  battleUi.stage.dataset.activePlayer = String(snapshot.activePlayer ?? "");
  battleUi.overlay.hidden = true;

  renderLeader(human, battleUi.playerName, battleUi.playerResource, battleUi.playerHp);
  renderLeader(opponent, battleUi.opponentName, battleUi.opponentResource, battleUi.opponentHp);
  renderHand(battleUi.playerHand, human, true);
  renderHand(battleUi.opponentHand, opponent, false);
  renderField(battleUi.playerBoard, human.board);
  renderField(battleUi.opponentBoard, opponent.board);

  if (snapshot.phase === GAME_PHASE.MULLIGAN) {
    battleUi.phaseLabel.textContent = "Mulligan";
    battleUi.turnLabel.textContent = "MULLIGAN";
    battleUi.help.textContent = "Click any cards in your opening hand to mark them for replacement, then confirm. The CPU has already submitted its own hidden mulligan.";
    setBattleStatus("Mulligan in progress", "ready");
  } else if (snapshot.phase === GAME_PHASE.MAIN) {
    const active = snapshot.players[snapshot.activePlayer];
    battleUi.phaseLabel.textContent = active ? `${active.name}'s turn` : "Main phase";
    battleUi.turnLabel.textContent = active ? `${active.index === 0 ? "YOUR" : "CPU"} TURN · ${active.personalTurn}` : "MAIN";
    setBattleStatus(snapshot.activePlayer === 0 ? "Human turn" : "CPU turn", "ready");
    if (snapshot.activePlayer === 0) {
      battleUi.help.textContent = "The foundation currently supports draw, PP, Bonus PP and end-turn. Card play, targeting, attacks and evolution are being connected to the V5 resolver next.";
    }
  }

  battleUi.mulligan.disabled = snapshot.phase !== GAME_PHASE.MULLIGAN || human.mulliganDone;
  battleUi.endTurn.disabled = snapshot.phase !== GAME_PHASE.MAIN || snapshot.activePlayer !== 0;
  battleUi.bonusPp.disabled = snapshot.phase !== GAME_PHASE.MAIN || snapshot.activePlayer !== 0 || !human.resources.bonusPpAvailable;
}

function renderLeader(player, nameNode, resourceNode, hpNode) {
  nameNode.textContent = player.name;
  hpNode.textContent = String(player.hp);
  const resources = player.resources ?? {};
  resourceNode.textContent = `PP ${resources.pp ?? 0}/${resources.maxPp ?? 0} · Evo ${resources.evolutionPoints ?? 0} · Super Evo ${resources.superEvolutionPoints ?? 0}${resources.bonusPpAvailable ? " · Bonus PP ready" : ""}`;
}

function renderHand(root, player, isHuman) {
  root.replaceChildren();
  player.hand.forEach(card => {
    if (!card) {
      root.append(createCardBack());
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sb-battle-card";
    button.dataset.instanceId = card.instanceId;
    button.title = `${card.name ?? "Card"} · ${card.cost} PP`;

    const image = document.createElement("img");
    image.src = card.image ?? "";
    image.alt = card.name ?? "Card";
    image.loading = "eager";
    image.decoding = "async";
    button.append(image);

    const cost = document.createElement("span");
    cost.className = "sb-battle-card-cost";
    cost.textContent = String(card.cost ?? 0);
    button.append(cost);

    if (isHuman && battleSession?.phase === GAME_PHASE.MULLIGAN && !player.mulliganDone) {
      button.classList.add("is-mulligan-selectable");
      button.classList.toggle("is-selected", selectedMulligan.has(card.instanceId));
      const marker = document.createElement("span");
      marker.className = "sb-battle-card-marker";
      marker.textContent = "Replace";
      button.append(marker);
      button.addEventListener("click", () => {
        if (selectedMulligan.has(card.instanceId)) selectedMulligan.delete(card.instanceId);
        else selectedMulligan.add(card.instanceId);
        renderBattleSession();
      });
    } else {
      button.disabled = true;
    }
    root.append(button);
  });
}

function createCardBack() {
  const back = document.createElement("span");
  back.className = "sb-battle-card sb-battle-card-back";
  back.setAttribute("aria-label", "Hidden opponent card");
  const sigil = document.createElement("span");
  sigil.textContent = "✦";
  back.append(sigil);
  return back;
}

function renderField(root, cards) {
  root.replaceChildren();
  for (let index = 0; index < 5; index += 1) {
    const card = cards[index];
    if (card) {
      const item = document.createElement("span");
      item.className = "sb-battle-unit";
      item.textContent = card.name ?? "Unit";
      root.append(item);
    } else {
      const slot = document.createElement("span");
      slot.className = "sb-battle-field-slot";
      root.append(slot);
    }
  }
}

async function consumeBattleEvents() {
  if (!battleSession) return;
  const nextSequence = battleSession.getSnapshot(0).nextEventSequence;
  const events = battleSession.getEvents({ since: battleEventCursor, viewer: 0 });
  battleEventCursor = nextSequence;
  for (const event of events) appendBattleEventLog(event);
  await animationQueue.enqueueMany(events, { stage: battleUi.stage });
}

function appendBattleEventLog(event) {
  const item = document.createElement("div");
  item.className = "sb-log-entry sb-battle-event";
  const label = document.createElement("strong");
  label.textContent = eventLabel(event);
  const detail = document.createElement("div");
  detail.className = "sb-muted";
  detail.textContent = eventDetail(event);
  item.append(label, detail);
  battleUi.eventLog.prepend(item);
}

function eventLabel(event) {
  const actor = event.actor == null ? null : battleSession?.players[event.actor]?.name;
  const labels = {
    "match-start": "Match created",
    "opening-draw": "Opening hand",
    "mulligan": `${actor ?? "Player"} mulligan`,
    "mulligan-complete": "Mulligan complete",
    "turn-start": `${actor ?? "Player"} turn start`,
    "draw": `${actor ?? "Player"} draw`,
    "card-burned": `${actor ?? "Player"} card burned`,
    "bonus-pp": `${actor ?? "Player"} Bonus PP`,
    "turn-end": `${actor ?? "Player"} turn end`
  };
  return labels[event.type] ?? event.type;
}

function eventDetail(event) {
  const payload = event.payload ?? {};
  if (event.type === "match-start") return `Player ${payload.firstPlayer + 1} goes first · ${payload.ruleset}`;
  if (event.type === "opening-draw") return `${payload.count ?? 0} cards drawn`;
  if (event.type === "mulligan") return `${payload.replaced ?? 0} card${payload.replaced === 1 ? "" : "s"} replaced`;
  if (event.type === "turn-start") return `Turn ${payload.personalTurn} · PP ${payload.pp}/${payload.maxPp}`;
  if (event.type === "draw") return `${payload.count ?? 1} card drawn · ${payload.reason ?? "draw"}`;
  if (event.type === "bonus-pp") return `PP ${payload.pp}/${payload.maxPp} · use ${payload.uses}`;
  if (event.type === "turn-end") return `${payload.ppRemaining ?? 0} PP remaining`;
  return "GameSession event";
}

function createAnimationQueue() {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const queue = new BattleAnimationQueue({ reducedMotion });
  queue.register("match-start", (_event, options) => animateNode(battleUi.stage, [
    { transform: "scale(.985)", filter: "brightness(.8)" },
    { transform: "scale(1)", filter: "brightness(1.08)" },
    { transform: "scale(1)", filter: "brightness(1)" }
  ], options.duration));
  queue.register("opening-draw", event => animateHand(event.actor));
  queue.register("mulligan", event => animateHand(event.actor));
  queue.register("mulligan-complete", (_event, options) => animateNode(battleUi.stage, [
    { boxShadow: "inset 0 0 90px rgba(0,0,0,.46)" },
    { boxShadow: "inset 0 0 90px rgba(0,0,0,.3), 0 0 42px rgba(139,183,233,.28)" },
    { boxShadow: "inset 0 0 90px rgba(0,0,0,.46)" }
  ], options.duration));
  queue.register("turn-start", (event, options) => {
    const root = battleUi.stage.querySelector(`[data-player="${event.actor}"] .sb-player-line`);
    return animateNode(root, [
      { transform: "scale(1)", filter: "brightness(1)" },
      { transform: "scale(1.025)", filter: "brightness(1.35)" },
      { transform: "scale(1)", filter: "brightness(1)" }
    ], options.duration);
  });
  queue.register("draw", event => animateHand(event.actor, true));
  queue.register("bonus-pp", (event, options) => {
    const root = event.actor === 0 ? battleUi.playerResource : battleUi.opponentResource;
    return animateNode(root, [
      { transform: "scale(1)", textShadow: "none" },
      { transform: "scale(1.08)", textShadow: "0 0 18px currentColor" },
      { transform: "scale(1)", textShadow: "none" }
    ], options.duration);
  });
  queue.register("turn-end", (_event, options) => animateNode(battleUi.turnLabel, [
    { opacity: 1 }, { opacity: .25 }, { opacity: 1 }
  ], options.duration));
  return queue;
}

function animateHand(actor, emphasizeLast = false) {
  const root = actor === 0 ? battleUi.playerHand : battleUi.opponentHand;
  const cards = [...root.children];
  const targets = emphasizeLast ? cards.slice(-1) : cards;
  return Promise.all(targets.map((node, index) => animateNode(node, [
    { opacity: .25, transform: `translateY(${actor === 0 ? 28 : -28}px) scale(.92)` },
    { opacity: 1, transform: "translateY(0) scale(1.04)" },
    { opacity: 1, transform: "translateY(0) scale(1)" }
  ], 220 + index * 36)));
}

function animateNode(node, keyframes, duration) {
  if (!node || !node.animate || duration <= 0) return Promise.resolve();
  const animation = node.animate(keyframes, { duration, easing: "cubic-bezier(.2,.75,.2,1)" });
  return animation.finished.catch(() => {});
}

function setBattleStatus(text, status) {
  battleUi.status.textContent = text;
  battleUi.status.dataset.status = status;
}

function delay(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

gameSelect.addEventListener("change", renderVisualProfile);
runButton.addEventListener("click", runDecision);
resetButton.addEventListener("click", resetTest);
battleUi.start.addEventListener("click", startBattleSession);
battleUi.mulligan.addEventListener("click", confirmMulligan);
battleUi.endTurn.addEventListener("click", endHumanTurn);
battleUi.bonusPp.addEventListener("click", useHumanBonusPp);

renderVisualProfile();
resetTest();
initializeBattleLab();
