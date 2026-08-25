import { canUseClassMechanic } from "./v5/battle-class-mechanics.js";

export function evaluateWorldsBeyondClassCondition(textValue, player, card, { consume = false } = {}) {
  let text = normalizeText(textValue);
  if (!text) return { text: "", active: true, notes: [], mechanic: null };
  const notes = [];
  let mechanic = null;

  const necromancy = text.match(/\bnecromancy\s*\(?\s*(\d+)\s*\)?\s*:\s*(.*)$/i);
  if (necromancy) {
    mechanic = "necromancy";
    const need = Number(necromancy[1]);
    if (!canUseClassMechanic(player, mechanic, card)) return inactive("Necromancy unavailable outside Abysscraft", mechanic);
    const shadows = Number(player?.resources?.shadows ?? player?.shadows ?? 0);
    if (shadows < need) return inactive(`Necromancy ${need} unavailable`, mechanic);
    if (consume) {
      if (player?.resources) player.resources.shadows = Math.max(0, shadows - need);
      else player.shadows = Math.max(0, shadows - need);
    }
    text = necromancy[2];
    notes.push(`Necromancy ${need}`);
  }

  const combo = text.match(/\bcombo\s*\(?\s*(\d+)\s*\)?\s*:\s*(.*)$/i);
  if (combo) {
    mechanic = "combo";
    const need = Number(combo[1]);
    if (!canUseClassMechanic(player, mechanic, card)) return inactive("Combo unavailable outside Forestcraft", mechanic);
    if (Number(player?.cardsPlayedThisTurn ?? 0) < need) return inactive(`Combo ${need} unavailable`, mechanic);
    text = combo[2];
    notes.push(`Combo ${need}`);
  }

  const overflow = text.match(/\boverflow\s*:\s*(.*)$/i);
  if (overflow) {
    mechanic = "overflow";
    if (!canUseClassMechanic(player, mechanic, card)) return inactive("Overflow unavailable outside Dragoncraft", mechanic);
    if (maxPp(player) < 7) return inactive("Overflow inactive", mechanic);
    text = overflow[1];
    notes.push("Overflow");
  }

  if (/if overflow is active/i.test(text)) {
    mechanic = "overflow";
    if (!canUseClassMechanic(player, mechanic, card) || maxPp(player) < 7) {
      text = text.replace(/if overflow is active[^.]*\.?/i, "");
    } else {
      text = text.replace(/if overflow is active[, ]*/i, "");
      notes.push("Overflow");
    }
  }

  text = text.trim();
  return { text, active: Boolean(text), notes, mechanic };
}

function maxPp(player) {
  return Number(player?.resources?.maxPp ?? player?.maxPp ?? 0);
}

function inactive(note, mechanic) {
  return { text: "", active: false, notes: [note], mechanic };
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
