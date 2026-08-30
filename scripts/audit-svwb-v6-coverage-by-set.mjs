import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { getSimpleWorldsBeyondModeChoices } from "../src/core/rulesets/svwb/mode-selection.js";
import { baseText, section } from "../src/core/rulesets/svwb/v5/battle-engine-v5-text.js";

const CODEX_URL = process.env.SVWB_CODEX_URL ?? "https://raw.githubusercontent.com/SomostVE/beyond_codex/main/api/v1/cards.json";
const META_URL = process.env.SVWB_META_URL ?? "https://raw.githubusercontent.com/SomostVE/beyond_codex/main/api/v1/metadata.json";
const triggers = ["play", "evolve", "super-evolve", "last-words", "strike", "engage", "turn-start", "turn-end"];

const [cardsResponse, metaResponse] = await Promise.all([
  fetch(CODEX_URL, { cache: "no-store" }),
  fetch(META_URL, { cache: "no-store" })
]);
if (!cardsResponse.ok) throw new Error(`Codex fetch failed: ${cardsResponse.status}`);
if (!metaResponse.ok) throw new Error(`Metadata fetch failed: ${metaResponse.status}`);
const cards = await cardsResponse.json();
const metadata = await metaResponse.json();
if (!Array.isArray(cards)) throw new Error("Codex cards endpoint did not return an array");

const duplicateIds = [...new Set(cards.map(card => card.id).filter((id, index, all) => all.indexOf(id) !== index))];
const knownSets = Object.entries(metadata.sets ?? {}).map(([id, name]) => ({ id: Number(id), name }));
const knownSetIds = new Set(knownSets.map(row => row.id));
const unknownSetIds = [...new Set(cards.map(card => Number(card.setId)).filter(id => !knownSetIds.has(id)))].sort((a, b) => a - b);

console.log(`SVWB set-by-set structural audit: ${cards.length} cards`);
console.log(`Metadata source count: ${metadata.sourceCount ?? metadata.count ?? "?"}`);
console.log(`Duplicate card IDs: ${duplicateIds.length}${duplicateIds.length ? ` (${duplicateIds.join(", ")})` : ""}`);
console.log(`Non-main set IDs: ${unknownSetIds.length ? unknownSetIds.join(", ") : "none"}`);

let grandSections = 0;
let grandSupported = 0;
let grandUnsupported = 0;

for (const set of knownSets) {
  const setCards = cards.filter(card => Number(card.setId) === set.id);
  const rows = [];
  const triggerTotals = new Map();
  const triggerSupported = new Map();
  let cardsWithTriggers = 0;
  let fullySupportedCards = 0;
  let unsupportedCards = 0;

  for (const card of setCards) {
    const player = permissivePlayer(card.class);
    const source = {
      instanceId: `audit:${card.id}`,
      owner: 0,
      cardId: card.id,
      card,
      spellboost: 20,
      x: 20,
      attack: Number(card.attack ?? 0),
      defense: Number(card.defense ?? 0),
      maxDefense: Number(card.defense ?? 0)
    };
    let cardSections = 0;
    let cardUnsupported = 0;

    for (const trigger of triggers) {
      const results = auditTriggerResults(source, trigger, player);
      if (!results.some(result => result.text || result.residual)) continue;
      cardSections += 1;
      triggerTotals.set(trigger, (triggerTotals.get(trigger) ?? 0) + 1);
      const supported = results.length && results.every(result => result.supported);
      if (supported) {
        triggerSupported.set(trigger, (triggerSupported.get(trigger) ?? 0) + 1);
        continue;
      }
      cardUnsupported += 1;
      const failed = results.find(result => !result.supported) ?? results[0];
      rows.push({
        id: card.id,
        name: card.name,
        class: card.class,
        trigger,
        residual: normalizeResidual(failed?.residual || failed?.text)
      });
    }

    if (cardSections) {
      cardsWithTriggers += 1;
      if (cardUnsupported) unsupportedCards += 1;
      else fullySupportedCards += 1;
    }
  }

  const sections = [...triggerTotals.values()].reduce((sum, value) => sum + value, 0);
  const supportedSections = [...triggerSupported.values()].reduce((sum, value) => sum + value, 0);
  const unsupportedSections = sections - supportedSections;
  grandSections += sections;
  grandSupported += supportedSections;
  grandUnsupported += unsupportedSections;

  console.log(`\n=== ${set.id} ${set.name} ===`);
  console.log(`Cards: ${setCards.length} | deck-selectable: ${setCards.filter(card => !card.token).length} | tokens/generated: ${setCards.filter(card => card.token).length}`);
  console.log(`Cards with audited triggers: ${cardsWithTriggers} | fully covered: ${fullySupportedCards} | with unsupported sections: ${unsupportedCards}`);
  console.log(`Trigger sections: ${supportedSections}/${sections} supported (${sections ? (supportedSections / sections * 100).toFixed(1) : "100.0"}%) | unsupported: ${unsupportedSections}`);
  console.log("By trigger:");
  for (const trigger of triggers) {
    const total = triggerTotals.get(trigger) ?? 0;
    if (!total) continue;
    const supported = triggerSupported.get(trigger) ?? 0;
    console.log(`  ${trigger.padEnd(12)} ${String(supported).padStart(3)}/${String(total).padEnd(3)} ${(supported / total * 100).toFixed(1)}%`);
  }

  if (!rows.length) {
    console.log("Unsupported residuals: none");
    continue;
  }

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.class}|${row.trigger}|${row.residual}`;
    const group = groups.get(key) ?? { class: row.class, trigger: row.trigger, residual: row.residual, count: 0, examples: [] };
    group.count += 1;
    if (group.examples.length < 4) group.examples.push(`${row.name} (${row.id})`);
    groups.set(key, group);
  }
  console.log("Top unsupported residuals:");
  for (const group of [...groups.values()].sort((a, b) => b.count - a.count || a.residual.localeCompare(b.residual)).slice(0, 12)) {
    console.log(`  [${String(group.count).padStart(2)}] ${group.class} / ${group.trigger}: ${group.residual}`);
    console.log(`       ${group.examples.join(" | ")}`);
  }
}

console.log(`\n=== MAIN SET TOTAL ===`);
console.log(`Trigger sections: ${grandSupported}/${grandSections} supported (${grandSections ? (grandSupported / grandSections * 100).toFixed(1) : "100.0"}%) | unsupported: ${grandUnsupported}`);

function auditTriggerResults(source, trigger, player) {
  const choices = auditModeChoices(source, trigger, player);
  if (!choices.length) return [getWorldsBeyondTriggerSupport(source, trigger, null, player)];
  if (trigger === "play") return choices.map(mode => getWorldsBeyondTriggerSupport(source, trigger, mode, player));
  return choices.map(mode => getWorldsBeyondTriggerSupport(modeSource(source, trigger, mode), trigger, null, player));
}

function auditModeChoices(source, trigger, player) {
  const text = String(source?.card?.text ?? "");
  if (trigger === "play") return getSimpleWorldsBeyondModeChoices(baseText(text), player);
  if (trigger !== "evolve" && trigger !== "super-evolve") return [];
  let triggerText = section(text, trigger);
  if (/replicate the effects? of this card'?s fanfare ability/i.test(triggerText)) triggerText = baseText(text);
  return getSimpleWorldsBeyondModeChoices(triggerText, player);
}

function modeSource(source, trigger, mode) {
  const label = trigger === "super-evolve" ? "Super-Evolve" : "Evolve";
  return { ...source, activeText: `${label}: ${mode.text}` };
}

function permissivePlayer(className) {
  return {
    index: 0,
    className,
    hp: 20,
    maxHp: 20,
    hand: [],
    board: [],
    cardsPlayedThisTurn: 30,
    spellsPlayedThisTurn: 30,
    resources: {
      pp: 10,
      maxPp: 10,
      shadows: 30,
      rally: 30,
      earthSigils: 30,
      evolutionPoints: 2,
      superEvolutionPoints: 2,
      evolutionAvailable: true,
      superEvolutionAvailable: true,
      crests: []
    }
  };
}

function normalizeResidual(value) {
  return String(value ?? "")
    .replace(/[’‘]/g, "'")
    .replace(/\b\d+\b/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}
