import { loadDeckCatalog } from "./catalog.js";
import { deleteDeck, listDecks, loadDeckLibrary, saveDeckLibrary } from "./storage.js";
import { importBeyondDecksWorkspace, readBeyondDecksLocalWorkspace } from "./import-beyond-decks.js";
import { worldsBeyondProvider } from "../data/providers/worlds-beyond.js";

const GAMES = ["shadowverse-ccg", "champions-battle", "worlds-beyond"];
const GAME_LABELS = Object.freeze({
  "shadowverse-ccg": "SV1",
  "champions-battle": "CB",
  "worlds-beyond": "WB"
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
  Abysscraft: "201,84,166",
  Havencraft: "219,201,131",
  Portalcraft: "69,206,215"
});
const VIAL_COSTS_BY_GAME = Object.freeze({
  "shadowverse-ccg": Object.freeze({ Bronze: 50, Silver: 200, Gold: 800, Legendary: 3500 }),
  "champions-battle": Object.freeze({ Bronze: 50, Silver: 200, Gold: 800, Legendary: 3500 }),
  "worlds-beyond": Object.freeze({ Bronze: 50, Silver: 90, Gold: 750, Legendary: 3500 })
});
const VIAL_COST_FIELDS = Object.freeze(["vialCost", "craftVials", "createCost", "craftCost"]);
const CLASS_ASSET = "https://shadowverse-portal.com/public/assets/image/cards/en/classes";
const WB_CLASS_ASSETS = Object.freeze({
  Forestcraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_elf.svg",
  Swordcraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_royal.svg",
  Runecraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_witch.svg",
  Dragoncraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_dragon.svg",
  Abysscraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_nightmare.svg",
  Havencraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_bishop.svg",
  Portalcraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_nemesis.svg",
  Neutral: "https://shadowverse-wb.com/assets/images/common/common/class/class_neutral.svg"
});
const BEYOND_DECKS_URL = "https://somostve.github.io/beyond_decks/";
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" });
const VIAL_FORMATTER = new Intl.NumberFormat("en-US");

const els = {
  game: document.getElementById("library-game-filter"),
  search: document.getElementById("library-search"),
  craft: document.getElementById("library-craft"),
  legendary: document.getElementById("library-legendary-max"),
  vials: document.getElementById("library-vial-max"),
  sort: document.getElementById("library-sort"),
  reset: document.getElementById("library-reset"),
  grid: document.getElementById("library-grid"),
  empty: document.getElementById("library-empty"),
  count: document.getElementById("library-match-count")
};

let library = loadDeckLibrary();
let gameFilter = "all";
const catalogMaps = new Map();
let beyondDecks = [];
let cpuDecks = [];
let models = [];
let renderFrame = 0;

init();

async function init() {
  bindEvents();
  await Promise.all(GAMES.map(loadGameCatalog));
  await loadWorldsBeyondDeckSources();
  rebuildModels();
  renderCraftFilter();
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

  els.search.addEventListener("input", scheduleRender);
  for (const control of [els.craft, els.legendary, els.vials, els.sort]) {
    control.addEventListener("change", render);
  }

  els.reset.addEventListener("click", resetFilters);

  document.querySelector(".lib-events")?.addEventListener("click", event => {
    const button = event.target.closest("[data-preset]");
    if (!button) return;
    resetFilters(false);
    if (button.dataset.preset === "no-legendary") els.legendary.value = "0";
    if (button.dataset.preset === "six-legendary") els.legendary.value = "6";
    if (button.dataset.preset === "budget-20k") els.vials.value = "20000";
    if (button.dataset.preset === "budget-40k") els.vials.value = "40000";
    render();
  });

  els.grid.addEventListener("error", event => {
    const image = event.target;
    if (!image?.matches?.("img[data-library-art]")) return;
    advanceLibraryImageArt(image);
  }, true);

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
    renderCraftFilter();
    render();
  });
}

function scheduleRender() {
  if (renderFrame) return;
  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = 0;
    render();
  });
}

async function loadGameCatalog(gameId) {
  try {
    const cards = gameId === "worlds-beyond"
      ? await worldsBeyondProvider.loadCards()
      : (await loadDeckCatalog(gameId)).cards ?? [];

    catalogMaps.set(gameId, new Map(cards.map(card => {
      const normalized = normalizeLibraryCard(card, gameId);
      return [normalized.id, normalized];
    })));
  } catch {
    catalogMaps.set(gameId, new Map());
  }
}

function normalizeLibraryCard(card, gameId) {
  return {
    ...card,
    id: Number(card.id),
    craft: card.craft ?? card.class ?? "Neutral",
    image: card.image ?? card.imageUrl ?? card.art ?? card.cardImage ?? null,
    gameId
  };
}

async function loadWorldsBeyondDeckSources() {
  beyondDecks = readBeyondDecksSavedDecks();
  cpuDecks = await readCpuReferenceDecks();
}

function readBeyondDecksSavedDecks() {
  try {
    const workspace = readBeyondDecksLocalWorkspace();
    if (!workspace) return [];
    return importBeyondDecksWorkspace(workspace, { includeCurrent: false }).map((deck, index) => ({
      ...deck,
      id: `beyond-live:${index}:${slug(deck.name)}`,
      origin: "beyond-decks"
    }));
  } catch {
    return [];
  }
}

async function readCpuReferenceDecks() {
  try {
    const response = await fetch("../api/v1/worlds-beyond/bot-decks.json", { cache: "force-cache" });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.decks ?? []).map(deck => {
      const entries = [];
      const embeddedCards = [];
      for (const card of deck.cards ?? []) {
        const id = Number(card.cardId);
        entries.push([id, Number(card.qty) || 0]);
        embeddedCards.push(normalizeLibraryCard({ ...card, id, craft: deck.class }, "worlds-beyond"));
      }

      return {
        schemaVersion: 1,
        id: `cpu:${deck.id}`,
        gameId: "worlds-beyond",
        name: deck.name,
        craft: deck.class ?? null,
        format: deck.format ?? "Unlimited",
        entries,
        embeddedCards,
        source: "shadowbattle-cpu-reference",
        sourceUrl: deck.sourceUrl ?? null,
        savedAt: payload.generatedAt ?? new Date(0).toISOString(),
        origin: "cpu"
      };
    });
  } catch {
    return [];
  }
}

function rebuildModels() {
  const localDecks = listDecks(library).filter(deck => GAMES.includes(deck.gameId));
  const localWbSignatures = new Set(localDecks.filter(deck => deck.gameId === "worlds-beyond").map(deckSignature));
  const liveBeyondDecks = beyondDecks.filter(deck => !localWbSignatures.has(deckSignature(deck)));

  models = [
    ...localDecks.map(deck => buildModel(deck, "local")),
    ...liveBeyondDecks.map(deck => buildModel(deck, "beyond-decks")),
    ...cpuDecks.map(deck => buildModel(deck, "cpu"))
  ];
}

function buildModel(deck, origin = "local") {
  const map = catalogMaps.get(deck.gameId) ?? new Map();
  const embedded = new Map((deck.embeddedCards ?? []).map(card => [Number(card.id), card]));
  let size = 0;
  let legendary = 0;
  let vialCost = 0;
  let uniqueCardCount = 0;
  const thumbs = [];

  for (const [id, rawQuantity] of deck.entries ?? []) {
    const quantity = Number(rawQuantity) || 0;
    if (!quantity) continue;
    const cardId = Number(id);
    const card = map.get(cardId) ?? embedded.get(cardId);
    size += quantity;
    if (card?.rarity === "Legendary") legendary += quantity;
    if (!card) continue;

    vialCost += getVialCost(card, deck.gameId) * quantity;
    uniqueCardCount += 1;
    if (thumbs.length < 5) thumbs.push(card);
  }

  const name = String(deck.name ?? "");
  return {
    deck,
    origin,
    size,
    legendary,
    vialCost,
    thumbs,
    extraCardCount: Math.max(0, uniqueCardCount - thumbs.length),
    searchName: name.toLowerCase(),
    sortName: name,
    savedAtKey: String(deck.savedAt ?? "")
  };
}

function getVialCost(card, gameId) {
  if (!card) return 0;
  for (const field of VIAL_COST_FIELDS) {
    const value = Number(card[field]);
    if (Number.isFinite(value) && value >= 0) return value;
  }

  if (String(card.set ?? "").trim().toLowerCase() === "basic" || Number(card.setId) === 10000 || card.deckSelectable === false) return 0;
  return VIAL_COSTS_BY_GAME[gameId]?.[card.rarity] ?? 0;
}

function render() {
  if (renderFrame) {
    window.cancelAnimationFrame(renderFrame);
    renderFrame = 0;
  }

  const needle = els.search.value.trim().toLowerCase();
  const craft = els.craft.value;
  const legendaryMax = numberOrNull(els.legendary.value);
  const vialMax = numberOrNull(els.vials.value);

  const filtered = models.filter(model => {
    if (gameFilter !== "all" && model.deck.gameId !== gameFilter) return false;
    if (craft !== "all" && model.deck.craft !== craft) return false;
    if (needle && !model.searchName.includes(needle)) return false;
    if (legendaryMax != null && model.legendary > legendaryMax) return false;
    if (vialMax != null && model.vialCost > vialMax) return false;
    return true;
  });

  filtered.sort(modelComparator(els.sort.value));
  els.count.textContent = String(filtered.length);
  els.empty.hidden = filtered.length !== 0;
  els.grid.innerHTML = filtered.map(renderDeckCard).join("");
}

function renderDeckCard(model) {
  const { deck, origin, size, vialCost, legendary, thumbs, extraCardCount } = model;
  const craft = deck.craft || "Unknown";
  const icon = classIconFor(deck.gameId, craft);
  const rgb = CRAFT_RGB[craft] ?? "114,184,255";
  const saved = origin === "cpu" ? "CPU reference" : origin === "beyond-decks" ? "Beyond Decks" : formatDate(deck.savedAt);

  return `<article class="lib-deck-card" style="--craft-rgb:${rgb}">
    <div class="lib-deck-head">
      ${icon ? `<img class="lib-class-icon" src="${escapeAttr(icon)}" alt="" referrerpolicy="no-referrer">` : `<span class="lib-class-icon"></span>`}
      <div class="lib-deck-title">
        <h2>${escapeHtml(deck.name)}</h2>
        <small>${escapeHtml(craft)} · ${escapeHtml(saved)}</small>
      </div>
      <span class="lib-game-badge">${escapeHtml(GAME_LABELS[deck.gameId] ?? deck.gameId)}</span>
    </div>

    <div class="lib-metrics">
      <div class="lib-metric"><span>Cards</span><strong>${size}/40</strong></div>
      <div class="lib-metric"><span>Legendary</span><strong>${legendary}</strong></div>
      <div class="lib-metric lib-metric-vials"><span>Vial cost</span><strong>${formatVials(vialCost)}</strong></div>
    </div>

    <div class="lib-thumbs" aria-label="Deck card artwork">
      ${thumbs.map(card => renderCardThumb(card, deck.gameId)).join("")}
      ${extraCardCount ? `<span class="lib-more">+${extraCardCount}</span>` : ""}
    </div>

    <div class="lib-deck-actions">
      ${renderDeckActions(model)}
    </div>
  </article>`;
}

function renderCardThumb(card, gameId) {
  const firstSource = cardArtCandidates(card, gameId)[0];
  const src = firstSource ? ` src="${escapeAttr(firstSource)}"` : "";
  return `<img data-library-art="${card.id}" data-library-game="${escapeAttr(gameId)}" data-library-art-index="0"${src} alt="${escapeAttr(card.name)}" title="${escapeAttr(card.name)}" loading="lazy" referrerpolicy="no-referrer">`;
}

function renderDeckActions(model) {
  const { deck, origin } = model;
  if (origin === "cpu") {
    return deck.sourceUrl
      ? `<a href="${escapeAttr(deck.sourceUrl)}" target="_blank" rel="noopener">View official deck</a>`
      : `<a href="${BEYOND_DECKS_URL}" target="_blank" rel="noopener">Open Beyond Decks</a>`;
  }

  if (origin === "beyond-decks") {
    return `<a href="${BEYOND_DECKS_URL}" target="_blank" rel="noopener">Open in Beyond Decks</a>`;
  }

  const open = deck.gameId === "worlds-beyond"
    ? `<a href="${BEYOND_DECKS_URL}" target="_blank" rel="noopener">Open in Beyond Decks</a>`
    : `<a href="../decks/?game=${encodeURIComponent(deck.gameId)}&deck=${encodeURIComponent(deck.id)}">Open in deckbuilder</a>`;

  return `${open}<button type="button" data-delete-deck="${escapeAttr(deck.id)}" data-game-id="${escapeAttr(deck.gameId)}">Delete</button>`;
}

function advanceLibraryImageArt(image) {
  const gameId = image.dataset.libraryGame;
  const card = catalogMaps.get(gameId)?.get(Number(image.dataset.libraryArt));
  if (!card) return markLibraryArtMissing(image);

  const candidates = cardArtCandidates(card, gameId);
  const nextIndex = (Number(image.dataset.libraryArtIndex) || 0) + 1;
  if (nextIndex < candidates.length) {
    image.dataset.libraryArtIndex = String(nextIndex);
    image.src = candidates[nextIndex];
    return;
  }
  markLibraryArtMissing(image);
}

function markLibraryArtMissing(image) {
  image.removeAttribute("src");
  image.classList.add("art-missing");
}

function cardArtCandidates(card, gameId) {
  const stored = [card.image, card.imageUrl, card.art, card.cardImage, card.thumbnail]
    .map(value => normalizeAssetUrl(value, gameId))
    .filter(Boolean);

  if (gameId === "worlds-beyond") return [...new Set(stored)];

  const id = Number(card.id);
  const portalModern = `https://shadowverse-portal.com/image/card/phase2/common/C/C_${id}.png`;
  const portalLegacy = `https://shadowverse-portal.com/image/card/en/C_${id}.png`;
  return [...new Set([...stored, portalModern, portalLegacy])];
}

function normalizeAssetUrl(value, gameId) {
  if (typeof value !== "string" || !value.trim()) return null;
  const src = value.trim();
  if (/^(?:https?:|data:|blob:)/i.test(src)) return src;
  if (gameId === "worlds-beyond" && src.startsWith("/")) return `https://shadowverse-wb.com${src}`;
  try {
    return new URL(src, gameId === "worlds-beyond" ? "https://somostve.github.io/beyond_codex/api/v1/" : location.href).href;
  } catch {
    return null;
  }
}

function classIconFor(gameId, craft) {
  if (gameId === "worlds-beyond") return WB_CLASS_ASSETS[craft] ?? "";
  const classId = CRAFT_IDS[craft];
  return Number.isFinite(classId) ? `${CLASS_ASSET}/${classId}/class_checkbox.png` : "";
}

function renderCraftFilter() {
  const current = els.craft.value || "all";
  const crafts = [...new Set(models.map(model => model.deck.craft).filter(Boolean))];
  const defaults = ["Forestcraft", "Swordcraft", "Runecraft", "Dragoncraft", "Shadowcraft", "Bloodcraft", "Abysscraft", "Havencraft", "Portalcraft"];
  const values = [...new Set([...defaults, ...crafts])];
  els.craft.innerHTML = `<option value="all">All classes</option>${values.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join("")}`;
  els.craft.value = values.includes(current) ? current : "all";
}

function resetFilters(renderAfter = true) {
  gameFilter = "all";
  els.game.querySelectorAll("[data-game]").forEach(button => button.classList.toggle("active", button.dataset.game === "all"));
  els.search.value = "";
  els.craft.value = "all";
  els.legendary.value = "all";
  els.vials.value = "all";
  els.sort.value = "saved";
  if (renderAfter) render();
}

function modelComparator(sort) {
  if (sort === "name") return (a, b) => a.sortName.localeCompare(b.sortName);
  if (sort === "legendary") return (a, b) => b.legendary - a.legendary || a.sortName.localeCompare(b.sortName);
  if (sort === "vials") return (a, b) => a.vialCost - b.vialCost || a.sortName.localeCompare(b.sortName);
  return (a, b) => b.savedAtKey.localeCompare(a.savedAtKey);
}

function deckSignature(deck) {
  const entries = [...(deck.entries ?? [])]
    .map(([id, quantity]) => [Number(id), Number(quantity)])
    .filter(([id, quantity]) => Number.isFinite(id) && Number.isFinite(quantity) && quantity > 0)
    .sort((a, b) => a[0] - b[0]);
  return JSON.stringify([deck.gameId, deck.craft ?? null, entries]);
}

function slug(value) {
  return String(value ?? "deck").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck";
}

function numberOrNull(value) {
  if (value === "all") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatVials(value) {
  return VIAL_FORMATTER.format(Number(value || 0));
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved locally";
  return DATE_FORMATTER.format(date);
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
