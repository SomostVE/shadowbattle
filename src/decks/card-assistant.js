const KEYWORDS = Object.freeze([
  "Super Skybound Art",
  "Skybound Art",
  "Last Words",
  "Burial Rite",
  "Earth Rite",
  "Union Burst",
  "Crystallize",
  "Spellboost",
  "Necromancy",
  "Reanimate",
  "Invocation",
  "Accelerate",
  "Transmute",
  "Countdown",
  "Resonance",
  "Vengeance",
  "Maneuver",
  "Fanfare",
  "Enhance",
  "Overflow",
  "Avarice",
  "Fusion",
  "Choose",
  "Rally",
  "Wrath",
  "Ambush",
  "Storm",
  "Rush",
  "Ward",
  "Bane",
  "Drain",
  "Evolve"
]);

const PREVIEW_DELAY = 550;
const HIDE_DELAY = 500;
const relationCache = new Map();
const nameIndexCache = new Map();
let preview = null;
let hoverTimer = 0;
let hideTimer = 0;
let pinned = false;
let pointer = { x: 0, y: 0 };
let history = [];
let activeInstall = null;

export function cardTraits(card) {
  return String(card?.trait ?? "")
    .split(/\s*[/,|]\s*/)
    .map(value => value.trim())
    .filter(value => value && value !== "-" && value.toLowerCase() !== "none");
}

export function cardKeywords(card) {
  const text = cleanEffect(`${card?.text ?? ""} ${card?.evolvedText ?? ""}`).toLowerCase();
  return KEYWORDS.filter(keyword => text.includes(keyword.toLowerCase()));
}

export function installCardAssistant(root, handlers) {
  if (!root || root.dataset.assistantInstalled === "true") return;
  root.dataset.assistantInstalled = "true";
  activeInstall = { root, handlers };

  root.addEventListener("pointerover", event => {
    const tile = event.target.closest?.(".db-card-tile[data-card-id]");
    if (!tile || !root.contains(tile)) return;
    const from = event.relatedTarget;
    if (from instanceof Node && tile.contains(from)) return;

    pointer = { x: event.clientX, y: event.clientY };
    cancelHide();
    window.clearTimeout(hoverTimer);
    if (preview && pinned) return;

    const id = Number(tile.dataset.cardId);
    hoverTimer = window.setTimeout(() => {
      const card = handlers.getCardById?.(id);
      if (card) showCard(card, handlers);
    }, PREVIEW_DELAY);
  });

  root.addEventListener("pointermove", event => {
    pointer = { x: event.clientX, y: event.clientY };
  }, { passive: true });

  root.addEventListener("pointerout", event => {
    const tile = event.target.closest?.(".db-card-tile[data-card-id]");
    if (!tile || !root.contains(tile)) return;
    const to = event.relatedTarget;
    if (to instanceof Node && tile.contains(to)) return;
    window.clearTimeout(hoverTimer);
    scheduleHide();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeCardAssistant(true);
  });
}

export function closeCardAssistant(force = false) {
  if (pinned && !force) return;
  window.clearTimeout(hoverTimer);
  window.clearTimeout(hideTimer);
  preview?.remove();
  preview = null;
  pinned = false;
  history = [];
}

async function showCard(card, handlers, { keepHistory = false } = {}) {
  if (!keepHistory) history = [];
  if (!preview) {
    preview = document.createElement("section");
    preview.className = "db-card-assistant";
    preview.addEventListener("pointerenter", cancelHide);
    preview.addEventListener("pointerleave", scheduleHide);
    document.body.appendChild(preview);
  }

  preview.dataset.uid = card.uid ?? `${card.gameId}:${card.id}`;
  renderAssistant(card, handlers, { loadingLinks: true });
  positionPreview();

  try {
    const allCards = await handlers.getReferenceCards?.(card.gameId);
    if (!preview || preview.dataset.uid !== (card.uid ?? `${card.gameId}:${card.id}`)) return;
    const deckCards = handlers.getDeckCards?.(card.gameId) ?? [];
    const relations = buildRelations(card, allCards ?? deckCards, deckCards);
    renderAssistant(card, handlers, { relations, loadingLinks: false });
    positionPreview();
  } catch {
    if (!preview || preview.dataset.uid !== (card.uid ?? `${card.gameId}:${card.id}`)) return;
    renderAssistant(card, handlers, { relations: emptyRelations(), loadingLinks: false, linksUnavailable: true });
    positionPreview();
  }
}

function renderAssistant(card, handlers, { relations = emptyRelations(), loadingLinks = false, linksUnavailable = false } = {}) {
  if (!preview) return;
  const traits = cardTraits(card);
  const keywords = cardKeywords(card);
  const quantity = Number(handlers.getQuantity?.(card) ?? 0);
  const canAdd = card.deckSelectable !== false && quantity < 3;
  const evolved = preview.dataset.artMode === "evolved" && Boolean(card.evolvedImage);

  preview.classList.toggle("pinned", pinned);
  preview.innerHTML = `
    <div class="db-assistant-main">
      <div class="db-assistant-art-wrap">
        <img class="db-assistant-main-art" src="${escapeAttr(evolved ? card.evolvedImage : card.image)}" alt="${escapeAttr(card.name)}" referrerpolicy="no-referrer">
        ${card.evolvedImage ? `<button type="button" class="db-assistant-art-toggle" data-assistant-art>${evolved ? "Normal" : "Evolved"}</button>` : ""}
      </div>
      <div class="db-assistant-copy">
        <div class="db-assistant-title-row">
          <div>
            <h3>${escapeHtml(card.name)}</h3>
            <div class="db-assistant-meta">${escapeHtml(card.craft)} · ${escapeHtml(card.rarity)} · ${escapeHtml(card.set)}</div>
          </div>
          <div class="db-assistant-title-actions">
            ${history.length ? `<button type="button" data-assistant-back>←</button>` : ""}
            <button type="button" data-assistant-pin class="${pinned ? "active" : ""}">${pinned ? "📌" : "Pin"}</button>
            <button type="button" data-assistant-close aria-label="Close">×</button>
          </div>
        </div>

        <div class="db-assistant-stats">
          <span>Cost ${Number(card.cost) || 0}</span>
          ${card.type === "Follower" ? `<span>${evolved ? Number(card.evolvedAttack ?? card.attack) || 0 : Number(card.attack) || 0}/${evolved ? Number(card.evolvedDefense ?? card.defense) || 0 : Number(card.defense) || 0}</span>` : ""}
          <span>${escapeHtml(card.type)}</span>
          ${card.deckSelectable === false ? `<span class="db-generated-chip">Generated</span>` : ""}
        </div>

        ${traits.length ? `<div class="db-assistant-chip-row"><strong>Traits</strong>${traits.map(trait => `<button type="button" data-assistant-trait="${escapeAttr(trait)}">${escapeHtml(trait)}</button>`).join("")}</div>` : ""}
        ${keywords.length ? `<div class="db-assistant-chip-row"><strong>Keywords</strong>${keywords.map(keyword => `<button type="button" data-assistant-keyword="${escapeAttr(keyword)}">${escapeHtml(keyword)}</button>`).join("")}</div>` : ""}

        <div class="db-assistant-effect">${formatEffect(evolved && card.evolvedText ? card.evolvedText : card.text)}</div>

        ${card.deckSelectable !== false ? `<div class="db-assistant-actions"><button type="button" data-assistant-add ${canAdd ? "" : "disabled"}>${quantity >= 3 ? "3/3 in deck" : `Add to deck${quantity ? ` (${quantity}/3)` : ""}`}</button></div>` : ""}
      </div>
    </div>

    ${loadingLinks ? `<div class="db-assistant-loading">Indexing linked cards from the local archive…</div>` : ""}
    ${linksUnavailable ? `<div class="db-assistant-loading">Linked-card archive unavailable.</div>` : ""}
    ${renderRelatedGroup("Generated / summoned", relations.generated)}
    ${renderRelatedGroup("Linked cards", relations.linked)}
    ${renderRelatedGroup("Sources", relations.sources)}
  `;

  preview.querySelector("[data-assistant-close]")?.addEventListener("click", event => {
    event.stopPropagation();
    closeCardAssistant(true);
  });
  preview.querySelector("[data-assistant-pin]")?.addEventListener("click", event => {
    event.stopPropagation();
    pinned = !pinned;
    renderAssistant(card, handlers, { relations, loadingLinks, linksUnavailable });
  });
  preview.querySelector("[data-assistant-back]")?.addEventListener("click", event => {
    event.stopPropagation();
    const previous = history.pop();
    if (previous) showCard(previous, handlers, { keepHistory: true });
  });
  preview.querySelector("[data-assistant-art]")?.addEventListener("click", event => {
    event.stopPropagation();
    preview.dataset.artMode = evolved ? "normal" : "evolved";
    renderAssistant(card, handlers, { relations, loadingLinks, linksUnavailable });
  });
  preview.querySelector("[data-assistant-add]")?.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onAdd?.(card);
    renderAssistant(card, handlers, { relations, loadingLinks, linksUnavailable });
  });
  preview.querySelectorAll("[data-assistant-trait]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onFilterTrait?.(button.dataset.assistantTrait);
    closeCardAssistant(true);
  }));
  preview.querySelectorAll("[data-assistant-keyword]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onFilterKeyword?.(button.dataset.assistantKeyword);
    closeCardAssistant(true);
  }));
  preview.querySelectorAll("[data-assistant-related]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    const related = relationCardById(relations, Number(button.dataset.assistantRelated));
    if (!related) return;
    history.push(card);
    preview.dataset.artMode = "normal";
    showCard(related, handlers, { keepHistory: true });
  }));
}

function buildRelations(card, allCards, deckCards) {
  const cacheKey = `${card.gameId}:${card.id}`;
  if (relationCache.has(cacheKey)) return relationCache.get(cacheKey);

  const index = getNameIndex(card.gameId, allCards);
  const references = extractReferences(card, index);
  const generated = [];
  const linked = [];
  const effect = cleanEffect(`${card.text ?? ""} ${card.evolvedText ?? ""}`);

  for (const related of references) {
    if (looksGeneratedContext(effect, related.name)) generated.push(related);
    else linked.push(related);
  }

  const sources = [];
  for (const source of deckCards ?? []) {
    if (Number(source.id) === Number(card.id)) continue;
    if (!mentionsExact(cleanEffect(`${source.text ?? ""} ${source.evolvedText ?? ""}`), card.name)) continue;
    sources.push(source);
    if (sources.length >= 18) break;
  }

  const result = {
    generated: uniqueCards(generated).slice(0, 18),
    linked: uniqueCards(linked).slice(0, 18),
    sources: uniqueCards(sources).slice(0, 18)
  };
  relationCache.set(cacheKey, result);
  return result;
}

function getNameIndex(gameId, cards) {
  const key = String(gameId ?? "unknown");
  if (nameIndexCache.has(key)) return nameIndexCache.get(key);

  const representative = new Map();
  for (const card of cards ?? []) {
    const name = String(card?.name ?? "").trim();
    if (name.length < 3) continue;
    const normalized = name.toLowerCase();
    const current = representative.get(normalized);
    if (!current || (current.deckSelectable !== false && card.deckSelectable === false)) representative.set(normalized, card);
  }

  const index = [...representative.entries()]
    .map(([name, card]) => ({ name, card }))
    .sort((a, b) => b.name.length - a.name.length);
  nameIndexCache.set(key, index);
  return index;
}

function extractReferences(card, index) {
  const text = cleanEffect(`${card?.text ?? ""} ${card?.evolvedText ?? ""}`);
  if (!text) return [];
  const lower = text.toLowerCase();
  const occupied = [];
  const found = [];

  for (const entry of index) {
    if (Number(entry.card.id) === Number(card.id)) continue;
    let start = lower.indexOf(entry.name);
    while (start >= 0) {
      const end = start + entry.name.length;
      if (isExactRange(lower, start, end) && !occupied.some(range => start < range.end && end > range.start)) {
        occupied.push({ start, end });
        found.push(entry.card);
        break;
      }
      start = lower.indexOf(entry.name, start + 1);
    }
  }
  return found;
}

function looksGeneratedContext(text, targetName) {
  const lower = text.toLowerCase();
  const needle = String(targetName ?? "").toLowerCase();
  const start = lower.indexOf(needle);
  if (start < 0) return false;
  const context = lower.slice(Math.max(0, start - 110), Math.min(lower.length, start + needle.length + 110));
  return /\b(summon|create|generate|put|add|transform|copy|return)\b/.test(context) && /\b(hand|deck|field|summon|into|copy|card|cards)\b/.test(context);
}

function mentionsExact(text, targetName) {
  const lower = String(text ?? "").toLowerCase();
  const needle = String(targetName ?? "").trim().toLowerCase();
  if (!needle) return false;
  let start = lower.indexOf(needle);
  while (start >= 0) {
    const end = start + needle.length;
    if (isExactRange(lower, start, end)) return true;
    start = lower.indexOf(needle, start + 1);
  }
  return false;
}

function isExactRange(text, start, end) {
  const before = start > 0 ? text[start - 1] : "";
  const after = end < text.length ? text[end] : "";
  return !isWordChar(before) && !isWordChar(after);
}

function isWordChar(value) {
  return /[a-z0-9]/i.test(value || "");
}

function renderRelatedGroup(title, cards) {
  if (!cards?.length) return "";
  return `<div class="db-assistant-related">
    <h4>${escapeHtml(title)}</h4>
    <div class="db-assistant-related-grid">
      ${cards.map(card => `<button type="button" data-assistant-related="${Number(card.id)}" title="${escapeAttr(card.name)}">
        <img src="${escapeAttr(card.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <span>${escapeHtml(card.name)}</span>
      </button>`).join("")}
    </div>
  </div>`;
}

function relationCardById(relations, id) {
  for (const group of [relations.generated, relations.linked, relations.sources]) {
    const card = group?.find(item => Number(item.id) === Number(id));
    if (card) return card;
  }
  return null;
}

function uniqueCards(cards) {
  const seen = new Set();
  return cards.filter(card => {
    const key = `${card.gameId}:${card.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyRelations() {
  return { generated: [], linked: [], sources: [] };
}

function cleanEffect(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<hr\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function formatEffect(value) {
  const clean = cleanEffect(value) || "No effect text.";
  let html = escapeHtml(clean).replace(/\n/g, "<br>");
  for (const keyword of KEYWORDS) {
    const escaped = escapeRegex(keyword);
    html = html.replace(new RegExp(`\\b(${escaped})\\b`, "gi"), "<strong>$1</strong>");
  }
  return html;
}

function positionPreview() {
  if (!preview) return;
  const gap = 14;
  const rect = preview.getBoundingClientRect();
  let left = pointer.x + gap;
  let top = pointer.y + gap;
  if (left + rect.width > window.innerWidth - 8) left = pointer.x - rect.width - gap;
  if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
  preview.style.left = `${Math.max(8, left)}px`;
  preview.style.top = `${Math.max(8, top)}px`;
}

function scheduleHide() {
  if (pinned) return;
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (!preview?.matches(":hover")) closeCardAssistant();
  }, HIDE_DELAY);
}

function cancelHide() {
  window.clearTimeout(hideTimer);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
