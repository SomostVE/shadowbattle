import { GAME_IDS } from "../core/game-catalog.js";
import { normalizeEntries } from "./storage.js";

export const DECK_RULES = Object.freeze({
  [GAME_IDS.SHADOWVERSE_CCG]: Object.freeze({ deckSize: 40, maxCopies: 3 }),
  [GAME_IDS.CHAMPIONS_BATTLE]: Object.freeze({ deckSize: 40, maxCopies: 3 }),
  [GAME_IDS.WORLDS_BEYOND]: Object.freeze({ deckSize: 40, maxCopies: 3 })
});

export function getDeckRules(gameId) {
  const rules = DECK_RULES[gameId];
  if (!rules) throw new Error(`No deck rules for ${gameId}`);
  return rules;
}

export function validateDeckEntries(gameId, entries) {
  const rules = getDeckRules(gameId);
  const normalized = normalizeEntries(entries);
  const total = normalized.reduce((sum, [, quantity]) => sum + quantity, 0);
  const overCopies = normalized.filter(([, quantity]) => quantity > rules.maxCopies);
  return {
    gameId,
    entries: normalized,
    total,
    legalSize: total === rules.deckSize,
    withinSizeLimit: total <= rules.deckSize,
    overCopies,
    legal: total === rules.deckSize && overCopies.length === 0
  };
}

export function canAddCard(gameId, entries, cardId, quantity = 1) {
  const rules = getDeckRules(gameId);
  const normalized = normalizeEntries(entries);
  const total = normalized.reduce((sum, [, count]) => sum + count, 0);
  const current = normalized.find(([id]) => id === Number(cardId))?.[1] ?? 0;
  return current + quantity <= rules.maxCopies && total + quantity <= rules.deckSize;
}
