import { loadReferenceDecks } from "../ai/reference-decks.js";
import { GAME_IDS } from "../core/game-catalog.js";
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
let cpuBusy = false;
let dataReady = false;
let queue = createQueue();

claimLegacyControls();
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

function claimLegacyControls() {
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
    ui.help.textContent = "This action lab is currently bound to Worlds Beyond V5. SV1 and Champion's Battle will reuse the same GameSession action API.";
  } else if (!session && dataReady) {
    setStatus("SVWB action resolver ready", "ready");
    ui.help.textContent = "Start a match. Cards, attacks, Ward, Storm, Evo and Super Evo are now resolved action by action.";
  }
}

async function startMatch() {
  if (!dataReady || ui.game.value !== GAME_IDS.WORLDS_BEYOND || cpuBusy) return;
  const humanDeck = decks.find(deck => deck.id === ui.playerDeck.value);
  const cpuDeck = decks.find(deck => deck.id === ui.cpuDeck.value);
  if (!humanDeck || !cpuDeck) return;

  eventCursor = 0;
  mulliganSelection = new Set();
  selectedAttacker = null;
  ui.eventLog.replaceChildren();
  queue = createQueue();
  session = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: ui.seed.value || "shadowbattle-action-lab",
    firstPlayer: "random",
    players: [
      { name: humanDeck.name, className: humanDeck.class, deck: expandDeck(humanDeck) },
      { name: cpuDeck.name, className: cpuDeck.class, deck: expandDeck(cpuDeck) }
    ]
  });
  session.start();
  const threshold = Number(cpuDeck.strategy?.mulliganMaxCost ?? 3);
  const cpuReplace = session.players[1].hand.filter(item => Number(item.card?.cost ?? 0) > threshold).map(item => item.instanceId);
  session.submitMulligan(1, cpuReplace);
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
  selectedAttacker = null;
  session.endTurn(0);
  await consumeEvents();
  render();
  await runCpuTurnIfNeeded();
}

async function playHumanCard(instanceId) {
  if (!isHumanTurn()) return;
  await resolveAction({ type: "play-card", player: 0, cardInstanceId: instanceId });
}

async function selectAttacker(instanceId) {
  if (!isHumanTurn()) return;
  const attacks = legalActions(0).filter(action => action.type === "attack" && action.attackerInstanceId === instanceId);
  if (!attacks.length) return;
  selectedAttacker = selectedAttacker === instanceId ? null : instanceId;
  render();
}

async function attackFollower(instanceId) {
  if (!isHumanTurn() || !selectedAttacker) return;
  const action = legalActions(0).find(item => item.type === "attack" && item.attackerInstanceId === selectedAttacker && item.targetInstanceId === instanceId);
  if (!action) return;
  selectedAttacker = null;
  await resolveAction(action);
}

async function attackOpponentLeader() {
  if (!isHumanTurn() || !selectedAttacker) return;
  const action = legalActions(0).find(item => item.type === "attack" && item.attackerInstanceId === selectedAttacker && item.target === "leader");
  if (!action) return;
  selectedAttacker = null;
  await resolveAction(action);
}

async function evolveFollower(instanceId, superEvolution) {
  if (!isHumanTurn()) return;
  const type = superEvolution ? "super-evolve" : "evolve";
  const action = legalActions(0).find(item => item.type === type && item.followerInstanceId === instanceId);
  if (!action) return;
  selectedAttacker = null;
  await resolveAction(action);
}

async function resolveAction(action) {
  session.dispatch(action);
  await consumeEvents();
  render();
}

async function runCpuTurnIfNeeded() {
  if (!session || session.phase !== GAME_PHASE.MAIN || session.activePlayer !== 1 || cpuBusy) return;
  cpuBusy = true;
  render();
  try {
    for (let step = 0; step < 24 && session.phase === GAME_PHASE.MAIN && session.activePlayer === 1; step += 1) {
      let actions = legalActions(1);
      let action = chooseCpuAction(actions);
      if (!action && shouldCpuUseBonusPp()) {
        session.useBonusPp(1);
        await consumeEvents();
        render();
        await pause(120);
        continue;
      }
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

function chooseCpuAction(actions) {
  const play = actions.filter(action => action.type === "play-card").sort((a, b) => b.cost - a.cost)[0];
  if (play) return play;
  const superEvolution = actions.filter(action => action.type === "super-evolve");
  if (superEvolution.length) return bestEvolution(superEvolution, 1);
  const evolution = actions.filter(action => action.type === "evolve");
  if (evolution.length) return bestEvolution(evolution, 1);
  const attacks = actions.filter(action => action.type === "attack");
  const lethal = attacks.find(action => action.target === "leader" && attackValue(1, action.attackerInstanceId) >= session.players[0].hp);
  if (lethal) return lethal;
  const wardOrTrade = attacks.filter(action => action.targetInstanceId).sort((a, b) => targetValue(0, b.targetInstanceId) - targetValue(0, a.targetInstanceId))[0];
  if (wardOrTrade) return wardOrTrade;
  return attacks.find(action => action.target === "leader") ?? null;
}

function bestEvolution(actions, playerIndex) {
  return [...actions].sort((a, b) => attackValue(playerIndex, b.followerInstanceId) - attackValue(playerIndex, a.followerInstanceId))[0] ?? null;
}

function shouldCpuUseBonusPp() {
  const player = session.players[1];
  if (!player.resources.bonusPpAvailable) return false;
  const currentPp = Number(player.resources.pp ?? 0);
  return player.hand.some(item => Number(item.card?.cost ?? 0) === currentPp + 1);
}

function attackValue(playerIndex, instanceId) {
  return Number(session.findBoardCard(playerIndex, instanceId)?.attack ?? 0);
}

function targetValue(playerIndex, instanceId) {
  const target = session.findBoardCard(playerIndex, instanceId);
  return Number(target?.attack ?? 0) * 2 + Number(target?.defense ?? 0);
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
  const canHitLeader = selectedAttacker && humanActions.some(action => action.type === "attack" && action.attackerInstanceId === selectedAttacker && action.target === "leader");
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
      ui.help.textContent = "CPU is executing legal GameSession actions. This temporary driver will later be replaced by the full V5 planner.";
      setStatus("CPU resolving actions", "ready");
    } else if (selectedAttacker) {
      ui.help.textContent = "Choose a highlighted enemy follower or the enemy leader as the attack target.";
      setStatus("Choose attack target", "ready");
    } else {
      ui.help.textContent = "Playable cards glow. Select a ready follower to attack; Evo and Super Evo controls appear when legal. Card text effects are the next V5 migration layer.";
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
  resourceNode.textContent = `PP ${resources.pp ?? 0}/${resources.maxPp ?? 0} · Evo ${resources.evolutionPoints ?? 0} · Super Evo ${resources.superEvolutionPoints ?? 0}${resources.bonusPpAvailable ? " · Bonus PP" : ""}`;
}

function renderHand(root, player, human) {
  root.replaceChildren();
  const playable = new Set(isHumanTurn() ? legalActions(0).filter(action => action.type === "play-card").map(action => action.cardInstanceId) : []);
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
    } else if (human && playable.has(card.instanceId)) {
      button.classList.add("is-playable");
      button.addEventListener("click", () => playHumanCard(card.instanceId).catch(showError));
    } else {
      button.disabled = true;
    }
    root.append(button);
  }
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
      hitbox.disabled = !attackReady;
      unit.classList.toggle("is-attacker-ready", attackReady);
      unit.classList.toggle("is-attacker-selected", selectedAttacker === card.instanceId);
      if (attackReady) hitbox.addEventListener("click", () => selectAttacker(card.instanceId));
      const evolve = actions.find(action => action.type === "evolve" && action.followerInstanceId === card.instanceId);
      const superEvolve = actions.find(action => action.type === "super-evolve" && action.followerInstanceId === card.instanceId);
      if (evolve || superEvolve) {
        const controls = document.createElement("span");
        controls.className = "sb-battle-evolution-controls";
        if (evolve) controls.append(actionButton("Evo", () => evolveFollower(card.instanceId, false)));
        if (superEvolve) controls.append(actionButton("Super Evo", () => evolveFollower(card.instanceId, true)));
        unit.append(controls);
      }
    } else {
      const targetable = Boolean(selectedAttacker && actions.some(action => action.type === "attack" && action.attackerInstanceId === selectedAttacker && action.targetInstanceId === card.instanceId));
      hitbox.disabled = !targetable;
      unit.classList.toggle("is-targetable", targetable);
      if (targetable) hitbox.addEventListener("click", () => attackFollower(card.instanceId).catch(showError));
    }
    root.append(unit);
  }
}

function actionButton(label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `sb-battle-evolution-button ${label.startsWith("Super") ? "is-super" : ""}`;
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
    "bonus-pp": `${actor} Bonus PP`,
    "card-play": `${actor} plays a card`,
    "follower-enter": `${actor} follower enters`,
    "amulet-enter": `${actor} amulet enters`,
    "spell-cast": `${actor} casts a spell`,
    "attack-start": `${actor} attacks`,
    "attack-impact": "Attack impact",
    "leader-damage": "Leader damage",
    "follower-damage": "Follower damage",
    "follower-destroyed": "Follower destroyed",
    "evolve": `${actor} evolves`,
    "super-evolve": `${actor} Super Evolves`,
    "turn-end": `${actor} turn end`,
    "match-end": "Match end"
  };
  return labels[event.type] ?? event.type;
}

function eventDetail(event) {
  const p = event.payload ?? {};
  if (p.card?.name) return `${p.card.name}${p.cost != null ? ` · ${p.cost} PP` : ""}`;
  if (event.type === "leader-damage") return `${p.amount ?? 0} damage · ${p.hp ?? 0} defense remaining`;
  if (event.type === "follower-damage") return `${p.target?.name ?? "Follower"} takes ${p.amount ?? 0}${p.prevented ? ` · ${p.prevented} prevented` : ""}`;
  if (event.type === "attack-impact") return p.target === "leader" ? `${p.damage ?? 0} damage to leader` : `${p.attackerDamage ?? 0} / ${p.counterDamage ?? 0} combat damage`;
  if (event.type === "turn-start") return `Turn ${p.personalTurn ?? 0} · PP ${p.pp ?? 0}/${p.maxPp ?? 0}`;
  if (event.type === "turn-end") return `${p.ppRemaining ?? 0} PP remaining`;
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
  animations.register("follower-enter", (_event, options) => pulseStage(options.duration));
  animations.register("amulet-enter", (_event, options) => pulseStage(options.duration || 360));
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

function setStatus(text, status) {
  ui.status.textContent = text;
  ui.status.dataset.status = status;
}

function showError(error) {
  console.error(error);
  ui.help.textContent = error instanceof Error ? error.message : String(error);
  setStatus("Action rejected", "planned");
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function pause(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}
