import { section } from "./v5/battle-engine-v5-text.js";

export function getWorldsBeyondEngageInfo(instance) {
  if (!instance?.card || cardType(instance) !== "amulet") return null;
  const text = String(instance.card.text ?? "");
  const match = text.match(/Engage\s*\(?\s*(\d+)?\s*\)?\s*:/i);
  if (!match) return null;
  const cost = Number(match[1] ?? 0);
  return {
    cost: Number.isFinite(cost) ? Math.max(0, cost) : 0,
    text: section(text, `engage${match[1] ? ` ${match[1]}` : ""}`)
  };
}

function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}
