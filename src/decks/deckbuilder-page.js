import { GAME_IDS, GAME_CATALOG } from "../core/game-catalog.js";
import { loadDeckCatalog, filterCatalog } from "./catalog.js";
import { canAddCard, validateDeckEntries } from "./deck-rules.js";
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

const els = {
  game: document.getElementById("deck-game"),
  craft: document.getElementById("deck-craft"),
  name: document.getElementById("deck-name"),
  search: document.getElementById("deck-search"),
  set: document.getElementById("deck-set"),
  results: document.getElementById("deck-results"),
  resultCount: document.getElementById("deck-result-count"),
  deck: document.getElementById("current-deck"),
  deckCount: document.getElementById("current-deck-count"),
  legality: document.getElementById("deck-legality"),
  saved: document.getElementById("saved-decks"),
  status: document.getElementById("deck-status"),
  save: document.getElementById("save-deck"),
  newDeck: document.getElementById("new-deck"),
  exportDeck: document.getElementById("export-shadowbattle-deck"),
  importLocal: document.getElementById("import-beyond-local"),
  importText: document.getElementById("beyond-import-json"),
  importJson: document.getElementById("import-beyond-json"),
  importFile: document.getElementById("import-beyond-file"),
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
let entries = new Map();
let currentDeckId = null;
let currentSet = "all";
let previewCardId = null;
let previewUsesEvolvedArt = false;

init();

async function init() {
  bindEvents();
  renderSavedDecks();
  await switchGame(gameId, { reset: true });
}

function bindEvents() {
  els.game.addEventListener("change", () => switchGame(els.game.value, { reset: true }));
  els.craft.addEventListener("change", () => {
    const nextCraft = els.craft.value;
    const incompatible = [...entries.keys()].some(id => {
      const cardCraft = cardMap.get(id)?.craft;
      return cardCraft && cardCraft !== "Neutral" && cardCraft !== nextCraft;
    });
    if (incompatible) {
      els.craft.value = craft;
      setStatus("Remove cards from the current craft before changing craft.", true);
      return;
    }
    craft = nextCraft;
    renderResults();
  });
  els.search.addEventListener("input", renderResults);
  els.set.addEventListener("change", () => {
    currentSet = els.set.value;
    renderResults();
  });
  els.save.addEventListener("click", saveCurrentDeck);
  els.newDeck.addEventListener("click", () => resetDeck());
  els.exportDeck.addEventListener("click", exportCurrentDeck);
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
  gameId = nextGameId;
  document.body.dataset.game = gameId;
  els.game.value = gameId;
  setStatus(`Loading ${GAME_CATALOG[gameId].shortName} catalog…`);
  try {
    const payload = await loadDeckCatalog(gameId);
    catalog = payload.cards;
    cardMap = new Map(catalog.map(card => [Number(card.id), card]));
    renderCrafts();
    renderSets();
    if (reset) resetDeck({ keepStatus: true });
    renderResults();
    setStatus(`${catalog.length.toLocaleString()} local deckbuilding cards loaded.`);
  } catch (error) {
    catalog = [];
    cardMap = new Map();
    renderResults();
    setStatus(error.message, true);
  }
}

function renderCrafts() {
  const available = CRAFTS[gameId] ?? [];
  if (!available.includes(craft)) craft = available[0];
  els.craft.innerHTML = available.map(value => `<option value="${value}">${value}</option>`).join("");
  els.craft.value = craft;
}

function renderSets() {
  const sets = [...new Map(catalog.map(card => [String(card.setId), card.set])).entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  els.set.innerHTML = `<option value="all">All sets</option>${sets.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("")}`;
  currentSet = "all";
}

function renderResults() {
  const filtered = filterCatalog(catalog, {
    query: els.search.value,
    craft,
    set: currentSet
  });
  els.resultCount.textContent = `${filtered.length.toLocaleString()} cards`;
  const visible = filtered.slice(0, 240);
  els.results.innerHTML = visible.map(card => {
    const current = entries.get(Number(card.id)) ?? 0;
    const evolvedControl = hasEvolvedArt(card)
      ? `<button class="db-card-control" type="button" data-art-toggle="${card.id}" title="Show evolved art" aria-label="Show evolved art">E</button>`
      : "";
    return `<article class="db-card-tile${current >= 3 ? " is-capped" : ""}" data-card-id="${card.id}">
      <button class="db-card-main" type="button" data-add="${card.id}" title="${escapeHtml(card.name)} — click to add" aria-label="Add ${escapeHtml(card.name)} to deck">
        <img loading="lazy" data-card-art="${card.id}" data-art-state="normal" alt="${escapeHtml(card.name)}" referrerpolicy="no-referrer">
      </button>
      <span class="db-card-cost">${card.cost}</span>
      ${current ? `<span class="db-card-quantity">×${current}</span>` : ""}
      <div class="db-card-control-row">
        <button class="db-card-control" type="button" data-preview="${card.id}" title="Inspect card" aria-label="Inspect ${escapeHtml(card.name)}">⤢</button>
        ${evolvedControl}
      </div>
    </article>`;
  }).join("") || `<p class="muted">No cards match these filters.</p>`;

  els.results.querySelectorAll("img[data-card-art]").forEach(image => {
    const card = cardMap.get(Number(image.dataset.cardArt));
    if (card) setImageArt(image, card, false);
  });
  els.results.querySelectorAll("[data-add]").forEach(button => {
    button.addEventListener("click", () => addCard(Number(button.dataset.add)));
  });
  els.results.querySelectorAll("[data-preview]").forEach(button => {
    button.addEventListener("click", () => openPreview(Number(button.dataset.preview)));
  });
  els.results.querySelectorAll("[data-art-toggle]").forEach(button => {
    button.addEventListener("click", () => toggleTileArt(button));
  });
}

function addCard(cardId) {
  const card = cardMap.get(cardId);
  if (!card) return;
  if (card.craft !== craft && card.craft !== "Neutral") return;
  if (!canAddCard(gameId, entries, cardId, 1)) {
    setStatus("Deck limit reached: 40 cards total, maximum 3 copies per card.", true);
    return;
  }
  entries.set(cardId, (entries.get(cardId) ?? 0) + 1);
  renderDeck();
  renderResults();
}

function removeCard(cardId, amount = 1) {
  const current = entries.get(cardId) ?? 0;
  const next = current - amount;
  if (next <= 0) entries.delete(cardId);
  else entries.set(cardId, next);
  renderDeck();
  renderResults();
}

function renderDeck() {
  const validation = validateDeckEntries(gameId, entries);
  els.deckCount.textContent = `${validation.total}/40`;
  els.legality.textContent = validation.legal
    ? "Legal 40-card deck"
    : validation.withinSizeLimit
      ? `${40 - validation.total} cards remaining`
      : "Deck is over the limit";
  els.legality.dataset.legal = validation.legal ? "true" : "false";

  const rows = [...entries.entries()]
    .map(([id, quantity]) => ({ card: cardMap.get(id), id, quantity }))
    .sort((a, b) => (a.card?.cost ?? 99) - (b.card?.cost ?? 99) || String(a.card?.name).localeCompare(String(b.card?.name)));

  els.deck.innerHTML = rows.map(({ card, id, quantity }) => `<div class="db-deck-row">
    ${card ? `<img data-deck-art="${id}" alt="" referrerpolicy="no-referrer" title="Inspect ${escapeHtml(card.name)}">` : `<span class="db-deck-art-placeholder">?</span>`}
    <div class="db-deck-row-copy">
      <strong>${escapeHtml(card?.name ?? `Card ${id}`)}</strong>
      <small>${card ? `${card.cost} PP · ${escapeHtml(card.type)} · ${escapeHtml(card.set)}` : escapeHtml(gameId)}</small>
    </div>
    <div class="db-deck-controls">
      <button type="button" data-minus="${id}" aria-label="Remove one">−</button>
      <span>×${quantity}</span>
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

function resetDeck({ keepStatus = false } = {}) {
  entries = new Map();
  currentDeckId = null;
  els.name.value = "";
  renderDeck();
  renderResults();
  if (!keepStatus) setStatus("New deck ready.");
}

function saveCurrentDeck() {
  const name = els.name.value.trim();
  if (!name) {
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
    setStatus(`“${deck.name}” is stored for Worlds Beyond and can be used by the future battle session, but this editor currently targets OG and Champion's Battle.`, false);
    return;
  }
  switchGame(deck.gameId, { reset: false }).then(() => {
    currentDeckId = deck.id;
    els.name.value = deck.name;
    craft = CRAFTS[deck.gameId].includes(deck.craft) ? deck.craft : CRAFTS[deck.gameId][0];
    els.craft.value = craft;
    entries = new Map(deck.entries);
    renderDeck();
    renderResults();
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
  els.status.textContent = message;
  els.status.dataset.error = error ? "true" : "false";
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
