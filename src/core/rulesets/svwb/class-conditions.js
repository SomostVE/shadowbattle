import { canUseClassMechanic } from "./v5/battle-class-mechanics.js";

const COUNT_WORDS = Object.freeze({
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
});

export function evaluateWorldsBeyondClassCondition(textValue, player, card, { consume = false } = {}) {
  let text = normalizeText(textValue);
  if (!text) return { text: "", active: true, notes: [], mechanic: null };
  const notes = [];
  let mechanic = null;

  const comboVariable = resolveComboVariable(text, player);
  if (comboVariable) {
    text = comboVariable.text;
    mechanic = "combo";
    notes.push(`X = Combo ${comboVariable.value}`);
  }

  const alliedAmulets = findThresholdMechanic(text, /\bif there are at least\s+(\d+)\s+allied amulets on the field\s*,?\s*(.*)$/i);
  if (alliedAmulets) {
    const need = Number(alliedAmulets.match[1]);
    const value = countAlliedAmulets(player);
    const active = value >= need;
    text = resolveConditionalSegments(alliedAmulets.prefix, alliedAmulets.match[2], active);
    mechanic = mechanic ?? "alliedAmulets";
    notes.push(active ? `Allied amulets ${value}/${need}` : `Allied amulets ${value}/${need} unavailable`);
  }

  const maxPlayPoints = findThresholdMechanic(text, /\bif you have\s+(\d+)\s+max play points?\s*,?\s*(.*)$/i);
  if (maxPlayPoints) {
    const need = Number(maxPlayPoints.match[1]);
    const value = maxPp(player);
    const active = value >= need;
    text = resolveConditionalSegments(maxPlayPoints.prefix, maxPlayPoints.match[2], active);
    mechanic = mechanic ?? "maxPlayPoints";
    notes.push(active ? `Max PP ${value}/${need}` : `Max PP ${value}/${need} unavailable`);
  }

  const leaderDefense = findThresholdMechanic(text, /\bif your leader'?s defense is\s+(\d+)\s+or less\s*,?\s*(.*)$/i);
  if (leaderDefense) {
    const limit = Number(leaderDefense.match[1]);
    const value = Number(player?.hp ?? player?.defense ?? 0);
    const active = value <= limit;
    text = resolveConditionalSegments(leaderDefense.prefix, leaderDefense.match[2], active);
    mechanic = mechanic ?? "leaderDefense";
    notes.push(active ? `Leader defense ${value} <= ${limit}` : `Leader defense ${value} > ${limit}`);
  }

  const necromancy = findThresholdMechanic(text, /\bnecromancy\s*\(?\s*(\d+)\s*\)?\s*(?::|[-–—])\s*(.*)$/i);
  if (necromancy) {
    mechanic = "necromancy";
    const need = Number(necromancy.match[1]);
    const shadows = Number(player?.resources?.shadows ?? player?.shadows ?? 0);
    if (!canUseClassMechanic(player, mechanic, card)) {
      text = resolveConditionalSegments(necromancy.prefix, necromancy.match[2], false);
      notes.push("Necromancy unavailable outside Abysscraft");
    } else if (shadows < need) {
      text = resolveConditionalSegments(necromancy.prefix, necromancy.match[2], false);
      notes.push(`Necromancy ${need} unavailable`);
    } else {
      if (consume) setResource(player, "shadows", shadows - need);
      text = resolveConditionalSegments(necromancy.prefix, necromancy.match[2], true);
      notes.push(`Necromancy ${need}`);
    }
  }

  const combo = findThresholdMechanic(text, /\bcombo\s*\(?\s*(\d+)\s*\)?\s*(?::|[-–—])\s*(.*)$/i);
  if (combo) {
    mechanic = "combo";
    const need = Number(combo.match[1]);
    if (!canUseClassMechanic(player, mechanic, card)) {
      text = resolveConditionalSegments(combo.prefix, combo.match[2], false);
      notes.push("Combo unavailable outside Forestcraft");
    } else if (Number(player?.cardsPlayedThisTurn ?? player?.resources?.combo ?? 0) < need) {
      text = resolveConditionalSegments(combo.prefix, combo.match[2], false);
      notes.push(`Combo ${need} unavailable`);
    } else {
      text = resolveConditionalSegments(combo.prefix, combo.match[2], true);
      notes.push(`Combo ${need}`);
    }
  }

  const rally = findThresholdMechanic(text, /\brally\s*\(?\s*(\d+)\s*\)?\s*(?::|[-–—])\s*(.*)$/i);
  if (rally) {
    mechanic = "rally";
    const need = Number(rally.match[1]);
    const value = Number(player?.resources?.rally ?? player?.rally ?? 0);
    if (!canUseClassMechanic(player, mechanic, card)) {
      text = resolveConditionalSegments(rally.prefix, rally.match[2], false);
      notes.push("Rally unavailable outside Swordcraft");
    } else if (value < need) {
      text = resolveConditionalSegments(rally.prefix, rally.match[2], false);
      notes.push(`Rally ${need} unavailable`);
    } else {
      text = resolveConditionalSegments(rally.prefix, rally.match[2], true);
      notes.push(`Rally ${need}`);
    }
  }

  const earthRite = findThresholdMechanic(text, /\bearth\s+rite\s*\(?\s*(\d+)\s*\)?\s*(?::|[-–—])\s*(.*)$/i);
  if (earthRite) {
    mechanic = "earthRite";
    const need = Number(earthRite.match[1]);
    const sigils = Number(player?.resources?.earthSigils ?? player?.earthSigils ?? 0);
    if (!canUseClassMechanic(player, mechanic, card)) {
      text = resolveConditionalSegments(earthRite.prefix, earthRite.match[2], false);
      notes.push("Earth Rite unavailable outside Runecraft");
    } else if (sigils < need) {
      text = resolveConditionalSegments(earthRite.prefix, earthRite.match[2], false);
      notes.push(`Earth Rite ${need} unavailable`);
    } else {
      if (consume) setResource(player, "earthSigils", sigils - need);
      text = resolveConditionalSegments(earthRite.prefix, earthRite.match[2], true);
      notes.push(`Earth Rite ${need}`);
    }
  }

  const overflowDamageInstead = parseOverflowDamageInstead(text);
  if (overflowDamageInstead) {
    mechanic = "overflow";
    if (!canUseClassMechanic(player, mechanic, card)) {
      text = overflowDamageInstead.prefix;
      notes.push("Overflow unavailable outside Dragoncraft");
    } else if (maxPp(player) < 7) {
      text = overflowDamageInstead.prefix;
      notes.push("Overflow inactive");
    } else {
      text = replaceLastDamageAmount(overflowDamageInstead.prefix, overflowDamageInstead.amount);
      notes.push("Overflow");
    }
  }

  const overflowSummonInstead = parseOverflowSummonInstead(text);
  if (overflowSummonInstead) {
    mechanic = "overflow";
    if (!canUseClassMechanic(player, mechanic, card)) {
      text = overflowSummonInstead.prefix;
      notes.push("Overflow unavailable outside Dragoncraft");
    } else if (maxPp(player) < 7) {
      text = overflowSummonInstead.prefix;
      notes.push("Overflow inactive");
    } else {
      text = replaceLastSummonCount(overflowSummonInstead.prefix, overflowSummonInstead.count);
      notes.push("Overflow");
    }
  }

  const overflowSuffix = parseOverflowSuffix(text);
  if (overflowSuffix) {
    mechanic = "overflow";
    if (!canUseClassMechanic(player, mechanic, card)) {
      text = overflowSuffix.prefix;
      notes.push("Overflow unavailable outside Dragoncraft");
    } else if (maxPp(player) < 7) {
      text = overflowSuffix.prefix;
      notes.push("Overflow inactive");
    } else {
      text = joinResolvedSegments(overflowSuffix.prefix, overflowSuffix.effect);
      notes.push("Overflow");
    }
  }

  const overflow = findThresholdMechanic(text, /\boverflow\s*(?::|[-–—])\s*(.*)$/i);
  if (overflow) {
    mechanic = "overflow";
    if (!canUseClassMechanic(player, mechanic, card)) {
      text = resolveConditionalSegments(overflow.prefix, overflow.match[1], false);
      notes.push("Overflow unavailable outside Dragoncraft");
    } else if (maxPp(player) < 7) {
      text = resolveConditionalSegments(overflow.prefix, overflow.match[1], false);
      notes.push("Overflow inactive");
    } else {
      text = resolveConditionalSegments(overflow.prefix, overflow.match[1], true);
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

  const repeat = parseRepeatedAction(text);
  if (repeat) text = expandRepeatedAction(repeat, repeat.count);

  text = normalizeResolvedText(text);
  return { text, active: Boolean(text), notes, mechanic };
}

function resolveComboVariable(text, player) {
  if (!/\bX is your Combo\b/i.test(text)) return null;
  const value = Math.max(0, Number(player?.cardsPlayedThisTurn ?? player?.resources?.combo ?? 0) || 0);
  const withoutDefinition = String(text).replace(/\s*X is your Combo\s*\.?/gi, " ");
  return {
    value,
    text: normalizeResolvedText(withoutDefinition.replace(/\bX\b/g, String(value)))
  };
}

function countAlliedAmulets(player) {
  return (player?.board ?? []).filter(item => cardType(item) === "amulet").length;
}

function cardType(instance) {
  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}

function setResource(player, key, value) {
  const next = Math.max(0, Number(value) || 0);
  if (player?.resources) player.resources[key] = next;
  else if (player) player[key] = next;
}

function findThresholdMechanic(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return null;
  return { match, prefix: text.slice(0, match.index) };
}

function parseOverflowDamageInstead(text) {
  const match = String(text ?? "").match(/^(.*?)\s*if\s+(?:you(?:'re| are)|your leader is)\s+in\s+overflow\s*,\s*deal\s+(\d+)\s+damage\s+instead\s*\.?\s*$/i);
  if (!match) return null;
  const prefix = normalizeResolvedText(match[1]);
  if (!/\bdeal(?:\s+it)?\s+\d+\s+damage\b/i.test(prefix)) return null;
  return { prefix, amount: Number(match[2]) || 0 };
}

function parseOverflowSummonInstead(text) {
  const match = String(text ?? "").match(/^(.*?)\s*if\s+(?:you(?:'re| are)|your leader is)\s+in\s+overflow\s*,\s*summon\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+instead\s*\.?\s*$/i);
  if (!match) return null;
  const prefix = normalizeResolvedText(match[1]);
  const count = parseCount(match[2]);
  if (count == null || !/\bsummon\s+(?:(?:a|an|one)\s+|(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+copies of\s+)[^.]+/i.test(prefix)) return null;
  return { prefix, count };
}

function parseOverflowSuffix(text) {
  const match = String(text ?? "").match(/^(.*?)\s*if\s+(?:you(?:'re| are)|your leader is)\s+in\s+overflow\s*,\s*(.+?)\s*$/i);
  if (!match) return null;
  const prefix = normalizeResolvedText(match[1]);
  const effect = normalizeResolvedText(match[2]);
  if (!prefix || !effect) return null;
  return { prefix, effect };
}

function replaceLastDamageAmount(prefix, amount) {
  const value = String(prefix ?? "");
  const matches = [...value.matchAll(/\bdeal(?:\s+it)?\s+\d+\s+damage\b/gi)];
  const hit = matches.at(-1);
  if (!hit || hit.index == null) return normalizeResolvedText(value);
  const replacement = hit[0].replace(/\d+/, String(Math.max(0, Number(amount) || 0)));
  return normalizeResolvedText(`${value.slice(0, hit.index)}${replacement}${value.slice(hit.index + hit[0].length)}`);
}

function replaceLastSummonCount(prefix, count) {
  const value = String(prefix ?? "");
  const pattern = /\bsummon\s+(?:(?:a|an|one)\s+([^.]+?)|(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+copies of\s+([^.]+?))(?=\.|$)/gi;
  const matches = [...value.matchAll(pattern)];
  const hit = matches.at(-1);
  if (!hit || hit.index == null) return normalizeResolvedText(value);
  const name = String(hit[1] ?? hit[2] ?? "").trim();
  if (!name) return normalizeResolvedText(value);
  const times = Math.max(0, Number(count) || 0);
  const replacement = times === 1 ? `Summon a ${name}` : `Summon ${times} copies of ${name}`;
  return normalizeResolvedText(`${value.slice(0, hit.index)}${replacement}${value.slice(hit.index + hit[0].length)}`);
}

function resolveConditionalSegments(prefix, conditionalEffect, branchActive) {
  const repeat = parseRepeatedAction(prefix);
  if (repeat) {
    const overrideCount = branchActive ? parseRepeatOverride(conditionalEffect) : null;
    if (!branchActive || overrideCount != null) {
      return expandRepeatedAction(repeat, overrideCount ?? repeat.count);
    }
  }
  return branchActive ? joinResolvedSegments(prefix, conditionalEffect) : keepUnconditionalPrefix(prefix);
}

function parseRepeatedAction(prefix) {
  const match = String(prefix ?? "").match(/^(.*?)(?:do this)\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+times?\s*:\s*["“]([\s\S]+?)["”]\s*\.?\s*$/i);
  if (!match) return null;
  const count = parseCount(match[2]);
  if (count == null) return null;
  return {
    leading: normalizeResolvedText(match[1]),
    count,
    body: normalizeResolvedText(match[3])
  };
}

function parseRepeatOverride(effect) {
  const match = String(effect ?? "").match(/^\s*do it\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+times?\s+instead\s*\.?\s*$/i);
  return match ? parseCount(match[1]) : null;
}

function expandRepeatedAction(repeat, count) {
  const times = Math.max(0, Number(count) || 0);
  const parts = [];
  if (repeat.leading) parts.push(repeat.leading);
  for (let index = 0; index < times; index += 1) parts.push(repeat.body);
  return normalizeResolvedText(parts.join(" "));
}

function parseCount(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (/^\d+$/.test(raw)) return Number(raw);
  return COUNT_WORDS[raw] ?? null;
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
