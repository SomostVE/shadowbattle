import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

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
    const result = getWorldsBeyondTriggerSupport(source, trigger, null, player);
    if (!result.text && !result.residual) continue;
    const key = `${card.class}:${trigger}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
    if (result.supported) {
      supportedByClass.set(key, (supportedByClass.get(key) ?? 0) + 1);
      continue;
    }
    unsupported.push({
      id: card.id,
      name: card.name,
      class: card.class,
      trigger,
      residual: normalizeResidual(result.residual || result.text),
      text: result.text
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
