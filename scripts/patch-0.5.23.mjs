import fs from "node:fs";

const path = "src/core/rulesets/svwb/class-conditions.js";
let source = fs.readFileSync(path, "utf8");

const definitionMarker = `    {
      label: "amulets in hand",
      pattern: /\\bX is the number of amulets in your hand\\s*\\.?/i,
      blocked: prefixMutatesHand,
      count: () => (player?.hand ?? []).filter(item => cardType(item) === "amulet").length
    },`;
const definitionInsert = `    {
      label: "Pixie followers in hand",
      pattern: /\\bX is the number of Pixie followers in your hand\\s*\\.?/i,
      blocked: prefixMutatesHand,
      count: () => (player?.hand ?? []).filter(item => cardType(item) === "follower" && hasCardTrait(item, "Pixie")).length
    },\n${definitionMarker}`;

if ((source.split(definitionMarker).length - 1) !== 1) {
  throw new Error("Expected exactly one amulets-in-hand definition marker");
}
source = source.replace(definitionMarker, definitionInsert);

const helperMarker = `function cardType(instance) {
  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}`;
const helperInsert = `function hasCardTrait(instance, trait) {
  const expected = String(trait ?? "").trim().toLowerCase();
  if (!expected) return false;
  const traits = instance?.card?.traits ?? instance?.traits ?? [];
  return Array.isArray(traits)
    && traits.some(value => String(value ?? "").trim().toLowerCase() === expected);
}\n\n${helperMarker}`;

if ((source.split(helperMarker).length - 1) !== 1) {
  throw new Error("Expected exactly one cardType helper marker");
}
source = source.replace(helperMarker, helperInsert);

fs.writeFileSync(path, source);
