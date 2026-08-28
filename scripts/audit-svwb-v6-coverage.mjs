import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { getSimpleWorldsBeyondModeChoices } from "../src/core/rulesets/svwb/mode-selection.js";
import { baseText, section } from "../src/core/rulesets/svwb/v5/battle-engine-v5-text.js";

// Structural audit only: semantic correctness is still enforced by card-level tests.
const CODEX_URL = process.env.SVWB_CODEX_URL ?? "https://raw.githubusercontent.com/SomostVE/beyond_codex/main/api/v1/cards.json";
const triggers = ["play", "evolve", "super-evolve", "last-words", "strike", "engage", "turn-start", "turn-end"];

const response = await fetch(CODEX_URL, { cache: "no-store" });
if (!response.ok) throw new Error(`Codex fetch failed: ${response.status}`);
const cards = await response.json();
if (!Array.isArray(cards)) throw new Error("Codex cards endpoint did not return an array");

const unsupported = [];
const totals = new Map();
const supportedByClass = new Map();

for (const card of cards) {
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

  for (const trigger of triggers) {
    const results = auditTriggerResults(source, trigger, player);
    if (!results.some(result => result.text || result.residual)) continue;
    const key = `${card.class}:${trigger}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
    if (results.length && results.every(result => result.supported)) {
      supportedByClass.set(key, (supportedByClass.get(key) ?? 0) + 1);
      continue;
    }
    const failed = results.find(result => !result.supported) ?? results[0];
    unsupported.push({
      id: card.id,
      name: card.name,
      class: card.class,
      trigger,
      residual: normalizeResidual(failed?.residual || failed?.text),
      text: results.map(result => result.text).filter(Boolean).join(" || ")
    });
  }
}

const groups = new Map();
for (const row of unsupported) {
  const key = `${row.class}|${row.trigger}|${row.residual}`;
  const group = groups.get(key) ?? { class: row.class, trigger: row.trigger, residual: row.residual, count: 0, examples: [] };
  group.count += 1;
  if (group.examples.length < 5) group.examples.push(`${row.name} (${row.id})`);
  groups.set(key, group);
}

const summary = [...totals.entries()].map(([key, total]) => {
  const split = key.lastIndexOf(":");
  const className = key.slice(0, split);
  const trigger = key.slice(split + 1);
  const supported = supportedByClass.get(key) ?? 0;
  return { className, trigger, supported, total, percent: total ? Math.round(supported / total * 1000) / 10 : 100 };
}).sort((a, b) => a.className.localeCompare(b.className) || a.trigger.localeCompare(b.trigger));

console.log(`SVWB structural trigger audit: ${cards.length} cards`);
console.log(`Unsupported trigger sections: ${unsupported.length}`);
console.log("\nCoverage by class / trigger:");
for (const row of summary) console.log(`${row.className.padEnd(12)} ${row.trigger.padEnd(12)} ${String(row.supported).padStart(3)}/${String(row.total).padEnd(3)} ${row.percent.toFixed(1)}%`);

console.log("\nTop unsupported residual families:");
for (const group of [...groups.values()].sort((a, b) => b.count - a.count || a.residual.localeCompare(b.residual)).slice(0, 80)) {
  console.log(`[${String(group.count).padStart(3)}] ${group.class} / ${group.trigger}: ${group.residual}`);
  console.log(`      ${group.examples.join(" | ")}`);
}

if (process.argv.includes("--fail-on-unsupported") && unsupported.length) process.exitCode = 1;

function auditTriggerResults(source, trigger, player) {
  const choices = auditModeChoices(source, trigger, player);
  if (!choices.length) return [getWorldsBeyondTriggerSupport(source, trigger, null, player)];

  if (trigger === "play") {
    return choices.map(mode => getWorldsBeyondTriggerSupport(source, trigger, mode, player));
  }

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
    .slice(0, 220);
}
