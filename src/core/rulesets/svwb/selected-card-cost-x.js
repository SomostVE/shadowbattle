import { costOf } from "./v5/battle-engine-v5-state.js";

const SELECTED_CARD_COST_X = /\bX is the cost of the selected card\b/i;

export function hasWorldsBeyondSelectedCardCostX(textValue) {
  return SELECTED_CARD_COST_X.test(String(textValue ?? ""));
}

export function resolveWorldsBeyondSelectedCardCostX(textValue, selectedCard = null) {
  let text = String(textValue ?? "");
  if (!hasWorldsBeyondSelectedCardCostX(text)) return text;

  const x = selectedCard ? Math.max(0, Number(costOf(selectedCard)) || 0) : 0;
  text = text.replace(/\s*X is the cost of the selected card\s*\.?/gi, " ");
  return text
    .replace(/\bX\b/g, String(x))
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}
