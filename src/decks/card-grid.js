// Card-grid renderer derived from Beyond Decks' card-first grid pattern.
// ShadowBattle keeps the UI renderer source-agnostic: the caller supplies card
// records and the game-specific art resolver.

const DEFAULT_BATCH_SIZE = 96;
const CARD_POOL_MODE_KEY = "shadowbattle:card-pool-mode";

export function renderCardGrid(root, cards, handlers = {}, options = {}) {
  const poolMode = localStorage.getItem(CARD_POOL_MODE_KEY) === "neutral" ? "neutral" : "class";
  const visibleCards = Array.isArray(cards) ? cards : [];
  const batchSize = Math.max(24, Number(options.batchSize) || DEFAULT_BATCH_SIZE);
  const renderId = String((Number(root.dataset.renderId) || 0) + 1);
  root.dataset.renderId = renderId;
  root.dataset.cardPoolMode = poolMode;
  root.dataset.totalCards = String(visibleCards.length);
  root.replaceChildren();

  if (!visibleCards.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = poolMode === "neutral"
      ? "No Neutral cards match these filters."
      : "No class cards match these filters.";
    root.appendChild(empty);
    return;
  }

  let cursor = 0;

  const appendBatch = limit => {
    if (root.dataset.renderId !== renderId) return false;
    const end = Math.min(visibleCards.length, cursor + limit);
    const template = document.createElement("template");
    const markup = [];
    for (let index = cursor; index < end; index += 1) markup.push(cardMarkup(visibleCards[index], handlers));
    template.innerHTML = markup.join("");

    for (const image of template.content.querySelectorAll("img[data-card-art]")) {
      const card = handlers.getCardById?.(Number(image.dataset.cardArt));
      if (card) handlers.setImageArt?.(image, card, false);
    }
    root.appendChild(template.content);

    cursor = end;
    return cursor < visibleCards.length;
  };

  const hasMore = appendBatch(batchSize);
  if (!hasMore) return;

  const pump = deadline => {
    if (root.dataset.renderId !== renderId) return;
    let keepGoing = true;
    do {
      keepGoing = appendBatch(batchSize);
    } while (keepGoing && deadline?.timeRemaining?.() > 5);

    if (keepGoing) schedule(pump);
  };

  schedule(pump);
}

export function updateCardTile(root, cardId, quantity) {
  const tile = root.querySelector(`.db-card-tile[data-card-id="${CSS.escape(String(cardId))}"]`);
  if (tile) updateTileQuantity(tile, quantity);
}

export function syncCardQuantities(root, entries) {
  for (const tile of root.querySelectorAll(".db-card-tile[data-card-id]")) {
    const id = Number(tile.dataset.cardId);
    updateTileQuantity(tile, entries.get(id) ?? 0);
  }
}

function updateTileQuantity(tile, quantity) {
  tile.classList.toggle("is-capped", Number(quantity) >= 3);
  let badge = tile.querySelector(".db-card-quantity");

  if (quantity > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "db-card-quantity";
      tile.appendChild(badge);
    }
    badge.textContent = `×${quantity}`;
  } else {
    badge?.remove();
  }
}

function cardMarkup(card, handlers) {
  const current = Number(handlers.getQuantity?.(card) ?? 0);
  const evolvedControl = handlers.hasEvolvedArt?.(card)
    ? `<button class="db-card-control" type="button" data-art-toggle="${card.id}" title="Show evolved art" aria-label="Show evolved art">E</button>`
    : "";

  return `<article class="db-card-tile${current >= 3 ? " is-capped" : ""}" data-card-id="${card.id}" data-card-craft="${escapeHtml(card.craft ?? "")}">
    <button class="db-card-main" type="button" data-add="${card.id}" aria-label="Add ${escapeHtml(card.name)} to deck">
      <img loading="lazy" data-card-art="${card.id}" data-art-state="normal" alt="${escapeHtml(card.name)}" referrerpolicy="no-referrer">
    </button>
    ${current ? `<span class="db-card-quantity">×${current}</span>` : ""}
    <div class="db-card-control-row">
      <button class="db-card-control" type="button" data-preview="${card.id}" title="Inspect card" aria-label="Inspect ${escapeHtml(card.name)}">⤢</button>
      ${evolvedControl}
    </div>
  </article>`;
}

function schedule(callback) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(callback, { timeout: 80 });
    return;
  }
  requestAnimationFrame(() => callback({ timeRemaining: () => 8 }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
