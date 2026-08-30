import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { getSimpleWorldsBeyondModeChoices } from "../src/core/rulesets/svwb/mode-selection.js";
import { baseText, section } from "../src/core/rulesets/svwb/v5/battle-engine-v5-text.js";

const cards = await (await fetch("https://raw.githubusercontent.com/SomostVE/beyond_codex/main/api/v1/cards.json", { cache: "no-store" })).json();
const triggers = ["play", "evolve", "super-evolve", "last-words", "strike", "engage", "turn-start", "turn-end"];
const setCards = cards.filter(card => Number(card.setId) === 90000);
const totals = new Map();
const supportedTotals = new Map();
const unsupportedRows = [];
let cardsWithTriggers = 0;
let fullyCovered = 0;
let unsupportedCards = 0;

for (const card of setCards) {
  const player = permissivePlayer(card.class);
  const source = { instanceId: `audit:${card.id}`, owner: 0, cardId: card.id, card, spellboost: 20, x: 20, attack: Number(card.attack ?? 0), defense: Number(card.defense ?? 0), maxDefense: Number(card.defense ?? 0) };
  let sections = 0;
  let failures = 0;
  for (const trigger of triggers) {
    const results = auditTriggerResults(source, trigger, player);
    if (!results.some(result => result.text || result.residual)) continue;
    sections += 1;
    totals.set(trigger, (totals.get(trigger) ?? 0) + 1);
    if (results.length && results.every(result => result.supported)) {
      supportedTotals.set(trigger, (supportedTotals.get(trigger) ?? 0) + 1);
    } else {
      failures += 1;
      const failed = results.find(result => !result.supported) ?? results[0];
      unsupportedRows.push({ name: card.name, id: card.id, class: card.class, trigger, residual: normalizeResidual(failed?.residual || failed?.text) });
    }
  }
  if (sections) {
    cardsWithTriggers += 1;
    if (failures) unsupportedCards += 1;
    else fullyCovered += 1;
  }
}

const sectionCount = [...totals.values()].reduce((a,b) => a+b, 0);
const supportedCount = [...supportedTotals.values()].reduce((a,b) => a+b, 0);
console.log("=== 90000 Generated / Token cards ===");
console.log(`Cards: ${setCards.length} | tokens: ${setCards.filter(card => card.token).length} | non-token: ${setCards.filter(card => !card.token).length}`);
console.log(`Cards with audited triggers: ${cardsWithTriggers} | fully covered: ${fullyCovered} | with unsupported sections: ${unsupportedCards}`);
console.log(`Trigger sections: ${supportedCount}/${sectionCount} supported (${sectionCount ? (supportedCount/sectionCount*100).toFixed(1) : "100.0"}%) | unsupported: ${sectionCount-supportedCount}`);
for (const trigger of triggers) {
  const total = totals.get(trigger) ?? 0;
  if (!total) continue;
  const supported = supportedTotals.get(trigger) ?? 0;
  console.log(`  ${trigger.padEnd(12)} ${supported}/${total} ${(supported/total*100).toFixed(1)}%`);
}
const groups = new Map();
for (const row of unsupportedRows) {
  const key = `${row.class}|${row.trigger}|${row.residual}`;
  const group = groups.get(key) ?? { ...row, count: 0, examples: [] };
  group.count += 1;
  if (group.examples.length < 5) group.examples.push(`${row.name} (${row.id})`);
  groups.set(key, group);
}
console.log("Top unsupported residuals:");
for (const group of [...groups.values()].sort((a,b) => b.count-a.count || a.residual.localeCompare(b.residual)).slice(0,20)) {
  console.log(`  [${group.count}] ${group.class} / ${group.trigger}: ${group.residual}`);
  console.log(`      ${group.examples.join(" | ")}`);
}

function auditTriggerResults(source, trigger, player) {
  const choices = auditModeChoices(source, trigger, player);
  if (!choices.length) return [getWorldsBeyondTriggerSupport(source, trigger, null, player)];
  if (trigger === "play") return choices.map(mode => getWorldsBeyondTriggerSupport(source, trigger, mode, player));
  return choices.map(mode => getWorldsBeyondTriggerSupport({ ...source, activeText: `${trigger === "super-evolve" ? "Super-Evolve" : "Evolve"}: ${mode.text}` }, trigger, null, player));
}
function auditModeChoices(source, trigger, player) {
  const text = String(source?.card?.text ?? "");
  if (trigger === "play") return getSimpleWorldsBeyondModeChoices(baseText(text), player);
  if (trigger !== "evolve" && trigger !== "super-evolve") return [];
  let triggerText = section(text, trigger);
  if (/replicate the effects? of this card'?s fanfare ability/i.test(triggerText)) triggerText = baseText(text);
  return getSimpleWorldsBeyondModeChoices(triggerText, player);
}
function permissivePlayer(className) { return { index:0, className, hp:20, maxHp:20, hand:[], board:[], cardsPlayedThisTurn:30, spellsPlayedThisTurn:30, resources:{ pp:10, maxPp:10, shadows:30, rally:30, earthSigils:30, evolutionPoints:2, superEvolutionPoints:2, evolutionAvailable:true, superEvolutionAvailable:true, crests:[] } }; }
function normalizeResidual(value) { return String(value ?? "").replace(/[’‘]/g,"'").replace(/\b\d+\b/g,"#").replace(/\s+/g," ").trim().slice(0,180); }
