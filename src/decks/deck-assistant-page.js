import { catalogSearchText, loadDeckCatalog, loadDeckReferenceCards } from "./catalog.js";
import { cardTraits, cardKeywords, installCardAssistant, closeCardAssistant } from "./card-assistant.js";

const CARD_POOL_MODE_KEY = "shadowbattle:card-pool-mode";
const EMPTY_MAP = new Map();
const catalogs = new Map();
const maps = new Map();
const selectedTraits = new Set();
const selectedKeywords = new Set();

const els = {
  results: document.getElementById("deck-results"),
  resultCount: document.getElementById("deck-result-count"),
  traitFilter: document.getElementById("deck-trait-filter"),
  keywordFilter: document.getElementById("deck-keyword-filter"),
  search: document.getElementById("deck-search"),
  set: document.getElementById("deck-set"),
  craft: document.getElementById("deck-craft"),
  game: document.getElementById("deck-game"),
  reset: document.getElementById("reset-filters")
};

let refreshQueued = false;
let assistantVisibleIds = null;

init();

async function init() {
  if (!els.results || !els.traitFilter || !els.keywordFilter) return;

  await ensureCatalog(activeGameId());
  bindFilters();
  installGridObserver();
  installCardAssistant(els.results, {
    getCardById: id => currentCardMap().get(Number(id)) ?? null,
    getReferenceCards: requestedGameId => loadDeckReferenceCards(requestedGameId),
    getDeckCards: requestedGameId => relevantDeckCards(requestedGameId),
    getQuantity: card => quantityForCard(card),
    onAdd: card => addFromVisibleGrid(card),
    onFilterTrait: trait => {
      selectedTraits.clear();
      selectedTraits.add(trait);
      openFilters();
      refreshAssistantFilters();
    },
    onFilterKeyword: keyword => {
      selectedKeywords.clear();
      selectedKeywords.add(keyword);
      openFilters();
      refreshAssistantFilters();
    }
  });

  // Warm the local raw reference archive after the initial grid is usable. This
  // does not block first paint or class switching, but usually makes the first
  // hover relation panel instant.
  window.setTimeout(() => loadDeckReferenceCards(activeGameId()).catch(() => {}), 1400);
  refreshAssistantFilters();
}

function bindFilters() {
  els.traitFilter.addEventListener("click", event => {
    const button = event.target.closest("[data-trait]");
    if (!button) return;
    toggle(selectedTraits, button.dataset.trait);
    refreshAssistantFilters();
  });

  els.keywordFilter.addEventListener("click", event => {
    const button = event.target.closest("[data-keyword]");
    if (!button) return;
    toggle(selectedKeywords, button.dataset.keyword);
    refreshAssistantFilters();
  });

  els.reset?.addEventListener("click", () => {
    selectedTraits.clear();
    selectedKeywords.clear();
    queueRefresh();
  }, true);

  els.game?.addEventListener("change", () => handleContextChange(true));
  els.craft?.addEventListener("change", () => handleContextChange(false));
  els.search?.addEventListener("input", queueRefresh);
  els.set?.addEventListener("change", queueRefresh);

  document.addEventListener("click", event => {
    if (event.target.closest("[data-game-select]")) handleContextChange(true);
    if (event.target.closest("[data-craft]")) handleContextChange(false);
    if (event.target.closest("[data-rarity], [data-cost], [data-type]")) queueRefresh();
  });

  window.addEventListener("storage", event => {
    if (event.key === CARD_POOL_MODE_KEY) queueRefresh();
  });
}

function installGridObserver() {
  new MutationObserver(mutations => {
    const addedTiles = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element && node.matches(".db-card-tile[data-card-id]")) addedTiles.push(node);
      }
    }
    if (addedTiles.length) applyAssistantVisibility(addedTiles, false);
  }).observe(els.results, { childList: true });
}

async function handleContextChange(gameChanged) {
  closeCardAssistant(true);
  selectedTraits.clear();
  selectedKeywords.clear();
  if (gameChanged) {
    await new Promise(resolve => requestAnimationFrame(resolve));
    await ensureCatalog(activeGameId());
    window.setTimeout(() => loadDeckReferenceCards(activeGameId()).catch(() => {}), 1200);
  }
  queueRefresh();
}

function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(async () => {
    refreshQueued = false;
    await ensureCatalog(activeGameId());
    refreshAssistantFilters();
  });
}

function refreshAssistantFilters() {
  const base = baseCardsForAssistant();
  const { traitCounts, keywordCounts, visibleIds } = summarizeAssistantCards(base);
  assistantVisibleIds = visibleIds;
  renderFacet(els.traitFilter, traitCounts, selectedTraits, "trait");
  renderFacet(els.keywordFilter, keywordCounts, selectedKeywords, "keyword");
  applyAssistantVisibility();
}

function summarizeAssistantCards(cards) {
  const traitCounts = new Map();
  const keywordCounts = new Map();
  const visibleIds = new Set();

  for (const card of cards) {
    const traits = cardTraits(card);
    const keywords = cardKeywords(card);
    for (const trait of traits) traitCounts.set(trait, (traitCounts.get(trait) ?? 0) + 1);
    for (const keyword of keywords) keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1);
    if (matchesSelected(traits, selectedTraits) && matchesSelected(keywords, selectedKeywords)) {
      visibleIds.add(Number(card.id));
    }
  }

  return { traitCounts, keywordCounts, visibleIds };
}

function matchesSelected(values, selected) {
  for (const value of selected) {
    if (!values.includes(value)) return false;
  }
  return true;
}

function baseCardsForAssistant() {
  const cards = currentCatalog();
  const craft = activeCraft();
  const poolMode = localStorage.getItem(CARD_POOL_MODE_KEY) === "neutral" ? "neutral" : "class";
  const setId = els.set?.value ?? "all";
  const needle = String(els.search?.value ?? "").trim().toLowerCase();
  const activeRarities = activeValues("[data-rarity].active", "rarity");
  const activeCosts = activeValues("[data-cost].active", "cost");
  const activeTypes = activeValues("[data-type].active", "type");

  return cards.filter(card => {
    if (poolMode === "neutral") {
      if (card.craft !== "Neutral") return false;
    } else if (card.craft !== craft) {
      return false;
    }
    if (setId !== "all" && String(card.setId) !== String(setId)) return false;
    if (activeRarities.size && !activeRarities.has(card.rarity)) return false;
    if (activeCosts.size && !activeCosts.has(costKey(card))) return false;
    if (activeTypes.size && !activeTypes.has(typeKey(card))) return false;
    return !needle || catalogSearchText(card).includes(needle);
  });
}

function applyAssistantVisibility(tiles = null, syncCount = true) {
  if (!assistantVisibleIds) return;
  const visibleTiles = tiles ?? els.results.querySelectorAll(".db-card-tile[data-card-id]");
  for (const tile of visibleTiles) tile.hidden = !assistantVisibleIds.has(Number(tile.dataset.cardId));
  if (syncCount && els.resultCount) els.resultCount.textContent = `${assistantVisibleIds.size.toLocaleString()} cards`;
}

function renderFacet(root, counts, selected, dataName) {
  const rows = [...counts.entries()]
    .filter(([value]) => value)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  root.innerHTML = rows.map(([value, count]) => `<button type="button" class="db-assistant-filter-chip${selected.has(value) ? " active" : ""}" data-${dataName}="${escapeAttr(value)}">
    <span>${escapeHtml(value)}</span><small>${count}</small>
  </button>`).join("") || `<span class="db-assistant-empty">None in this pool</span>`;
}

function relevantDeckCards(requestedGameId) {
  const payload = catalogs.get(requestedGameId);
  if (!payload) return [];
  const craft = requestedGameId === activeGameId() ? activeCraft() : null;
  if (!craft) return payload.cards ?? [];
  return (payload.cards ?? []).filter(card => card.craft === craft || card.craft === "Neutral");
}

async function ensureCatalog(gameId) {
  if (catalogs.has(gameId)) return catalogs.get(gameId);
  const payload = await loadDeckCatalog(gameId);
  catalogs.set(gameId, payload);
  maps.set(gameId, new Map((payload.cards ?? []).map(card => [Number(card.id), card])));
  return payload;
}

function currentCatalog() {
  return catalogs.get(activeGameId())?.cards ?? [];
}

function currentCardMap() {
  return maps.get(activeGameId()) ?? EMPTY_MAP;
}

function activeGameId() {
  return document.querySelector("[data-game-select].active")?.dataset.gameSelect
    || els.game?.value
    || "shadowverse-ccg";
}

function activeCraft() {
  return document.querySelector("[data-craft].active")?.dataset.craft
    || els.craft?.value
    || "Forestcraft";
}

function activeValues(selector, datasetKey) {
  return new Set([...document.querySelectorAll(selector)].map(node => node.dataset[datasetKey]).filter(Boolean));
}

function quantityForCard(card) {
  const badge = els.results.querySelector(`.db-card-tile[data-card-id="${CSS.escape(String(card.id))}"] .db-card-quantity`);
  return Number(String(badge?.textContent ?? "0").replace(/\D+/g, "")) || 0;
}

function addFromVisibleGrid(card) {
  const button = els.results.querySelector(`[data-add="${CSS.escape(String(card.id))}"]`);
  button?.click();
}

function openFilters() {
  document.getElementById("filters-drawer-toggle")?.click();
}

function toggle(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

function costKey(card) {
  const cost = Number(card?.cost ?? 0);
  return cost >= 10 ? "10+" : String(Math.max(0, cost));
}

function typeKey(card) {
  const value = String(card?.type ?? "");
  if (value.includes("Amulet")) return "Amulet";
  if (value === "Follower") return "Follower";
  if (value === "Spell") return "Spell";
  return value || "Other";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}