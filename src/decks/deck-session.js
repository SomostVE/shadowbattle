const LIBRARY_KEY = "shadowbattle:decks:v1";
const DRAFT_KEY = "shadowbattle:deck-drafts:v1";
const POOL_KEY = "shadowbattle:card-pool-mode";
const EDITABLE_GAMES = new Set(["shadowverse-ccg", "champions-battle"]);

const results = document.getElementById("deck-results");
const currentDeck = document.getElementById("current-deck");
const savedDecks = document.getElementById("saved-decks");
const gameSwitch = document.getElementById("deck-game-switch");
const craftButtons = document.getElementById("deck-craft-buttons");

let restoring = true;
let persistTimer = 0;
let activeDeckId = null;

init();

async function init() {
  if (!results || !currentDeck || !savedDecks) return;

  observeWorkingDeck();
  await waitFor(() => results.querySelector(".db-card-tile") || results.querySelector(".muted"), 7000);

  const requested = requestedDeck();
  if (requested.gameId && requested.gameId !== activeGameId()) {
    gameSwitch?.querySelector(`[data-game-select="${cssEscape(requested.gameId)}"]`)?.click();
    await waitFor(() => activeGameId() === requested.gameId && results.querySelector(".db-card-tile"), 7000);
  }

  const library = readJson(LIBRARY_KEY) ?? {};
  const gameId = activeGameId();
  const bucket = library?.games?.[gameId];
  const requestedId = requested.deckId;
  const storedActiveId = bucket?.activeDeckId ? String(bucket.activeDeckId) : null;
  const draft = readDraft(gameId);
  const targetId = requestedId || draft?.deckId || storedActiveId;

  if (targetId && await loadSavedDeck(targetId)) {
    activeDeckId = targetId;
    await waitFor(() => currentDeck.querySelector("[data-minus]") || totalDeckCount() === 0, 5000);
    if (draft && draft.deckId === targetId && Array.isArray(draft.entries)) {
      const saved = bucket?.decks?.[targetId];
      if (!sameEntries(saved?.entries, draft.entries)) await restoreEntries(draft);
    }
  } else if (draft?.entries?.length) {
    await restoreEntries(draft);
  }

  restoring = false;
  persistDraft();

  window.addEventListener("pagehide", persistDraft);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) persistDraft();
  });
}

function observeWorkingDeck() {
  const queuePersist = () => {
    if (restoring) return;
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(persistDraft, 80);
  };

  // The deck renderer replaces the root children in one operation. Watching
  // descendants and character data only multiplies mutation records without
  // revealing any additional deck-state change.
  new MutationObserver(queuePersist).observe(currentDeck, { childList: true });

  savedDecks.addEventListener("click", event => {
    const load = event.target.closest?.("[data-load-deck]");
    if (load) activeDeckId = String(load.dataset.loadDeck);
  }, true);

  document.getElementById("save-deck")?.addEventListener("click", () => {
    queueMicrotask(() => {
      const library = readJson(LIBRARY_KEY);
      activeDeckId = library?.games?.[activeGameId()]?.activeDeckId ?? activeDeckId;
      persistDraft();
    });
  });

  gameSwitch?.addEventListener("click", () => {
    if (!restoring) persistDraft();
  }, true);
}

function persistDraft() {
  if (restoring) return;
  const gameId = activeGameId();
  if (!EDITABLE_GAMES.has(gameId)) return;

  const all = readJson(DRAFT_KEY) ?? { schemaVersion: 1, games: {} };
  all.schemaVersion = 1;
  all.games ??= {};
  all.games[gameId] = {
    gameId,
    deckId: activeDeckId || activeLibraryDeckId(gameId),
    craft: activeCraft(),
    poolMode: localStorage.getItem(POOL_KEY) === "neutral" ? "neutral" : "class",
    entries: readDeckEntries(),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
}

async function loadSavedDeck(deckId) {
  await waitFor(() => savedDecks.querySelector(`[data-load-deck="${cssEscape(deckId)}"]`), 3000);
  const button = savedDecks.querySelector(`[data-load-deck="${cssEscape(deckId)}"]`);
  if (!button) return false;
  button.click();
  return true;
}

async function restoreEntries(draft) {
  const entries = normalizeEntries(draft.entries);
  if (!entries.length) return;

  restoring = true;
  const requestedCraft = String(draft.craft || "");
  if (requestedCraft && requestedCraft !== activeCraft()) {
    const button = craftButtons?.querySelector(`[data-craft="${cssEscape(requestedCraft)}"]`);
    if (button) {
      const renderId = results.dataset.renderId;
      button.click();
      await waitForGridRender(renderId, 2000);
    }
  }

  // First align quantities already present after loading a saved variant.
  for (const [id, wanted] of entries) {
    const have = currentQuantity(id);
    if (have > wanted) {
      for (let i = wanted; i < have; i += 1) currentDeck.querySelector(`[data-minus="${cssEscape(String(id))}"]`)?.click();
    }
  }

  const missing = entries.filter(([id, wanted]) => currentQuantity(id) < wanted);
  if (missing.length) {
    await setPoolMode("class");
    const unresolved = [];
    for (const [id, wanted] of missing) {
      const found = await addUntil(id, wanted, 900);
      if (!found) unresolved.push([id, wanted]);
    }

    if (unresolved.length) {
      await setPoolMode("neutral");
      for (const [id, wanted] of unresolved) await addUntil(id, wanted, 1200);
    }
  }

  await setPoolMode(draft.poolMode === "neutral" ? "neutral" : "class");
  restoring = false;
}

async function addUntil(id, wanted, timeout) {
  const selector = `[data-add="${cssEscape(String(id))}"]`;
  await waitFor(() => results.querySelector(selector), timeout);
  const add = results.querySelector(selector);
  if (!add) return false;
  while (currentQuantity(id) < wanted && totalDeckCount() < 40) add.click();
  return currentQuantity(id) >= wanted;
}

async function setPoolMode(mode) {
  const normalized = mode === "neutral" ? "neutral" : "class";
  const current = localStorage.getItem(POOL_KEY) === "neutral" ? "neutral" : "class";
  if (current === normalized) return;

  const renderId = results.dataset.renderId;
  if (normalized === "neutral") {
    const neutral = craftButtons?.querySelector("[data-neutral-toggle]");
    if (neutral) neutral.click();
    else {
      localStorage.setItem(POOL_KEY, "neutral");
      document.getElementById("deck-search")?.dispatchEvent(new Event("input", { bubbles: true }));
    }
  } else {
    const selectedCraft = activeCraft();
    const button = craftButtons?.querySelector(`[data-craft="${cssEscape(selectedCraft)}"]`);
    if (button) button.click();
    else {
      localStorage.setItem(POOL_KEY, "class");
      document.getElementById("deck-search")?.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  await waitFor(() => results.dataset.renderId !== renderId && results.dataset.cardPoolMode === normalized, 2000);
}

function requestedDeck() {
  const url = new URL(location.href);
  const gameId = url.searchParams.get("game");
  const deckId = url.searchParams.get("deck");
  return {
    gameId: EDITABLE_GAMES.has(gameId) ? gameId : null,
    deckId: deckId ? String(deckId) : null
  };
}

function readDraft(gameId) {
  return readJson(DRAFT_KEY)?.games?.[gameId] ?? null;
}

function activeLibraryDeckId(gameId) {
  return readJson(LIBRARY_KEY)?.games?.[gameId]?.activeDeckId ?? null;
}

function readDeckEntries() {
  const entries = [];
  for (const minus of currentDeck.querySelectorAll("[data-minus]")) {
    const id = Number(minus.dataset.minus);
    const row = minus.closest(".db-deck-row");
    const quantityText = row?.querySelector(".db-deck-controls span")?.textContent ?? "0";
    const quantity = Number.parseInt(quantityText, 10) || 0;
    if (Number.isFinite(id) && id > 0 && quantity > 0) entries.push([id, quantity]);
  }
  return entries.sort((a, b) => a[0] - b[0]);
}

function currentQuantity(id) {
  const minus = currentDeck.querySelector(`[data-minus="${cssEscape(String(id))}"]`);
  const row = minus?.closest(".db-deck-row");
  return Number.parseInt(row?.querySelector(".db-deck-controls span")?.textContent ?? "0", 10) || 0;
}

function totalDeckCount() {
  return Number.parseInt(document.getElementById("current-deck-count")?.textContent ?? "0", 10) || 0;
}

function activeGameId() {
  return document.querySelector("[data-game-select].active")?.dataset.gameSelect
    || document.getElementById("deck-game")?.value
    || "shadowverse-ccg";
}

function activeCraft() {
  return document.querySelector("[data-craft].active")?.dataset.craft
    || document.getElementById("deck-craft")?.value
    || "Forestcraft";
}

function normalizeEntries(entries) {
  return (entries ?? [])
    .map(entry => [Number(entry?.[0]), Number(entry?.[1])])
    .filter(([id, quantity]) => Number.isFinite(id) && id > 0 && Number.isFinite(quantity) && quantity > 0)
    .map(([id, quantity]) => [id, Math.min(3, Math.floor(quantity))])
    .sort((a, b) => a[0] - b[0]);
}

function sameEntries(a, b) {
  return JSON.stringify(normalizeEntries(a)) === JSON.stringify(normalizeEntries(b));
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function waitForGridRender(renderId, timeout) {
  return waitFor(() => results.dataset.renderId !== renderId, timeout);
}

async function waitFor(predicate, timeout = 3000) {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    if (predicate()) return true;
    await wait(40);
  }
  return false;
}
