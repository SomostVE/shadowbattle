const CLASS_NAMES = [
  "Forestcraft",
  "Swordcraft",
  "Runecraft",
  "Dragoncraft",
  "Abysscraft",
  "Havencraft",
  "Portalcraft",
  "Neutral"
];

export const CLASS_MECHANIC_OWNERS = Object.freeze({
  combo: "Forestcraft",
  rally: "Swordcraft",
  spellboost: "Runecraft",
  earthRite: "Runecraft",
  overflow: "Dragoncraft",
  necromancy: "Abysscraft"
});

export const EXCLUSIVE_MECHANIC_PATTERNS = Object.freeze([
  { mechanic: "combo", owner: "Forestcraft", pattern: /\bCombo\s*(?:\(|:)/i },
  { mechanic: "rally", owner: "Swordcraft", pattern: /\bRally\s*(?:\(|:)/i },
  { mechanic: "spellboost", owner: "Runecraft", pattern: /\b(?:On\s+)?Spellboost\b/i },
  { mechanic: "earthRite", owner: "Runecraft", pattern: /\bEarth\s+Rite\b|\bearth\s+sigils?\b/i },
  { mechanic: "overflow", owner: "Dragoncraft", pattern: /\bOverflow\b/i },
  { mechanic: "necromancy", owner: "Abysscraft", pattern: /\bNecromancy\b/i }
]);

export function normalizeClassName(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  return CLASS_NAMES.find(name => name.toLowerCase() === raw) ?? null;
}

export function mechanicOwner(mechanic) {
  return CLASS_MECHANIC_OWNERS[String(mechanic ?? "")] ?? null;
}

export function resolveDeckClass(deck, cardMap, requestedClass = null) {
  const requested = normalizeClassName(requestedClass);
  const classes = new Set();
  for (const [id, qty] of normalizeDeckRows(deck)) {
    if (!(Number(qty) > 0)) continue;
    const card = cardMap?.get?.(Number(id));
    const cardClass = normalizeClassName(card?.class);
    if (!cardClass || cardClass === "Neutral") continue;
    classes.add(cardClass);
  }

  if (requested && requested !== "Neutral") {
    const foreign = [...classes].filter(className => className !== requested);
    if (foreign.length) {
      throw new Error(`Illegal deck for ${requested}: contains ${foreign.join(", ")} cards. Only ${requested} + Neutral are allowed.`);
    }
    return requested;
  }

  if (classes.size > 1) {
    throw new Error(`Illegal mixed-class deck: ${[...classes].join(" + ")}. A deck may contain one class + Neutral only.`);
  }

  return [...classes][0] ?? requested ?? null;
}

export function playerClassName(player) {
  return normalizeClassName(player?.className ?? player?.class);
}

export function canUseClassMechanic(player, mechanic, sourceCard = null) {
  const owner = mechanicOwner(mechanic);
  if (!owner) return true;
  const activeClass = playerClassName(player);
  if (activeClass) return activeClass === owner;
  return normalizeClassName(sourceCard?.class) === owner;
}

export function canUseClassRules(player, className, sourceCard = null) {
  const owner = normalizeClassName(className);
  if (!owner || owner === "Neutral") return true;
  const activeClass = playerClassName(player);
  if (activeClass) return activeClass === owner;
  const sourceClass = normalizeClassName(sourceCard?.class);
  return sourceClass ? sourceClass === owner : true;
}

export function isSpellboostRecipientCard(card) {
  if (!card || normalizeClassName(card.class) !== "Runecraft") return false;
  const keywords = (card.keywords ?? []).map(value => String(value).trim().toLowerCase());
  return keywords.includes("on spellboost") || /\bon spellboost\s*:/i.test(String(card.text ?? ""));
}

export function classMechanicStatus(player) {
  const className = playerClassName(player) ?? "Neutral";
  const resources = player?.resources ?? player ?? {};
  if (className === "Forestcraft") return [{ key: "combo", label: "Combo", value: Math.max(0, Number(player?.cardsPlayedThisTurn ?? resources.combo) || 0) }];
  if (className === "Swordcraft") return [{ key: "rally", label: "Rally", value: Math.max(0, Number(resources.rally) || 0) }];
  if (className === "Runecraft") return [
    { key: "spellboost", label: "Spellboost", value: "Hand" },
    { key: "earthRite", label: "Earth Sigils", value: Math.max(0, Number(resources.earthSigils) || 0) }
  ];
  if (className === "Dragoncraft") return [{ key: "overflow", label: "Overflow", value: (Number(resources.maxPp) || 0) >= 7 ? "Active" : "Inactive" }];
  if (className === "Abysscraft") return [{ key: "necromancy", label: "Shadows", value: Math.max(0, Number(resources.shadows) || 0) }];
  return [];
}

export function auditExclusiveMechanicCards(cards) {
  const violations = [];
  const inventory = new Map();
  for (const contract of EXCLUSIVE_MECHANIC_PATTERNS) inventory.set(contract.mechanic, []);

  for (const card of cards ?? []) {
    const haystack = `${(card.keywords ?? []).join("\n")}\n${card.text ?? ""}\n${card.rawSkillText ?? ""}`;
    for (const contract of EXCLUSIVE_MECHANIC_PATTERNS) {
      if (!contract.pattern.test(haystack)) continue;
      inventory.get(contract.mechanic)?.push(card);
      const actual = normalizeClassName(card.class);
      if (actual !== contract.owner) {
        violations.push({
          mechanic: contract.mechanic,
          expectedClass: contract.owner,
          actualClass: actual ?? String(card.class ?? "Unknown"),
          cardId: Number(card.id),
          cardName: card.name
        });
      }
    }
  }

  return { violations, inventory };
}

function normalizeDeckRows(deck) {
  if (deck instanceof Map) return [...deck.entries()];
  if (!Array.isArray(deck)) return [];
  return deck.map(entry => {
    if (Array.isArray(entry)) return [Number(entry[0]), Number(entry[1])];
    return [Number(entry?.cardId ?? entry?.id), Number(entry?.qty ?? entry?.quantity ?? 1)];
  });
}
