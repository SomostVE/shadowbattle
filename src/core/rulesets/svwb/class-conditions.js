import { canUseClassMechanic } from "./v5/battle-class-mechanics.js";

export function evaluateWorldsBeyondClassCondition(textValue, player, card, { consume = false } = {}) {
  let text = normalizeText(textValue);
  if (!text) return { text: "", active: true, notes: [], mechanic: null };
  const notes = [];
  let mechanic = null;

  const necromancy = findThresholdMechanic(text, /\bnecromancy\s*\(?\s*(\d+)\s*\)?\s*(?::|[-–—])\s*(.*)$/i);
  if (necromancy) {
    mechanic = "necromancy";
    const need = Number(necromancy.match[1]);
    const shadows = Number(player?.resources?.shadows ?? player?.shadows ?? 0);
    if (!canUseClassMechanic(player, mechanic, card)) {
      text = keepUnconditionalPrefix(necromancy.prefix);
      notes.push("Necromancy unavailable outside Abysscraft");
    } else if (shadows < need) {
      text = keepUnconditionalPrefix(necromancy.prefix);
      notes.push(`Necromancy ${need} unavailable`);
    } else {
      if (consume) {
        if (player?.resources) player.resources.shadows = Math.max(0, shadows - need);
        else player.shadows = Math.max(0, shadows - need);
      }
      text = joinResolvedSegments(necromancy.prefix, necromancy.match[2]);
      notes.push(`Necromancy ${need}`);
    }
  }

  const combo = findThresholdMechanic(text, /\bcombo\s*\(?\s*(\d+)\s*\)?\s*(?::|[-–—])\s*(.*)$/i);
  if (combo) {
    mechanic = "combo";
    const need = Number(combo.match[1]);
    if (!canUseClassMechanic(player, mechanic, card)) {
      text = keepUnconditionalPrefix(combo.prefix);
      notes.push("Combo unavailable outside Forestcraft");
    } else if (Number(player?.cardsPlayedThisTurn ?? 0) < need) {
      text = keepUnconditionalPrefix(combo.prefix);
      notes.push(`Combo ${need} unavailable`);
    } else {
      text = joinResolvedSegments(combo.prefix, combo.match[2]);
      notes.push(`Combo ${need}`);
    }
  }

  const overflow = findThresholdMechanic(text, /\boverflow\s*(?::|[-–—])\s*(.*)$/i);
  if (overflow) {
    mechanic = "overflow";
    if (!canUseClassMechanic(player, mechanic, card)) {
      text = keepUnconditionalPrefix(overflow.prefix);
      notes.push("Overflow unavailable outside Dragoncraft");
    } else if (maxPp(player) < 7) {
      text = keepUnconditionalPrefix(overflow.prefix);
      notes.push("Overflow inactive");
    } else {
      text = joinResolvedSegments(overflow.prefix, overflow.match[1]);
      notes.push("Overflow");
    }
  }

  const overflowPrefix = text.match(/^if\s+(?:you(?:'re| are)|your leader is)\s+in\s+overflow\s*,\s*(.*)$/i);
  if (overflowPrefix) {
    mechanic = "overflow";
    if (!canUseClassMechanic(player, mechanic, card)) return inactive("Overflow unavailable outside Dragoncraft", mechanic, notes);
    if (maxPp(player) < 7) return inactive("Overflow inactive", mechanic, notes);
    text = overflowPrefix[1];
    notes.push("Overflow");
  }

  if (/if overflow is active/i.test(text)) {
    mechanic = "overflow";
    if (!canUseClassMechanic(player, mechanic, card) || maxPp(player) < 7) {
      text = text.replace(/if overflow is active[^.]*\.?/i, "");
      notes.push("Overflow inactive");
    } else {
      text = text.replace(/if overflow is active[, ]*/i, "");
      notes.push("Overflow");
    }
  }

  text = normalizeResolvedText(text);
  return { text, active: Boolean(text), notes, mechanic };
}

function findThresholdMechanic(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return null;
  return { match, prefix: text.slice(0, match.index) };
}

function keepUnconditionalPrefix(prefix) {
  return normalizeResolvedText(prefix);
}

function joinResolvedSegments(prefix, conditionalEffect) {
  const left = normalizeResolvedText(prefix);
  const right = normalizeResolvedText(conditionalEffect);
  return [left, right].filter(Boolean).join(" ");
}

function normalizeResolvedText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function maxPp(player) {
  return Number(player?.resources?.maxPp ?? player?.maxPp ?? 0);
}

function inactive(note, mechanic, priorNotes = []) {
  return { text: "", active: false, notes: [...priorNotes, note], mechanic };
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
