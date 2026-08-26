import { worldsBeyondProvider } from "../data/providers/worlds-beyond.js";

const ui = {
  root: document.querySelector("#battle-card-inspector"),
  empty: document.querySelector("#battle-card-inspector-empty"),
  content: document.querySelector("#battle-card-inspector-content"),
  image: document.querySelector("#battle-card-inspector-image"),
  name: document.querySelector("#battle-card-inspector-name"),
  meta: document.querySelector("#battle-card-inspector-meta"),
  state: document.querySelector("#battle-card-inspector-state"),
  keywords: document.querySelector("#battle-card-inspector-keywords"),
  text: document.querySelector("#battle-card-inspector-text"),
  evolvedBlock: document.querySelector("#battle-card-inspector-evolved-block"),
  evolvedText: document.querySelector("#battle-card-inspector-evolved-text")
};

let cardsByName = new Map();
let ready = false;

initialize();

async function initialize() {
  if (!ui.root) return;
  try {
    const cards = await worldsBeyondProvider.loadCards();
    cardsByName = new Map(cards.map(card => [normalizeName(card.name), card]));
    ready = true;
  } catch (error) {
    console.error(error);
    ui.empty.textContent = "Card inspector unavailable: Beyond Codex could not be loaded.";
  }
}

document.addEventListener("pointerover", event => {
  const node = inspectableNode(event.target);
  if (node) inspect(node);
}, { passive: true });

document.addEventListener("focusin", event => {
  const node = inspectableNode(event.target);
  if (node) inspect(node);
});

function inspectableNode(target) {
  if (!(target instanceof Element)) return null;
  const node = target.closest(".sb-battle-card:not(.sb-battle-card-back), .sb-battle-unit");
  if (!node || !document.querySelector("#battle-stage")?.contains(node)) return null;
  return node;
}

function inspect(node) {
  if (!ready) return;
  const name = cardNameFromNode(node);
  if (!name) return;
  const card = cardsByName.get(normalizeName(name));
  if (!card) {
    showUnknown(name, node);
    return;
  }
  renderCard(card, node);
}

function renderCard(card, node) {
  ui.empty.hidden = true;
  ui.content.hidden = false;
  ui.image.src = card.image ?? "";
  ui.image.alt = card.name ?? "Card";
  ui.name.textContent = card.name ?? "Unknown card";

  const meta = [
    card.class,
    card.type,
    card.rarity,
    Number.isFinite(Number(card.cost)) ? `${Number(card.cost)} PP` : null,
    String(card.type ?? "").toLowerCase() === "follower" ? `${Number(card.attack ?? 0)}/${Number(card.defense ?? 0)}` : null,
    card.id != null ? `#${card.id}` : null
  ].filter(Boolean);
  ui.meta.textContent = meta.join(" · ");
  ui.state.textContent = currentState(node, card);

  const keywords = Array.isArray(card.keywords) ? card.keywords.filter(Boolean) : [];
  ui.keywords.replaceChildren(...keywords.map(keyword => keywordChip(keyword)));
  if (!keywords.length) {
    const none = document.createElement("span");
    none.className = "sb-card-inspector-none";
    none.textContent = "No keywords";
    ui.keywords.append(none);
  }

  ui.text.textContent = cleanText(card.text) || "No effect text.";
  const evolvedText = cleanText(card.evolved?.text);
  const showEvolved = Boolean(evolvedText && evolvedText !== cleanText(card.text));
  ui.evolvedBlock.hidden = !showEvolved;
  ui.evolvedText.textContent = showEvolved ? evolvedText : "";
}

function showUnknown(name, node) {
  ui.empty.hidden = true;
  ui.content.hidden = false;
  ui.image.removeAttribute("src");
  ui.image.alt = "";
  ui.name.textContent = name;
  ui.meta.textContent = "Runtime card";
  ui.state.textContent = currentState(node, null);
  ui.keywords.replaceChildren();
  ui.text.textContent = "No matching Beyond Codex definition was found for this runtime card.";
  ui.evolvedBlock.hidden = true;
  ui.evolvedText.textContent = "";
}

function currentState(node, card) {
  const parts = [];
  if (node.classList.contains("sb-battle-unit")) {
    const attack = node.querySelector(".sb-battle-stat-attack")?.textContent;
    const defense = node.querySelector(".sb-battle-stat-defense")?.textContent;
    const countdown = node.querySelector(".sb-battle-stat-countdown")?.textContent;
    if (attack != null && defense != null) parts.push(`Current ${attack}/${defense}`);
    if (countdown != null) parts.push(`Countdown ${countdown}`);
    if (node.classList.contains("is-super-evolved")) parts.push("Super Evolved");
    else if (node.classList.contains("is-evolved")) parts.push("Evolved");
    else parts.push("Base state");
  } else {
    const displayedCost = node.querySelector(".sb-battle-card-cost")?.textContent;
    if (displayedCost != null && Number(displayedCost) !== Number(card?.cost)) parts.push(`Current cost ${displayedCost} PP`);
    parts.push("Hand");
  }
  return parts.join(" · ");
}

function keywordChip(value) {
  const chip = document.createElement("span");
  chip.className = "sb-card-inspector-keyword";
  chip.textContent = String(value);
  return chip;
}

function cardNameFromNode(node) {
  return node.querySelector(".sb-battle-unit-name")?.textContent?.trim()
    || node.querySelector("img")?.alt?.trim()
    || "";
}

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function cleanText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}
