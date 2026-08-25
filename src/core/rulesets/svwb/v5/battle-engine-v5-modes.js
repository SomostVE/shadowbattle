import { costOf } from "./battle-engine-v5-state.js";
import { hasCrest } from "./battle-engine-v5-crests.js";
import { expandModes, baseText, crystallizeText, section } from "./battle-engine-v5-text.js";

export function modes(inst, player) {
  const card = inst.card;
  const text = String(card.text ?? "");
  if (/\bcan'?t be played\b/i.test(text)) return [];
  const base = costOf(inst);
  const out = [];
  const canUseFieldSlot = card.type === "Spell" || player.board.length < 5;
  const milteoSuppressesEntryAbilities = card.type === "Follower" && hasCrest(player, "Milteo & Luzen");
  const enhance = [...text.matchAll(/Enhance\s*\(?\s*(\d+)\s*\)?\s*:/gi)]
    .map(match => Number(match[1]))
    .filter(cost => cost <= player.pp)
    .sort((a,b)=>b-a);
  if (enhance.length && !milteoSuppressesEntryAbilities) {
    if (!canUseFieldSlot) return out;
    const cost = enhance[0];
    const enhancedText = [baseText(text), section(text, `enhance ${cost}`)].filter(Boolean).join(" ");
    for (const choice of expandModes(enhancedText, player)) out.push({ kind: choice.i ? "mode" : "enhance", cost, text: choice.text, modeIndex: choice.i, selectedModeCount: choice.selectedModeCount ?? 0, selectedModeIndices: [...(choice.selectedModeIndices ?? [])], scoreBonus: 5, enhanced: true });
    return out;
  }

  if (base <= player.pp) {
    if (canUseFieldSlot) {
      for (const choice of expandModes(baseText(text), player)) out.push({ kind: choice.i ? "mode" : "base", cost: base, text: choice.text, modeIndex: choice.i, selectedModeCount: choice.selectedModeCount ?? 0, selectedModeIndices: [...(choice.selectedModeIndices ?? [])], scoreBonus: 0 });
    }
    return out;
  }

  const crystallizeCosts = [...text.matchAll(/Crystallize\s*\(?\s*(\d+)\s*\)?\s*:?/gi)]
    .map(match => Number(match[1]))
    .filter(cost => cost <= player.pp);
  const accelerateCosts = [...text.matchAll(/Accelerate\s*\(?\s*(\d+)\s*\)?\s*:/gi)]
    .map(match => Number(match[1]))
    .filter(cost => cost <= player.pp);
  const highestAlternativeCost = Math.max(-1, ...crystallizeCosts, ...accelerateCosts);
  if (highestAlternativeCost < 0) return out;

  if (player.board.length < 5 && crystallizeCosts.includes(highestAlternativeCost)) {
    out.push({ kind: "crystallize", cost: highestAlternativeCost, text: crystallizeText(text, highestAlternativeCost), modeIndex: 0, selectedModeCount: 0, selectedModeIndices: [], scoreBonus: 5, crystallized: true });
  }
  if (accelerateCosts.includes(highestAlternativeCost)) {
    for (const choice of expandModes(section(text, `accelerate ${highestAlternativeCost}`), player)) {
      out.push({ kind: choice.i ? "mode" : "accelerate", cost: highestAlternativeCost, text: choice.text, modeIndex: choice.i, selectedModeCount: choice.selectedModeCount ?? 0, selectedModeIndices: [...(choice.selectedModeIndices ?? [])], scoreBonus: 4, accelerated: true });
    }
  }
  return out;
}
