const HAND_SIZE_X = /\bX is the number of cards in your hand\s*\.?/i;
const DRAW_ONE = /\bdraw a card\b/i;
const RESTORE_X = /\brestore X defense to your leader\b/i;

export const LIVE_HAND_SIZE_LEADER_HEAL = /\brestore defense to your leader equal to the number of cards in your hand\b/gi;

export function resolveWorldsBeyondPostDrawHandX(textValue) {
  const text = String(textValue ?? "");
  const draw = DRAW_ONE.exec(text);
  const restore = RESTORE_X.exec(text);
  const definition = HAND_SIZE_X.exec(text);
  if (!draw || !restore || !definition) return text;
  if (!(draw.index < restore.index && restore.index < definition.index)) return text;

  return text
    .replace(HAND_SIZE_X, " ")
    .replace(RESTORE_X, "Restore defense to your leader equal to the number of cards in your hand")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}
