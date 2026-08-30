import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { getSimpleWorldsBeyondModeChoices } from "../src/core/rulesets/svwb/mode-selection.js";
import { baseText, section } from "../src/core/rulesets/svwb/v5/battle-engine-v5-text.js";

const response = await fetch("https://raw.githubusercontent.com/SomostVE/beyond_codex/main/api/v1/cards.json", { cache: "no-store" });
if (!response.ok) throw new Error(`Codex fetch failed: ${response.status}`);
const cards = (await response.json()).filter(card => Number(card.setId) === 10000);
const triggers = ["play", "evolve", "super-evolve", "last-words", "strike", "engage", "turn-start", "turn-end"];
const unsupported = [];

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
    for (const result of results) {
      if (result.supported) continue;
      unsupported.push({ id: card.id, name: card.name, class: card.class, trigger, residual: normalizeResidual(result.residual || result.text), text: result.text });
      break;
    }
  }
}

console.log(`Basic cards: ${cards.length}`);
console.log(`Unsupported trigger sections: ${unsupported.length}`);
for (const row of unsupported) {
  console.log(`- ${row.class} / ${row.trigger} / ${row.name} (${row.id})`);
  console.log(`  residual: ${row.residual}`);
  console.log(`  text: ${row.text}`);
}

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
    resources: { pp: 10, maxPp: 10, shadows: 30, rally: 30, earthSigils: 30, evolutionPoints: 2, superEvolutionPoints: 2, evolutionAvailable: true, superEvolutionAvailable: true, crests: [] }
  };
}

function normalizeResidual(value) {
  return String(value ?? "").replace(/[’‘]/g, "'").replace(/\b\d+\b/g, "#").replace(/\s+/g, " ").trim().slice(0, 300);
}
