import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, text) { fs.writeFileSync(path, text); }

function replaceExact(text, oldValue, newValue, label) {
  if (text.includes(newValue) && !text.includes(oldValue)) return text;
  const count = text.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one old block, found ${count}`);
  return text.replace(oldValue, newValue);
}

function migrateEffectiveType(path, importAnchor, importLine) {
  let text = read(path);
  text = replaceExact(text, importAnchor, `${importAnchor}${importLine}`, `${path} import`);
  const local = `\nfunction cardType(instance) {\n  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();\n}\n`;
  if (text.includes(local)) text = text.replace(local, "\n");
  else if (/function\s+cardType\s*\(/.test(text)) throw new Error(`${path}: unexpected local cardType shape`);
  text = text.replace(/\bcardType\(/g, "effectiveCardType(");
  write(path, text);
}

migrateEffectiveType(
  "src/core/rulesets/svwb/class-conditions.js",
  `import { hasWorldsBeyondKeyword } from "./combat-readiness.js";\n`,
  `import { effectiveCardType } from "./runtime-card-state.js";\n`
);

migrateEffectiveType(
  "src/core/rulesets/svwb/generic-effects.js",
  `import { resolveEffectCommands } from "../../effect-commands.js";\n`,
  `import { currentAttack, currentDefense, currentMaxDefense, effectiveCardType } from "./runtime-card-state.js";\n`
);

migrateEffectiveType(
  "src/core/rulesets/svwb/effect-resolver.js",
  `import { evaluateWorldsBeyondClassCondition } from "./class-conditions.js";\n`,
  `import { effectiveCardType } from "./runtime-card-state.js";\n`
);

{
  const path = "src/core/rulesets/svwb/generic-effects.js";
  let text = read(path);
  const blocks = [
    `\nfunction currentAttack(instance) {\n  return Number(instance?.attack ?? (Number(instance?.card?.attack ?? 0) + Number(instance?.attackBonus ?? 0)));\n}\n`,
    `\nfunction currentDefense(instance) {\n  return Number(instance?.defense ?? (Number(instance?.card?.defense ?? 0) + Number(instance?.defenseBonus ?? 0)));\n}\n`,
    `\nfunction currentMaxDefense(instance) {\n  return Number(instance?.maxDefense ?? currentDefense(instance));\n}\n`
  ];
  for (const block of blocks) {
    if (text.includes(block)) text = text.replace(block, "\n");
  }
  for (const helper of ["currentAttack", "currentDefense", "currentMaxDefense"]) {
    if (new RegExp(`function\\s+${helper}\\s*\\(`).test(text)) throw new Error(`${path}: local ${helper} remains`);
  }
  write(path, text);
}

{
  const path = "tests/v6-runtime-dedup.test.js";
  let text = read(path);
  const oldList = `const effectiveCardTypeModules = [\n  "src/core/rulesets/svwb/amulets.js",\n  "src/core/rulesets/svwb/optional-allied-card.js",\n  "src/core/rulesets/svwb/all-followers-count-x.js"\n];`;
  const newList = `const effectiveCardTypeModules = [\n  "src/core/rulesets/svwb/amulets.js",\n  "src/core/rulesets/svwb/optional-allied-card.js",\n  "src/core/rulesets/svwb/all-followers-count-x.js",\n  "src/core/rulesets/svwb/class-conditions.js",\n  "src/core/rulesets/svwb/generic-effects.js",\n  "src/core/rulesets/svwb/effect-resolver.js"\n];`;
  text = replaceExact(text, oldList, newList, "effective card type inventory");
  const anchor = `  assert.doesNotMatch(discardReactions, /function\\s+currentDefense\\s*\\(/);\n});`;
  const extended = `  assert.doesNotMatch(discardReactions, /function\\s+currentDefense\\s*\\(/);\n\n  const genericEffects = await read("src/core/rulesets/svwb/generic-effects.js");\n  for (const helper of ["currentAttack", "currentDefense", "currentMaxDefense"]) {\n    assert.match(genericEffects, new RegExp("\\\\b" + helper + "\\\\b"), helper);\n    assert.doesNotMatch(genericEffects, new RegExp("function\\\\s+" + helper + "\\\\s*\\\\("), helper);\n  }\n  assert.match(genericEffects, /from "\\.\\/runtime-card-state\\.js"/);\n});`;
  text = replaceExact(text, anchor, extended, "generic runtime stat regression");
  write(path, text);
}

console.log("0.5.77 guarded runtime dedup migration applied.");
