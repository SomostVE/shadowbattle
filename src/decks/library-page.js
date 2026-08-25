import { loadDeckCatalog } from "./catalog.js";
import { deleteDeck, listDecks, loadDeckLibrary, saveDeckLibrary } from "./storage.js";

const GAMES = ["shadowverse-ccg", "champions-battle"];
const GAME_LABELS = Object.freeze({
  "shadowverse-ccg": "SV1",
  "champions-battle": "CB"
});
const CRAFT_IDS = Object.freeze({
  Neutral: 0,
  Forestcraft: 1,
  Swordcraft: 2,
  Runecraft: 3,
  Dragoncraft: 4,
  Shadowcraft: 5,
  Bloodcraft: 6,
  Havencraft: 7,
  Portalcraft: 8
});
const CRAFT_RGB = Object.freeze({
  Forestcraft: "105,215,123",
  Swordcraft: "225,196,79",
  Runecraft: "143,148,255",
  Dragoncraft: "243,154,75",
  Shadowcraft: "188,97,216",
  Bloodcraft: "223,91,131",
  Havencraft: "219,201,131",
  Portalcraft: "69,206,215"
});
const CLASS_ASSET = "https://shadowverse-portal.com/public/assets/image/cards/en/classes";

const els = {
  game: document.getElementById("library-game-filter"),
  search: document.getElementById("library-search"),
  craft: document.getElementById("library-craft"),
  legendary: document.getElementById("library-legendary-max"),
  average: document.getElementById("library-average-max"),
  total: document.getElementById("library-total-max"),
  sort: document.getElementById("library-sort"),
  reset: document.getElementById("library-reset"),
  grid: document.getElementById("library-grid"),
  empty: document.getElementById("library-empty"),
  count: document.getElementById("library-match-count")
};

let library = loadDeckLibrary();
let gameFilter = "all";
let catalogMaps = new Map();
let models = [];

init();

async function init() {
  bindEvents();
  await Promise.all(GAMES.map(loadGameCatalog));
  renderCraftFilter();
  rebuildModels();
  render();
}

function bindEvents() {
  els.game.addEventListener("click", event => {
    const button = event.target.closest("[data-game]");
    if (!button) return;
    gameFilter = button.dataset.game;
    els.game.querySelectorAll("[data-game]").forEach(node => node.classList.toggle("active", node === button));
    render();
  });

  for (const control of [els.search, els.craft, els.legendary, els.average, els.total, els.sort]) {
    control.addEventListener(control === els.search ? "input" : "change", render);
  }

  els.reset.addEventListener("click", resetFilters);

  document.querySelector(".lib-events")?.addEventListener("click", event => {
    const button = event.target.closest("[data-preset]");
    if (!button) return;
    resetFilters(false);
    if (button.dataset.preset === "no-legendary") els.legendary.value = "0";
    if (button.dataset.preset === "six-legendary") els.legendary.value = "6";
    if (button.dataset.preset === "low-curve") els.average.value = "3";
    if (button.dataset.preset === "cheap-total") els.total.value = "100";
    render();
  });

  els.grid.addEventListener("click", event => {
    const remove = event.target.closest("[data-delete-deck]");
    if (!remove) return;
    const gameId = remove.dataset.gameId;
    const deckId = remove.dataset.deleteDeck;
    if (remove.dataset.confirm !== "true") {
      remove.dataset.confirm = "true";
      remove.textContent = "Confirm";
      window.setTimeout(() => {
        if (!remove.isConnected) return;
        remove.dataset.confirm = "false";
        remove.textContent = "Delete";
      }, 2200);
      return;
    }
    library = deleteDeck(library, gameId, deckId);
    library = saveDeckLibrary(library);
    rebuildModels();
    render();
  });
}

async function loadGameCatalog(gameId) {
  try {
    const payload = await loadDeckCatalog(gameId);
    catalogMaps.set(gameId, new Map((payload.cards ?? []).map(card => [Number(card.id), card])));
  } catch {
    catalogMaps.set(gameId, new Map());
  }
}

function rebuildModels() {
  models = listDecks(library)
    .filter(deck => GAMES.includes(deck.gameId))
    .map(deck => buildModel(deck));
}

function buildModel(deck) {
  const map = catalogMaps.get(deck.gameId) ?? new Map();
  const cards = (deck.entries ?? []).map(([id, quantity]) => ({ card: map.get(Number(id)), quantity: Number(quantity) || 0 }));
  let size = 0;
  let totalCost = 0;
  let legendary = 0;
  const uniqueCards = [];

  for (const { card, quantity } of cards) {
    if (!quantity) continue;
    size += quantity;
    totalCost += (Number(card?.cost) || 0) * quantity;
    if (card?.rarity === "Legendary") legendary += quantity;
    if (card) uniqueCards.push(card);
  }

  return {
    deck,
    size,
    totalCost,
    averageCost: size ? totalCost / size : 0,
    legendary,
    uniqueCards
  };
}

function render() {
  const needle = els.search.value.trim().toLowerCase();
  const craft = els.craft.value;
  const legendaryMax = numberOrNull(els.legendary.value);
  const averageMax = numberOrNull(els.average.value);
  const totalMax = numberOrNull(els.total.value);

  let filtered = models.filter(model => {
    if (gameFilter !== "all" && model.deck.gameId !== gameFilter) return false;
    if (craft !== "all" && model.deck.craft !== craft) return false;
    if (needle && !String(model.deck.name).toLowerCase().includes(needle)) return false;
    if (legendaryMax != null && model.legendary > legendaryMax) return false;
    if (averageMax != null && model.averageCost > averageMax) return false;
    if (totalMax != null && model.totalCost > totalMax) return false;
    return true;
  });

  filtered = filtered.sort(modelComparator(els.sort.value));
  els.count.textContent = String(filtered.length);
  els.empty.hidden = filtered.length !== 0;
  els.grid.innerHTML = filtered.map(renderDeckCard).join("");
}

function renderDeckCard(model) {
  const { deck, size, totalCost, averageCost, legendary, uniqueCards } = model;
  const craft = deck.craft || "Unknown";
  const classId = CRAFT_IDS[craft];
  const icon = Number.isFinite(classId) ? `${CLASS_ASSET}/${classId}/class_checkbox.png` : "";
  const rgb = CRAFT_RGB[craft] ?? "114,184,255";
  const thumbs = uniqueCards.slice(0, 6);
  const extra = Math.max(0, uniqueCards.length - thumbs.length);
  const saved = formatDate(deck.savedAt);

  return `<article class="lib-deck-card" style="--craft-rgb:${rgb}">
    <div class="lib-deck-head">
      ${icon ? `<img class="lib-class-icon" src="${escapeAttr(icon)}" alt="" referrerpolicy="no-referrer">` : `<span class="lib-class-icon"></span>`}
      <div class="lib-deck-title">
        <h2>${escapeHtml(deck.name)}</h2>
        <small>${escapeHtml(craft)} · ${saved}</small>
      </div>
      <span class="lib-game-badge">${escapeHtml(GAME_LABELS[deck.gameId] ?? deck.gameId)}</span>
    </div>

    <div class="lib-metrics">
      <div class="lib-metric"><span>Cards</span><strong>${size}/40</strong></div>
      <div class="lib-metric"><span>Legendary</span><strong>${legendary}</strong></div>
      <div class="lib-metric"><span>Average PP</span><strong>${averageCost.toFixed(2)}</strong></div>
      <div class="lib-metric"><span>Total PP</span><strong>${totalCost}</strong></div>
    </div>

    <div class="lib-thumbs">
      ${thumbs.map(card => `<img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}" title="${escapeAttr(card.name)}" loading="lazy" referrerpolicy="no-referrer">`).join("")}
      ${extra ? `<span class="lib-more">+${extra}</span>` : ""}
    </div>

    <div class="lib-deck-actions">
      <a href="../decks/?game=${encodeURIComponent(deck.gameId)}&deck=${encodeURIComponent(deck.id)}">Open in deckbuilder</a>
      <button type="button" data-delete-deck="${escapeAttr(deck.id)}" data-game-id="${escapeAttr(deck.gameId)}">Delete</button>
    </div>
  </article>`;
}

function renderCraftFilter() {
  const crafts = [...new Set(models.map(model => model.deck.craft).filter(Boolean))];
  const defaults = ["Forestcraft", "Swordcraft", "Runecraft", "Dragoncraft", "Shadowcraft", "Bloodcraft", "Havencraft", "Portalcraft"];
  const values = [...new Set([...defaults, ...crafts])];
  els.craft.innerHTML = `<option value="all">All classes</option>${values.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join("")}`;
}

function resetFilters(renderAfter = true) {
  gameFilter = "all";
  els.game.querySelectorAll("[data-game]").forEach(button => button.classList.toggle("active", button.dataset.game === "all"));
  els.search.value = "";
  els.craft.value = "all";
  els.legendary.value = "all";
  els.average.value = "all";
  els.total.value = "all";
  els.sort.value = "saved";
  if (renderAfter) render();
}

function modelComparator(sort) {
  if (sort === "name") return (a, b) => String(a.deck.name).localeCompare(String(b.deck.name));
  if (sort === "legendary") return (a, b) => b.legendary - a.legendary || String(a.deck.name).localeCompare(String(b.deck.name));
  if (sort === "average") return (a, b) => a.averageCost - b.averageCost || String(a.deck.name).localeCompare(String(b.deck.name));
  if (sort === "total") return (a, b) => a.totalCost - b.totalCost || String(a.deck.name).localeCompare(String(b.deck.name));
  return (a, b) => String(b.deck.savedAt).localeCompare(String(a.deck.savedAt));
}

function numberOrNull(value) {
  if (value === "all") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved locally";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(date);
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
