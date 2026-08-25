import { BATTLE_EVENT } from "../core/battle-events.js";
import { GameSession } from "../core/game-session.js";

const ROOTS = Object.freeze([
  document.querySelector("#battle-player-crests"),
  document.querySelector("#battle-opponent-crests")
]);
const CREST_EVENTS = new Set([
  BATTLE_EVENT.CREST_GAINED,
  BATTLE_EVENT.CREST_TICK,
  BATTLE_EVENT.CREST_ACTIVATE,
  BATTLE_EVENT.CREST_EXPIRED
]);
const PATCH_KEY = Symbol.for("shadowbattle.test.crest-overlay");

renderEmptyStrips();
installCrestBridge();

function installCrestBridge() {
  if (GameSession.prototype[PATCH_KEY]) return;
  const originalEmit = GameSession.prototype.emit;
  Object.defineProperty(GameSession.prototype, PATCH_KEY, { value: true, configurable: false });
  GameSession.prototype.emit = function emitWithCrestOverlay(type, options = {}) {
    const event = originalEmit.call(this, type, options);
    if (type === BATTLE_EVENT.MATCH_START || CREST_EVENTS.has(type)) {
      queueMicrotask(() => syncCrests(this, event));
    }
    return event;
  };
}

function syncCrests(session, event = null) {
  for (let playerIndex = 0; playerIndex < ROOTS.length; playerIndex += 1) {
    const root = ROOTS[playerIndex];
    if (!root) continue;
    const crests = session.players[playerIndex]?.resources?.crests ?? [];
    renderStrip(root, crests, playerIndex);
  }
  if (event && CREST_EVENTS.has(event.type)) animateCrestEvent(event);
}

function renderEmptyStrips() {
  for (let playerIndex = 0; playerIndex < ROOTS.length; playerIndex += 1) {
    const root = ROOTS[playerIndex];
    if (root) renderStrip(root, [], playerIndex);
  }
}

function renderStrip(root, crests, playerIndex) {
  root.replaceChildren();
  root.dataset.player = String(playerIndex);
  for (let index = 0; index < 5; index += 1) {
    const crest = crests[index] ?? null;
    const slot = document.createElement("span");
    slot.className = "sb-crest-slot";
    if (!crest) {
      slot.setAttribute("aria-hidden", "true");
      root.append(slot);
      continue;
    }

    slot.classList.add("is-active");
    slot.dataset.crestId = String(crest.id ?? crest.name ?? index);
    slot.title = crestTitle(crest);
    slot.setAttribute("aria-label", crestTitle(crest));

    const sigil = document.createElement("span");
    sigil.className = "sb-crest-sigil";
    sigil.textContent = "✦";
    const label = document.createElement("span");
    label.className = "sb-crest-name";
    label.textContent = crestInitials(crest.name);
    slot.append(sigil, label);

    if (hasFiniteCountdown(crest)) {
      const countdown = document.createElement("span");
      countdown.className = "sb-crest-countdown";
      countdown.textContent = String(Math.max(0, Number(crest.countdown)));
      countdown.setAttribute("aria-label", `Countdown ${countdown.textContent}`);
      slot.append(countdown);
    }
    root.append(slot);
  }
}

function animateCrestEvent(event) {
  const playerIndex = Number(event.actor);
  const root = ROOTS[playerIndex];
  if (!root) return;
  const crest = event.payload?.crest;
  const crestId = String(crest?.id ?? "");
  const node = crestId ? [...root.querySelectorAll(".sb-crest-slot.is-active")].find(item => item.dataset.crestId === crestId) : null;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (reduced) return;

  if (event.type === BATTLE_EVENT.CREST_EXPIRED) {
    animateRoot(root, 420);
    return;
  }

  if (event.type === BATTLE_EVENT.CREST_ACTIVATE && !node) {
    // Crest Last Words activate after the expiring Crest has already left the
    // active list, so pulse the owner's Crest rail instead of losing feedback.
    animateRoot(root, 520);
    return;
  }
  if (!node) return;

  if (event.type === BATTLE_EVENT.CREST_GAINED) {
    animateNode(node, [
      { opacity: 0, transform: "scale(.25) rotate(-90deg)", filter: "brightness(2.2)" },
      { opacity: 1, transform: "scale(1.22) rotate(8deg)", filter: "brightness(1.8)" },
      { opacity: 1, transform: "scale(1) rotate(0)", filter: "brightness(1)" }
    ], 560);
  } else if (event.type === BATTLE_EVENT.CREST_TICK) {
    animateNode(node, [
      { transform: "scale(1)", filter: "brightness(1)" },
      { transform: "scale(.9)", filter: "brightness(.75)" },
      { transform: "scale(1.12)", filter: "brightness(1.6)" },
      { transform: "scale(1)", filter: "brightness(1)" }
    ], 340);
  } else if (event.type === BATTLE_EVENT.CREST_ACTIVATE) {
    animateNode(node, [
      { transform: "scale(1)", filter: "brightness(1)", boxShadow: "0 0 0 rgba(177,136,255,0)" },
      { transform: "scale(1.18)", filter: "brightness(2)", boxShadow: "0 0 28px rgba(177,136,255,.9)" },
      { transform: "scale(1)", filter: "brightness(1)", boxShadow: "0 0 8px rgba(177,136,255,.2)" }
    ], 520);
  }
}

function animateRoot(root, duration) {
  animateNode(root, [
    { filter: "brightness(1)", transform: "translateX(0)" },
    { filter: "brightness(1.7)", transform: "translateX(-3px)" },
    { filter: "brightness(.85)", transform: "translateX(3px)" },
    { filter: "brightness(1)", transform: "translateX(0)" }
  ], duration);
}

function crestTitle(crest) {
  const countdown = hasFiniteCountdown(crest) ? ` · Countdown ${Math.max(0, Number(crest.countdown))}` : " · Persistent";
  return `${crest?.name ?? "Crest"}${countdown}`;
}

function hasFiniteCountdown(crest) {
  return crest?.countdown != null && Number.isFinite(Number(crest.countdown));
}

function crestInitials(name) {
  const words = String(name ?? "Crest").split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => word[0]?.toUpperCase() ?? "").join("") || "C";
}

function animateNode(node, frames, duration) {
  if (!node?.animate) return;
  node.animate(frames, { duration, easing: "cubic-bezier(.2,.75,.2,1)" }).finished.catch(() => {});
}
