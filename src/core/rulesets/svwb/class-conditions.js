import { hasWorldsBeyondKeyword } from "./combat-readiness.js";
import { countWorldsBeyondDifferentlyNamedArtifactEntries } from "./match-history.js";
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

export function evaluateWorldsBeyondClassCondition(textValue, player, card, { consume = false, source = null } = {}) {
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

  const orderedStateVariable = resolveOrderedStateCountVariable(text);
  if (orderedStateVariable) {
    text = orderedStateVariable.text;
    mechanic = mechanic ?? "orderedStateCount";
    notes.push(orderedStateVariable.note);
  }

  const stateVariable = resolveStateCountVariable(text, player, source);
  if (stateVariable) {
    text = stateVariable.text;
    mechanic = mechanic ?? "stateCount";
    notes.push(`X = ${stateVariable.label} ${stateVariable.value}`);
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

  const superEvolutionUnlocked = findThresholdMechanic(text, /\bif you(?:'ve| have) unlocked super[- ]evolution\s*,?\s*(.*)$/i);
  if (superEvolutionUnlocked) {
    const active = Boolean(player?.resources?.superEvolutionAvailable);
    text = resolveConditionalSegments(superEvolutionUnlocked.prefix, superEvolutionUnlocked.match[1], active);
    mechanic = mechanic ?? "superEvolutionUnlocked";
    notes.push(active ? "Super Evolution unlocked" : "Super Evolution not unlocked");
  }

  const noDuplicates = findThresholdMechanic(text, /\bif there are no duplicates in your deck\s*,?\s*(.*)$/i);
  if (noDuplicates) {
    const active = deckHasNoDuplicates(player);
    text = resolveConditionalSegments(noDuplicates.prefix, noDuplicates.match[1], active);
    mechanic = mechanic ?? "noDeckDuplicates";
    notes.push(active ? "No duplicates in deck" : "Deck contains duplicates");
  }

  const attackedLeaderLastTurn = findThresholdMechanic(text, /\bif an allied follower attacked a leader on your last turn\s*,?\s*(.*)$/i);
  if (attackedLeaderLastTurn) {
    const active = Boolean(player?.attackedLeaderLastTurn);
    text = resolveConditionalSegments(attackedLeaderLastTurn.prefix, attackedLeaderLastTurn.match[1], active);
    mechanic = mechanic ?? "attackedLeaderLastTurn";
    notes.push(active ? "Allied follower attacked a leader last turn" : "No allied follower attacked a leader last turn");
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

function resolveOrderedStateCountVariable(text) {
  const value = String(text ?? "");
  const golemDefinition = /\bX is the number of allied Golem followers on the field\s*\.?/i;
  if (golemDefinition.test(value) && /\bdeal X damage to all enemy followers\b/i.test(value)) {
    const withoutDefinition = value.replace(golemDefinition, " ");
    return {
      note: "X = allied Golem followers at resolution",
      text: normalizeResolvedText(withoutDefinition.replace(
        /\bdeal X damage to all enemy followers\b/i,
        "Deal damage to all enemy followers equal to the number of allied Golem followers on the field"
      ))
    };
  }

  const neutralDefinition = /\bX is the number of Neutral cards in your hand\s*\.?/i;
  const neutralMatch = neutralDefinition.exec(value);
  const randomDamage = /\bdeal X damage to (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) random enemy followers\b/i;
  if (!neutralMatch || !randomDamage.test(value)) return null;
  const prefix = value.slice(0, neutralMatch.index);
  if (!prefixMutatesHand(prefix)) return null;
  const withoutDefinition = value.slice(0, neutralMatch.index) + " " + value.slice(neutralMatch.index + neutralMatch[0].length);
  return {
    note: "X = Neutral cards in hand at resolution",
    text: normalizeResolvedText(withoutDefinition.replace(
      randomDamage,
      (_, count) => "Deal damage to " + count + " random enemy followers equal to the number of Neutral cards in your hand"
    ))
  };
}

function resolveStateCountVariable(text, player, source = null) {
  const value = String(text ?? "");
  if ((value.match(/\bX is\b/gi) ?? []).length !== 1) return null;

  const definitions = [
    {
      label: "Earth Sigils",
      pattern: /\bX is the number of earth sigils you have\s*\.?/i,
      blocked: prefixMutatesEarthSigils,
      count: () => Math.max(0, Number(player?.resources?.earthSigils ?? player?.earthSigils ?? 0) || 0)
    },
    {
      label: "differently named allied Artifact followers entered",
      pattern: /\bX is the number of differently named allied Artifact followers that have entered the field this match\s*\.?/i,
      blocked: prefixMutatesFollowerEntryHistory,
      count: () => countWorldsBeyondDifferentlyNamedArtifactEntries(player)
    },
    {
      label: "allied Ward followers",
      pattern: /\bX is the number of allied followers on the field with Ward\s*\.?/i,
      blocked: prefixMutatesWardFollowerCount,
      count: () => countAlliedFollowers(player, unit => hasWorldsBeyondKeyword(unit, "Ward"))
    },
    {
      label: "allied high-cost followers",
      pattern: /\bX is the number of allied followers on the field with a base cost of\s+(\d+)\s+or more\s*\.?/i,
      blocked: prefixMutatesAlliedFollowers,
      count: match => countAlliedFollowers(player, unit => baseCardCost(unit) >= Number(match[1] ?? 0))
    },
    {
      label: "other allied cards",
      pattern: /\bX is the number of other allied cards on the field\s*\.?/i,
      blocked: prefixMutatesAlliedCards,
      count: () => (player?.board ?? []).filter(item => item?.instanceId !== source?.instanceId).length
    },
    {
      label: "other allied followers",
      pattern: /\bX is the number of other allied followers on the field\s*\.?/i,
      blocked: prefixMutatesAlliedFollowers,
      count: () => countAlliedFollowers(player, null, source?.instanceId ?? null)
    },
    {
      label: "allied followers",
      pattern: /\bX is the number of allied followers on the field\s*\.?/i,
      blocked: prefixMutatesAlliedFollowers,
      count: () => countAlliedFollowers(player)
    },
    {
      label: "Neutral cards in hand",
      pattern: /\bX is the number of Neutral cards in your hand\s*\.?/i,
      blocked: prefixMutatesHand,
      count: () => (player?.hand ?? []).filter(item => cardClass(item) === "neutral").length
    },
    {
      label: "Pixie followers in hand",
      pattern: /\bX is the number of Pixie followers in your hand\s*\.?/i,
      blocked: prefixMutatesHand,
      count: () => (player?.hand ?? []).filter(item => cardType(item) === "follower" && hasCardTrait(item, "Pixie")).length
    },
    {
      label: "amulets in hand",
      pattern: /\bX is the number of amulets in your hand\s*\.?/i,
      blocked: prefixMutatesHand,
      count: () => (player?.hand ?? []).filter(item => cardType(item) === "amulet").length
    },
    {
      label: "cards in hand",
      pattern: /\bX is the number of cards in your hand\s*\.?/i,
      blocked: prefixMutatesHand,
      count: () => (player?.hand ?? []).filter(Boolean).length
    }
  ];

  for (const definition of definitions) {
    const match = definition.pattern.exec(value);
    if (!match) continue;
    const prefix = value.slice(0, match.index);
    if (definition.blocked(prefix)) return null;
    const count = Math.max(0, Number(definition.count(match)) || 0);
    const withoutDefinition = `${value.slice(0, match.index)} ${value.slice(match.index + match[0].length)}`;
    return {
      label: definition.label,
      value: count,
      text: normalizeResolvedText(withoutDefinition.replace(/\bX\b/g, String(count)))
    };
  }
  return null;
}

function prefixMutatesHand(prefix) {
  const value = String(prefix ?? "");
  return /\bdraw\b|\bdiscard\b|\bfuse\b|\badd\b[^.]*\bto your hand\b|\breturn\b[^.]*\bto (?:your )?deck\b|\bbanish\b[^.]*\bfrom your hand\b|\btransform\b[^.]*\bin your hand\b/i.test(value);
}

function prefixMutatesAlliedCards(prefix) {
  const value = String(prefix ?? "");
  return prefixMutatesAlliedFollowers(value)
    || /\b(?:destroy|banish|return|transform)\b[^.]*\ballied (?:cards?|amulets?)\b/i.test(value);
}

function prefixMutatesAlliedFollowers(prefix) {
  const value = String(prefix ?? "");
  return /\bsummon\b|\b(?:destroy|banish|return|transform)\b[^.]*\ballied followers?\b|\bevolve\b[^.]*\ballied followers?\b/i.test(value);
}

function prefixMutatesFollowerEntryHistory(prefix) {
  return /\b(?:summon|reanimate)\b/i.test(String(prefix ?? ""));
}

function prefixMutatesWardFollowerCount(prefix) {
  const value = String(prefix ?? "");
  return prefixMutatesAlliedFollowers(value) || /\b(?:give|remove)\b[^.]*\bWard\b/i.test(value);
}

function prefixMutatesEarthSigils(prefix) {
  return /\bEarth Rite\b|\bgain\b[^.]*\bearth sigils?\b|\b(?:spend|consume|remove)\b[^.]*\bearth sigils?\b/i.test(String(prefix ?? ""));
}

function countAlliedFollowers(player, predicate = null, excludeInstanceId = null) {
  return (player?.board ?? []).filter(item =>
    cardType(item) === "follower"
    && item?.instanceId !== excludeInstanceId
    && (!predicate || predicate(item))
  ).length;
}

function baseCardCost(instance) {
  return Math.max(0, Number(instance?.card?.cost ?? instance?.baseCost ?? instance?.cost ?? 0) || 0);
}

function countAlliedAmulets(player) {
  return (player?.board ?? []).filter(item => cardType(item) === "amulet").length;
}

function deckHasNoDuplicates(player) {
  const seen = new Set();
  for (const instance of player?.deck ?? []) {
    const card = instance?.card ?? instance;
    const identity = instance?.cardId ?? card?.id ?? card?.cardId ?? card?.name;
    const key = String(identity ?? "").trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function hasCardTrait(instance, trait) {
  const expected = String(trait ?? "").trim().toLowerCase();
  if (!expected) return false;
  const traits = instance?.card?.traits ?? instance?.traits ?? [];
  return Array.isArray(traits)
    && traits.some(value => String(value ?? "").trim().toLowerCase() === expected);
}

function cardClass(instance) {
  return String(instance?.card?.class ?? instance?.card?.className ?? instance?.class ?? instance?.className ?? "").trim().toLowerCase();
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
  if (branchActive) {
    const replacement = replaceConditionalInstead(prefix, conditionalEffect);
    if (replacement) return replacement;
  }

  const repeat = parseRepeatedAction(prefix);
  if (repeat) {
    const overrideCount = branchActive ? parseRepeatOverride(conditionalEffect) : null;
    if (!branchActive || overrideCount != null) {
      return expandRepeatedAction(repeat, overrideCount ?? repeat.count);
    }
  }
  return branchActive ? joinResolvedSegments(prefix, conditionalEffect) : keepUnconditionalPrefix(prefix);
}

function replaceConditionalInstead(prefix, conditionalEffect) {
  const effect = normalizeResolvedText(conditionalEffect);
  if (!/^deal damage to all enemy followers instead\.?$/i.test(effect)) return null;

  const value = String(prefix ?? "");
  const matches = [...value.matchAll(/\bselect an enemy follower(?: on the field)? and deal it\s+(\d+)\s+damage\s*\.?/gi)];
  const hit = matches.at(-1);
  if (!hit || hit.index == null) return null;

  const amount = Math.max(0, Number(hit[1]) || 0);
  const replacement = `Deal ${amount} damage to all enemy followers.`;
  return normalizeResolvedText(`${value.slice(0, hit.index)}${replacement}${value.slice(hit.index + hit[0].length)}`);
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
