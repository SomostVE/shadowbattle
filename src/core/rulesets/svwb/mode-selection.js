import { expandModes } from "./v5/battle-engine-v5-text.js";

const MODE_SELECTOR = /\bSelect\s+(a|an|one|two|three|four|five|\d+)\s+Modes?\s+to activate\.\s*/i;
const FIRST_MODE = /(?:^|\s)1\.\s*/;

export function getSimpleWorldsBeyondModeChoices(text, player = null) {
  const value = String(text ?? "");
  if (!isSimpleWorldsBeyondModeSelection(value)) return [];
  return expandModes(value, player)
    .filter(choice => Number(choice.selectedModeCount ?? 0) > 0)
    .map(choice => ({
      kind: "mode",
      text: choice.text,
      modeIndex: Number(choice.i ?? 0),
      selectedModeCount: Number(choice.selectedModeCount ?? 0),
      selectedModeIndices: [...(choice.selectedModeIndices ?? [])]
    }));
}

export function isSimpleWorldsBeyondModeSelection(text) {
  const value = String(text ?? "");
  const selector = MODE_SELECTOR.exec(value);
  if (!selector) return false;
  const tail = value.slice(selector.index + selector[0].length);
  const first = FIRST_MODE.exec(tail);
  if (!first) return false;
  return !tail.slice(0, first.index).trim();
}

export function worldsBeyondModeChoiceKey(choice) {
  if (!choice) return "default";
  const selected = Array.isArray(choice.selectedModeIndices) ? choice.selectedModeIndices.join(",") : "";
  return `mode:${Number(choice.modeIndex ?? 0)}:${selected}`;
}
