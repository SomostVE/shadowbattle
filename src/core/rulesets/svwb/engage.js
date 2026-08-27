import { getWorldsBeyondCrests } from "./crests.js";
import { section } from "./v5/battle-engine-v5-text.js";

const ADVANCE_COUNT = /\bAdvance this amulet(?:'s|’s) count by\s+(X|\d+)\b/i;
const CREST_COUNT_X = /\bX is the number of crests you have\b/i;
const DESTROY_SOURCE = /\bDestroy this card\b/i;

export function getWorldsBeyondEngageInfo(instance) {
  if (!instance?.card || cardType(instance) !== "amulet") return null;
  const text = String(instance.card.text ?? "");
  const match = text.match(/Engage\s*\(?\s*(\d+)?\s*\)?\s*:/i);
  if (!match) return null;
  const cost = Number(match[1] ?? 0);
  const rawEffect = section(text, `engage${match[1] ? ` ${match[1]}` : ""}`);
  const advance = ADVANCE_COUNT.exec(rawEffect);
  const destroySource = DESTROY_SOURCE.test(rawEffect);
  const result = {
    cost: Number.isFinite(cost) ? Math.max(0, cost) : 0,
    text: stripEngageAmuletOperations(rawEffect, advance)
  };

  if (advance) {
    if (/^\d+$/.test(advance[1])) {
      result.advanceCountdown = { kind: "fixed", amount: Math.max(0, Number(advance[1]) || 0) };
    } else if (CREST_COUNT_X.test(rawEffect)) {
      result.advanceCountdown = { kind: "crests" };
    }
  }
  if (destroySource) result.destroySource = true;
  return result;
}

export function getWorldsBeyondEngageAdvanceAmount(info, player) {
  const advance = info?.advanceCountdown;
  if (!advance) return 0;
  if (advance.kind === "fixed") return Math.max(0, Number(advance.amount) || 0);
  if (advance.kind === "crests") return getWorldsBeyondCrests(player).length;
  return 0;
}

function stripEngageAmuletOperations(rawEffect, advanceMatch) {
  let text = String(rawEffect ?? "");
  if (advanceMatch) {
    const supportsAdvance = /^\d+$/.test(advanceMatch[1]) || CREST_COUNT_X.test(text);
    if (supportsAdvance) text = text.replace(advanceMatch[0], " ");
  }
  if (CREST_COUNT_X.test(text) && advanceMatch?.[1]?.toUpperCase() === "X") text = text.replace(CREST_COUNT_X, " ");
  text = text.replace(DESTROY_SOURCE, " ");
  return text
    .replace(/\s*\.\s*\.\s*/g, ". ")
    .replace(/^\s*[.;,:-]+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}
