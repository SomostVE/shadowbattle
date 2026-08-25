import { GAME_IDS, GAME_CATALOG } from "../core/game-catalog.js";
import { loadDeckCatalog, filterCatalog } from "./catalog.js";
import { canAddCard, validateDeckEntries } from "./deck-rules.js";
import { renderCardGrid, updateCardTile, syncCardQuantities } from "./card-grid.js";
import {
  createDeckRecord,
  deleteDeck,
  listDecks,
  loadDeckLibrary,
  saveDeckLibrary,
  upsertDeck
} from "./storage.js";
import {
  importBeyondDeckExport,
  importBeyondDecksWorkspace,
  readBeyondDecksLocalWorkspace
} from "./import-beyond-decks.js";

const EDITABLE_GAMES = [GAME_IDS.SHADOWVERSE_CCG, GAME_IDS.CHAMPIONS_BATTLE];
const CRAFTS = Object.freeze({
  [GAME_IDS.SHADOWVERSE_CCG]: ["Forestcraft", "Swordcraft", "Runecraft", "Dragoncraft", "Shadowcraft", "Bloodcraft", "Havencraft", "Portalcraft"],
  [GAME_IDS.CHAMPIONS_BATTLE]: ["Forestcraft", "Swordcraft", "Runecraft", "Dragoncraft", "Shadowcraft", "Bloodcraft", "Havencraft"]
});
const CRAFT_VISUALS = Object.freeze({
  Forestcraft: { glyph: "🌿", color: "#69d77b", rgb: "105, 215, 123" },
  Swordcraft: { glyph: "♛", color: "#e1c44f", rgb: "225, 196, 79" },
  Runecraft: { glyph: "✧", color: "#8f94ff", rgb: "143, 148, 255" },
  Dragoncraft: { glyph: "🐉", color: "#f39a4b", rgb: "243, 154, 75" },
  Shadowcraft: { glyph: "☠", color: "#bc61d8", rgb: "188, 97, 216" },
  Bloodcraft: { glyph: "🩸", color: "#df5b83", rgb: "223, 91, 131" },
  Havencraft: { glyph: "✦", color: "#dbc983", rgb: "219, 201, 131" },
  Portalcraft: { glyph: "⬡", color: "#45ced7", rgb: "69, 206, 215" }
});
const RARITIES = ["Bronze", "Silver", "Gold", "Legendary"];
const COST_KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];
const TYPE_KEYS = ["Follower", "Amulet", "Spell"];
const CLASS_SCROLL_PREFIX = "shadowbattle:class-scroll:";

const els = {
  gameSwitch: document.getElementById("deck-game-switch"),
  game: document.getElementById("deck-game"),
  craftButtons: document.getElementById("deck-craft-buttons"),
  craft: document.getElementById("deck-craft"),
  rarityFilter: document.getElementById("deck-rarity-filter"),
  costFilter: document.getElementById("deck-cost-filter"),
  typeFilter: document.getElementById("deck-type-filter"),
  name: document.getElementById("deck-name"),
  search: document.getElementById("deck-search"),
  set: document.getElementById("deck-set"),
  format: document.getElementById("deck-format"),
  results: document.getElementById("deck-results"),
  resultCount: document.getElementById("deck-result-count"),
  deck: document.getElementById("current-deck"),
  deckCount: document.getElementById("current-deck-count"),
  mainDeckCount: document.getElementById("main-deck-count"),
  legality: document.getElementById("deck-legality"),
  deckSort: document.getElementById("deck-sort"),
  deckCompact: document.getElementById("deck-compact-toggle"),
  deckCostStrip: document.getElementById("deck-cost-strip"),
  saved: document.getElementById("saved-decks"),
  status: document.getElementById("deck-status"),
  save: document.getElementById("save-deck"),
  newDeck: document.getElementById("new-deck"),
  exportDeck: document.getElementById("export-shadowbattle-deck"),
  importLocal: document.getElementById("import-beyond-local"),
  importText: document.getElementById("beyond-import-json"),
  importJson: document.getElementById("import-beyond-json"),
  importFile: document.getElementById("import-beyond-file"),
  filtersToggle: document.getElementById("filters-drawer-toggle"),
  filtersClose: document.getElementById("filters-drawer-close"),
  filtersSidebar: document.getElementById("filters-sidebar"),
  filtersBackdrop: document.getElementById("filters-drawer-backdrop"),
  resetFilters: document.getElementById("reset-filters"),
  cardSize: document.getElementById("deck-card-size"),
  cardSizePresets: [...document.querySelectorAll("[data-card-size-preset]")],
  content: document.querySelector(".db-content"),
  backToTop: document.getElementById("back-to-top"),
  preview: document.getElementById("card-preview-dialog"),
  previewClose: document.getElementById("card-preview-close"),
  previewTitle: document.getElementById("card-preview-title"),
  previewMeta: document.getElementById("card-preview-meta"),
  previewImage: document.getElementById("card-preview-image"),
  previewStats: document.getElementById("card-preview-stats"),
  previewText: document.getElementById("card-preview-text"),
  previewNormal: document.getElementById("card-preview-normal"),
  previewEvolved: document.getElementById("card-preview-evolved"),
  previewAdd: document.getElementById("card-preview-add")
};

let library = loadDeckLibrary();
let gameId = GAME_IDS.SHADOWVERSE_CCG;
let craft = CRAFTS[gameId][0];
let catalog = [];
let cardMap = new Map();
let craftPools = new Map();
let entries = new Map();
let currentDeckId = null;
let currentSet = "all";
let previewCardId = null;
let previewUsesEvolvedArt = false;
let deckSort = "cost";
let compactDeck = true;
let selectedRarities = new Set();
let selectedCosts = new Set();
let selectedTypes = new Set();
let statusTimer = 0;
let clearArmTimer = 0;
let clearArmed = false;

init();

async function init() {
  bindEvents();
  renderSavedDecks();
  setCardSize(118, "fit");
  await switchGame(gameId, { reset: true });
}

function bindEvents() {
  els.gameSwitch.addEventListener("click", event => {
    const button = event.target.closest("[data-game-select]");
    if (button) switchGame(button.dataset.gameSelect, { reset: true });
  });
  els.game.addEventListener("change", () => switchGame(els.game.value, { reset: true }));

  els.craftButtons.addEventListener("click", event => {
    const button = event.target.closest("[data-craft]");
    if (button) changeCraft(button.dataset.craft);
  });
  els.craft.addEventListener("change", () => changeCraft(els.craft.value));

  els.rarityFilter.addEventListener("click", event => {
    const button = event.target.closest("[data-rarity]");
    if (!button) return;
    toggleSetValue(selectedRarities, button.dataset.rarity);
    renderResults();
  });
  els.costFilter.addEventListener("click", event => {
    const button = event.target.closest("[data-cost]");
    if (!button) return;
    toggleSetValue(selectedCosts, button.dataset.cost);
    renderResults();
  });
  els.typeFilter.addEventListener("click", event => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    toggleSetValue(selectedTypes, button.dataset.type);
    renderResults();
  });

  els.search.addEventListener("input", renderResults);
  els.set.addEventListener("change", () => {
    currentSet = els.set.value;
    renderResults();
  });
  els.resetFilters.addEventListener("click", resetCardFilters);

  els.results.addEventListener("click", event => {
    const artToggle = event.target.closest("[data-art-toggle]");
    if (artToggle) {
      event.stopPropagation();
      toggleTileArt(artToggle);
      return;
    }
    const preview = event.target.closest("[data-preview]");
    if (preview) {
      event.stopPropagation();
      openPreview(Number(preview.dataset.preview));
      return;
    }
    const add = event.target.closest("[data-add]");
    if (add) addCard(Number(add.dataset.add));
  });
  els.results.addEventListener("contextmenu", event => {
    const tile = event.target.closest(".db-card-tile[data-card-id]");
    if (!tile) return;
    event.preventDefault();
    removeCard(Number(tile.dataset.cardId));
  });

  els.save.addEventListener("click", saveCurrentDeck);
  els.newDeck.addEventListener("click", handleClearDeck);
  els.exportDeck.addEventListener("click", exportCurrentDeck);
  els.deckSort.addEventListener("change", () => {
    deckSort = els.deckSort.value;
    renderDeck();
  });
  els.deckCompact.addEventListener("click", () => {
    compactDeck = !compactDeck;
    els.deckCompact.classList.toggle("active", compactDeck);
    els.deckCompact.textContent = compactDeck ? "Compact" : "Comfort";
    els.deck.classList.toggle("comfortable", !compactDeck);
  });

  els.importLocal.addEventListener("click", importLocalBeyondDecks);
  els.importJson.addEventListener("click", () => importBeyondText(els.importText.value));
  els.importFile.addEventListener("change", async () => {
    const file = els.importFile.files?.[0];
    if (!file) return;
    await importBeyondText(await file.text());
    els.importFile.value = "";
  });

  document.querySelectorAll("[data-db-tab]").forEach(button => {
    button.addEventListener("click", () => showTab(button.dataset.dbTab));
  });

  els.filtersToggle.addEventListener("click", openFilters);
  els.filtersClose.addEventListener("click", closeFilters);
  els.filtersBackdrop.addEventListener("click", closeFilters);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeFilters();
  });

  els.cardSize.addEventListener("input", () => setCardSize(Number(els.cardSize.value)));
  els.cardSizePresets.forEach(button => {
    button.addEventListener("click", () => {
      const preset = button.dataset.cardSizePreset;
      setCardSize(preset === "fit" ? 118 : Number(preset), preset);
    });
  });

  els.content.addEventListener("scroll", () => {
    els.backToTop.hidden = els.content.scrollTop < 700;
  }, { passive: true });
  els.backToTop.addEventListener("click", () => els.content.scrollTo({ top: 0, behavior: "smooth" }));

  els.previewClose.addEventListener("click", () => els.preview.close());
  els.preview.addEventListener("click", event => {
    if (event.target === els.preview) els.preview.close();
  });
  els.previewNormal.addEventListener("click", () => setPreviewArt(false));
  els.previewEvolved.addEventListener("click", () => setPreviewArt(true));
  els.previewImage.addEventListener("click", () => {
    const card = cardMap.get(previewCardId);
    if (card && hasEvolvedArt(card)) setPreviewArt(!previewUsesEvolvedArt);
  });
  els.previewAdd.addEventListener("click", () => {
    if (previewCardId == null) return;
    addCard(previewCardId);
    renderPreview();
  });
}

async function switchGame(nextGameId, { reset = false } = {}) {
  if (!EDITABLE_GAMES.includes(nextGameId)) return;
  saveClassScroll();
  gameId = nextGameId;
  document.body.dataset.game = gameId;
  els.game.value = gameId;
  syncGameButtons();
  clearFilterSelections();
  setStatus(`Loading ${GAME_CATALOG[gameId].shortName} catalog…`);

  try {
    const payload = await loadDeckCatalog(gameId);
    catalog = payload.cards;
    cardMap = new Map(catalog.map(card => [Number(card.id), card]));
    buildCraftPools();
    renderCrafts();
    renderSets();
    renderFormat();
    if (reset) resetDeck({ keepStatus: true, refreshGrid: false });
    renderResults({ restoreScroll: true });
    setStatus(`${catalog.length.toLocaleString()} local deckbuilding cards loaded.`);
  } catch (error) {
    catalog = [];
    cardMap = new Map();
    craftPools = new Map();
    renderResults();
    setStatus(error.message, true);
  }
}

function buildCraftPools() {
  const neutrals = catalog.filter(card => card.craft === "Neutral");
  craftPools = new Map();
  for (const className of CRAFTS[gameId] ?? []) {
    const own = catalog.filter(card => card.craft === className);
    craftPools.set(className, [...own, ...neutrals]);
  }
}

function syncGameButtons() {
  els.gameSwitch.querySelectorAll("[data-game-select]").forEach(button => {
    button.classList.toggle("active", button.dataset.gameSelect === gameId);
  });
}

function renderCrafts() {
  const available = CRAFTS[gameId] ?? [];
  if (!available.includes(craft)) craft = available[0];
  els.craft.innerHTML = available.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  els.craft.value = craft;
  renderCraftButtons();
  applyCraftTheme();
}

function renderCraftButtons() {
  const available = CRAFTS[gameId] ?? [];
  els.craftButtons.innerHTML = available.map(value => {
    const visual = CRAFT_VISUALS[value] ?? { glyph: value.slice(0, 1), rgb: "139, 153, 255" };
    return `<button type="button" class="db-craft-button${value === craft ? " active" : ""}" data-craft="${escapeHtml(value)}" title="${escapeHtml(value)}" aria-label="${escapeHtml(value)}" style="--craft-rgb:${visual.rgb}">${visual.glyph}</button>`;
  }).join("");
}

function syncCraftButtons() {
  els.craftButtons.querySelectorAll("[data-craft]").forEach(button => {
    button.classList.toggle("active", button.dataset.craft === craft);
  });
}

function applyCraftTheme() {
  const visual = CRAFT_VISUALS[craft] ?? { color: "#8b99ff", rgb: "139, 153, 255" };
  document.documentElement.style.setProperty("--class-accent", visual.color);
  document.documentElement.style.setProperty("--class-accent-rgb", visual.rgb);
}

function changeCraft(nextCraft) {
  if (!CRAFTS[gameId]?.includes(nextCraft) || nextCraft === craft) return;
  const incompatible = [...entries.keys()].some(id => {
    const cardCraft = cardMap.get(id)?.craft;
    return cardCraft && cardCraft !== "Neutral" && cardCraft !== nextCraft;
  });
  if (incompatible) {
    els.craft.value = craft;
    setStatus("Remove cards from the current craft before changing craft.", true);
    return;
  }

  saveClassScroll();
  craft = nextCraft;
  els.craft.value = craft;
  syncCraftButtons();
  applyCraftTheme();
  renderResults({ restoreScroll: true });
}

function renderSets() {
  const sets = [...new Map(catalog.map(card => [String(card.setId), card.set])).entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  els.set.innerHTML = `<option value="all">All sets</option>${sets.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("")}`;
  currentSet = "all";
  els.set.value = currentSet;
}

function renderFormat() {
  const label = gameId === GAME_IDS.SHADOWVERSE_CCG ? "Unlimited" : "Champion's Battle";
  els.format.innerHTML = `<option>${escapeHtml(label)}</option>`;
}

function renderResults({ restoreScroll = false } = {}) {
  const pool = craftPools.get(craft) ?? catalog;
  const base = filterCatalog(pool, {
    query: els.search.value,
    craft: "all",
    set: currentSet
  });

  renderRarityFilter(base);
  renderCostFilter(base);
  renderTypeFilter(base);

  const filtered = base.filter(card => {
    if (selectedRarities.size && !selectedRarities.has(card.rarity)) return false;
    if (selectedCosts.size && !selectedCosts.has(costKey(card))) return false;
    if (selectedTypes.size && !selectedTypes.has(typeKey(card))) return false;
    return true;
  });

  els.resultCount.textContent = `${filtered.length.toLocaleString()} cards`;
  renderCardGrid(els.results, filtered, {
    getQuantity: card => entries.get(Number(card.id)) ?? 0,
    getCardById: id => cardMap.get(Number(id)) ?? null,
    hasEvolvedArt,
    setImageArt
  }, { batchSize: 96 });

  if (restoreScroll) restoreClassScroll();
}

function renderRarityFilter(cards) {
  const counts = countBy(cards, card => card.rarity);
  els.rarityFilter.innerHTML = RARITIES.map(rarity => `<button type="button" class="db-rarity-button${selectedRarities.has(rarity) ? " active" : ""}" data-rarity="${rarity}">${rarity}<small>${counts.get(rarity) ?? 0}</small></button>`).join("");
}

function renderCostFilter(cards) {
  const counts = countBy(cards, costKey);
  els.costFilter.innerHTML = COST_KEYS.map(key => `<button type="button" class="db-cost-button${selectedCosts.has(key) ? " active" : ""}" data-cost="${key}"><span>${key}</span><small>${counts.get(key) ?? 0}</small></button>`).join("");
}

function renderTypeFilter(cards) {
  const counts = countBy(cards, typeKey);
  els.typeFilter.innerHTML = TYPE_KEYS.map(key => `<button type="button" class="db-type-button${selectedTypes.has(key) ? " active" : ""}" data-type="${key}">${key}<small>${counts.get(key) ?? 0}</small></button>`).join("");
}

function countBy(cards, getter) {
  const counts = new Map();
  for (const card of cards) {
    const key = getter(card);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
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

function toggleSetValue(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

function clearFilterSelections() {
  selectedRarities = new Set();
  selectedCosts = new Set();
  selectedTypes = new Set();
}

function resetCardFilters() {
  els.search.value = "";
  currentSet = "all";
  els.set.value = "all";
  clearFilterSelections();
  renderResults();
  setStatus("Card filters reset.");
}

function addCard(cardId) {
  const card = cardMap.get(cardId);
  if (!card) return;
  if (card.craft !== craft && card.craft !== "Neutral") return;
  if (!canAddCard(gameId, entries, cardId, 1)) {
    setStatus("Deck limit reached: 40 cards total, maximum 3 copies per card.", true);
    return;
  }
  const next = (entries.get(cardId) ?? 0) + 1;
  entries.set(cardId, next);
  renderDeck();
  updateCardTile(els.results, cardId, next);
}

function removeCard(cardId, amount = 1) {
  const current = entries.get(cardId) ?? 0;
  if (current <= 0) return;
  const next = current - amount;
  if (next <= 0) entries.delete(cardId);
  else entries.set(cardId, next);
  renderDeck();
  updateCardTile(els.results, cardId, Math.max(0, next));
}

function renderDeck() {
  const validation = validateDeckEntries(gameId, entries);
  els.deckCount.textContent = `${validation.total} / 40`;
  els.mainDeckCount.textContent = `${validation.total} / 40`;
  els.legality.textContent = validation.legal
    ? "Legal 40-card deck"
    : validation.withinSizeLimit
      ? `${40 - validation.total} cards remaining`
      : "Deck is over the limit";
  els.legality.dataset.legal = validation.legal ? "true" : "false";

  renderDeckCostStrip();

  const rows = [...entries.entries()]
    .map(([id, quantity]) => ({ card: cardMap.get(id), id, quantity }))
    .sort(deckComparator);

  els.deck.innerHTML = rows.map(({ card, id, quantity }) => `<div class="db-deck-row">
    ${card ? `<img data-deck-art="${id}" alt="" referrerpolicy="no-referrer" title="Inspect ${escapeHtml(card.name)}">` : `<span class="db-deck-art-placeholder">?</span>`}
    <div class="db-deck-row-copy">
      <strong>${escapeHtml(card?.name ?? `Card ${id}`)}</strong>
      <small>${card ? `Cost ${card.cost} · ${escapeHtml(card.rarity)} · ${escapeHtml(card.set)}` : escapeHtml(gameId)}</small>
    </div>
    <div class="db-deck-controls">
      <button type="button" data-minus="${id}" aria-label="Remove one">−</button>
      <span>${quantity}x</span>
      <button type="button" data-plus="${id}" aria-label="Add one" ${quantity >= 3 || validation.total >= 40 ? "disabled" : ""}>+</button>
    </div>
  </div>`).join("") || `<p class="muted">Your deck is empty.</p>`;

  els.deck.querySelectorAll("img[data-deck-art]").forEach(image => {
    const card = cardMap.get(Number(image.dataset.deckArt));
    if (!card) return;
    setImageArt(image, card, false);
    image.addEventListener("click", () => openPreview(Number(image.dataset.deckArt)));
  });
  els.deck.querySelectorAll("[data-minus]").forEach(button => button.addEventListener("click", () => removeCard(Number(button.dataset.minus))));
  els.deck.querySelectorAll("[data-plus]").forEach(button => button.addEventListener("click", () => addCard(Number(button.dataset.plus))));
}

function deckComparator(a, b) {
  if (deckSort === "name") return String(a.card?.name ?? "").localeCompare(String(b.card?.name ?? ""));
  if (deckSort === "set") {
    return (Number(a.card?.setId ?? 999999) - Number(b.card?.setId ?? 999999))
      || (Number(a.card?.cost ?? 99) - Number(b.card?.cost ?? 99))
      || String(a.card?.name ?? "").localeCompare(String(b.card?.name ?? ""));
  }
  return (Number(a.card?.cost ?? 99) - Number(b.card?.cost ?? 99))
    || String(a.card?.name ?? "").localeCompare(String(b.card?.name ?? ""));
}

function renderDeckCostStrip() {
  const counts = new Map(COST_KEYS.map(key => [key, 0]));
  for (const [id, quantity] of entries) {
    const card = cardMap.get(Number(id));
    const key = card ? costKey(card) : "10+";
    counts.set(key, (counts.get(key) ?? 0) + quantity);
  }
  els.deckCostStrip.innerHTML = COST_KEYS.map(key => `<div class="db-deck-cost-cell"><span>${key}</span><strong>${counts.get(key) ?? 0}</strong></div>`).join("");
}

function resetDeck({ keepStatus = false, refreshGrid = true } = {}) {
  entries = new Map();
  currentDeckId = null;
  els.name.value = "";
  renderDeck();
  if (refreshGrid) syncCardQuantities(els.results, entries);
  if (!keepStatus) setStatus("New deck ready.");
}

function handleClearDeck() {
  if (entries.size === 0) {
    resetDeck();
    return;
  }
  if (clearArmed) {
    window.clearTimeout(clearArmTimer);
    clearArmed = false;
    els.newDeck.classList.remove("confirming");
    els.newDeck.textContent = "Clear deck";
    resetDeck();
    return;
  }
  clearArmed = true;
  els.newDeck.classList.add("confirming");
  els.newDeck.textContent = "Confirm";
  clearArmTimer = window.setTimeout(() => {
    clearArmed = false;
    els.newDeck.classList.remove("confirming");
    els.newDeck.textContent = "Clear deck";
  }, 2400);
}

function saveCurrentDeck() {
  const name = els.name.value.trim();
  if (!name) {
    showTab("deck");
    setStatus("Give the deck a name before saving.", true);
    els.name.focus();
    return;
  }
  const record = createDeckRecord({
    id: currentDeckId ?? undefined,
    gameId,
    name,
    craft,
    format: gameId === GAME_IDS.SHADOWVERSE_CCG ? "Unlimited" : "Champion's Battle",
    entries,
    source: "shadowbattle-deckbuilder"
  });
  currentDeckId = record.id;
  library = upsertDeck(library, record);
  library = saveDeckLibrary(library);
  renderSavedDecks();
  setStatus(`Saved “${record.name}” locally.`);
}

function loadSavedDeck(deck) {
  if (!EDITABLE_GAMES.includes(deck.gameId)) {
    showTab("import");
    setStatus(`“${deck.name}” is stored for Worlds Beyond and remains isolated under svwb.`, false);
    return;
  }
  switchGame(deck.gameId, { reset: false }).then(() => {
    currentDeckId = deck.id;
    els.name.value = deck.name;
    craft = CRAFTS[deck.gameId].includes(deck.craft) ? deck.craft : CRAFTS[deck.gameId][0];
    entries = new Map(deck.entries);
    els.craft.value = craft;
    syncCraftButtons();
    applyCraftTheme();
    renderDeck();
    renderResults({ restoreScroll: true });
    showTab("deck");
    setStatus(`Loaded “${deck.name}”.`);
  });
}

function renderSavedDecks() {
  const decks = listDecks(library);
  els.saved.innerHTML = decks.map(deck => `<article class="db-saved-row">
    <div>
      <strong>${escapeHtml(deck.name)}</strong>
      <small>${escapeHtml(GAME_CATALOG[deck.gameId]?.shortName ?? deck.gameId)} · ${escapeHtml(deck.craft ?? "Unknown craft")} · ${deck.entries.reduce((sum, [, q]) => sum + q, 0)} cards</small>
    </div>
    <div class="db-saved-actions">
      <button type="button" data-load-deck="${escapeHtml(deck.id)}">${EDITABLE_GAMES.includes(deck.gameId) ? "Edit" : "Inspect"}</button>
      <button type="button" data-delete-deck="${escapeHtml(deck.id)}" data-game-id="${escapeHtml(deck.gameId)}">Delete</button>
    </div>
  </article>`).join("") || `<p class="muted">No saved decks yet.</p>`;

  els.saved.querySelectorAll("[data-load-deck]").forEach(button => {
    button.addEventListener("click", () => {
      const deck = listDecks(library).find(item => item.id === button.dataset.loadDeck);
      if (deck) loadSavedDeck(deck);
    });
  });
  els.saved.querySelectorAll("[data-delete-deck]").forEach(button => {
    button.addEventListener("click", () => {
      library = deleteDeck(library, button.dataset.gameId, button.dataset.deleteDeck);
      library = saveDeckLibrary(library);
      if (currentDeckId === button.dataset.deleteDeck) resetDeck();
      renderSavedDecks();
    });
  });
}

function importLocalBeyondDecks() {
  try {
    const workspace = readBeyondDecksLocalWorkspace();
    if (!workspace) {
      setStatus("No Beyond Decks local workspace was found on this browser origin. Use the JSON/file import instead.", true);
      return;
    }
    const imported = importBeyondDecksWorkspace(workspace);
    for (const deck of imported) library = upsertDeck(library, deck, { makeActive: false });
    library = saveDeckLibrary(library);
    renderSavedDecks();
    setStatus(`Imported ${imported.length} Beyond Decks deck${imported.length === 1 ? "" : "s"} from local browser storage.`);
  } catch (error) {
    setStatus(`Unable to import Beyond Decks local data: ${error.message}`, true);
  }
}

async function importBeyondText(text) {
  try {
    const payload = JSON.parse(String(text ?? ""));
    if (payload?.games && payload?.schemaVersion) throw new Error("This looks like a ShadowBattle library, not a Beyond Decks deck export");
    const deck = importBeyondDeckExport(payload, { name: payload.name ?? `Beyond Decks · ${payload.class ?? "Imported"}` });
    library = upsertDeck(library, deck, { makeActive: false });
    library = saveDeckLibrary(library);
    renderSavedDecks();
    setStatus(`Imported “${deck.name}” from Beyond Decks.`);
    els.importText.value = "";
  } catch (error) {
    setStatus(`Import failed: ${error.message}`, true);
  }
}

function exportCurrentDeck() {
  const payload = createDeckRecord({
    id: currentDeckId ?? undefined,
    gameId,
    name: els.name.value.trim() || "Untitled deck",
    craft,
    format: gameId === GAME_IDS.SHADOWVERSE_CCG ? "Unlimited" : "Champion's Battle",
    entries,
    source: "shadowbattle-export"
  });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${payload.name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "shadowbattle-deck"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function showTab(name) {
  document.querySelectorAll("[data-db-tab]").forEach(button => {
    const active = button.dataset.dbTab === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll("[data-db-panel]").forEach(panel => {
    const active = panel.dataset.dbPanel === name;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function openFilters() {
  els.filtersSidebar.classList.add("open");
  els.filtersSidebar.setAttribute("aria-hidden", "false");
  els.filtersToggle.setAttribute("aria-expanded", "true");
  els.filtersBackdrop.hidden = false;
  window.setTimeout(() => els.search.focus(), 60);
}

function closeFilters() {
  els.filtersSidebar.classList.remove("open");
  els.filtersSidebar.setAttribute("aria-hidden", "true");
  els.filtersToggle.setAttribute("aria-expanded", "false");
  els.filtersBackdrop.hidden = true;
}

function setCardSize(value, preset = null) {
  const size = Math.max(86, Math.min(180, Number(value) || 118));
  document.documentElement.style.setProperty("--db-card-width", `${size}px`);
  els.cardSize.value = String(size);
  els.cardSizePresets.forEach(button => {
    const key = button.dataset.cardSizePreset;
    const active = preset
      ? key === preset
      : key !== "fit" && Number(key) === size;
    button.classList.toggle("active", active);
  });
}

function saveClassScroll() {
  if (!els.content || !craft) return;
  localStorage.setItem(`${CLASS_SCROLL_PREFIX}${gameId}:${craft}`, String(els.content.scrollTop || 0));
}

function restoreClassScroll() {
  if (!els.content || !craft) return;
  const top = Number(localStorage.getItem(`${CLASS_SCROLL_PREFIX}${gameId}:${craft}`)) || 0;
  requestAnimationFrame(() => { els.content.scrollTop = top; });
}

function openPreview(cardId, evolved = false) {
  const card = cardMap.get(cardId);
  if (!card) return;
  previewCardId = cardId;
  previewUsesEvolvedArt = Boolean(evolved && hasEvolvedArt(card));
  renderPreview();
  if (!els.preview.open) els.preview.showModal();
}

function setPreviewArt(evolved) {
  const card = cardMap.get(previewCardId);
  if (!card) return;
  previewUsesEvolvedArt = Boolean(evolved && hasEvolvedArt(card));
  renderPreview();
}

function renderPreview() {
  const card = cardMap.get(previewCardId);
  if (!card) return;
  const evolved = previewUsesEvolvedArt && hasEvolvedArt(card);
  const validation = validateDeckEntries(gameId, entries);
  const quantity = entries.get(Number(card.id)) ?? 0;

  els.previewTitle.textContent = card.name;
  els.previewMeta.textContent = `${card.uid ?? `${gameId}:${card.id}`} · ${card.rarity} · ${card.set}`;
  els.previewStats.innerHTML = [
    `${card.cost} PP`,
    card.craft,
    card.type,
    card.trait || null,
    card.type === "Follower" ? `${evolved ? card.evolvedAttack : card.attack}/${evolved ? card.evolvedDefense : card.defense}` : null
  ].filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join("");
  els.previewText.textContent = readableCardText(evolved ? (card.evolvedText || card.text) : card.text) || "No effect text.";
  els.previewNormal.classList.toggle("active", !evolved);
  els.previewEvolved.classList.toggle("active", evolved);
  els.previewEvolved.hidden = !hasEvolvedArt(card);
  els.previewAdd.disabled = quantity >= 3 || validation.total >= 40;
  els.previewAdd.textContent = quantity >= 3 ? "3/3 copies in deck" : `Add to deck${quantity ? ` (${quantity}/3)` : ""}`;
  setImageArt(els.previewImage, card, evolved);
}

function toggleTileArt(button) {
  const tile = button.closest(".db-card-tile");
  const image = tile?.querySelector("img[data-card-art]");
  const card = cardMap.get(Number(button.dataset.artToggle));
  if (!image || !card || !hasEvolvedArt(card)) return;
  const showEvolved = image.dataset.artState !== "evolved";
  setImageArt(image, card, showEvolved);
  button.textContent = showEvolved ? "N" : "E";
  button.title = showEvolved ? "Show normal art" : "Show evolved art";
  button.setAttribute("aria-label", button.title);
}

function hasEvolvedArt(card) {
  return Boolean(card && (Number(card.typeId) === 1 || card.type === "Follower") && card.evolvedImage);
}

function cardArtCandidates(card, evolved = false) {
  const id = Number(card.id);
  const stored = evolved ? card.evolvedImage : card.image;
  const storedIsModernOrLocal = typeof stored === "string" && stored && !stored.includes("shadowverse-portal.com/image/card/en/");
  const portalModern = evolved
    ? `https://shadowverse-portal.com/image/card/phase2/sp/common/E/E_${id}.png`
    : `https://shadowverse-portal.com/image/card/phase2/common/C/C_${id}.png`;
  const portalLegacy = evolved
    ? `https://shadowverse-portal.com/image/card/en/E_${id}.png`
    : `https://shadowverse-portal.com/image/card/en/C_${id}.png`;
  return [...new Set([
    storedIsModernOrLocal ? stored : null,
    portalModern,
    !storedIsModernOrLocal ? stored : null,
    portalLegacy
  ].filter(Boolean))];
}

function setImageArt(image, card, evolved = false) {
  const candidates = cardArtCandidates(card, evolved);
  let index = 0;
  image.hidden = false;
  image.dataset.artState = evolved ? "evolved" : "normal";
  image.parentElement?.classList.remove("art-missing");
  image.onerror = () => {
    index += 1;
    if (index < candidates.length) {
      image.src = candidates[index];
      return;
    }
    image.onerror = null;
    image.hidden = true;
    image.parentElement?.classList.add("art-missing");
  };
  if (candidates[0]) image.src = candidates[0];
}

function setStatus(message, error = false) {
  window.clearTimeout(statusTimer);
  els.status.textContent = message;
  els.status.dataset.error = error ? "true" : "false";
  els.status.dataset.visible = "true";
  statusTimer = window.setTimeout(() => {
    els.status.dataset.visible = "false";
  }, error ? 5000 : 2600);
}

function readableCardText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
