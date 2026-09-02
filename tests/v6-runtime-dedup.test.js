import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function read(path) {
  return fs.readFile(new URL(path, root), "utf8");
}

const sharedCardTypeModules = [
  "src/core/rulesets/svwb/engage.js",
  "src/core/rulesets/svwb/lifecycle.js",
  "src/core/rulesets/svwb/event-reactions.js",
  "src/core/rulesets/svwb/artifact-hand-copy.js",
  "src/core/rulesets/svwb/forest-crest-effects.js",
  "src/core/rulesets/svwb/combat-readiness.js",
  "src/core/rulesets/svwb/crest-effects.js",
  "src/core/rulesets/svwb/discard-reactions.js"
];

const effectiveCardTypeModules = [
  "src/core/rulesets/svwb/amulets.js",
  "src/core/rulesets/svwb/optional-allied-card.js",
  "src/core/rulesets/svwb/all-followers-count-x.js"
];

test("V6 modules reuse shared printed card-type state instead of local copies", async () => {
  for (const path of sharedCardTypeModules) {
    const source = await read(path);
    assert.match(source, /from "\.\/runtime-card-state\.js"/i, path);
    assert.match(source, /\bcardType\b/, path);
    assert.doesNotMatch(source, /function\s+cardType\s*\(/, path);
  }
});

test("V6 override-aware modules reuse effectiveCardType", async () => {
  for (const path of effectiveCardTypeModules) {
    const source = await read(path);
    assert.match(source, /\beffectiveCardType\b/, path);
    assert.match(source, /from "\.\/runtime-card-state\.js"/i, path);
    assert.doesNotMatch(source, /function\s+cardType\s*\(/, path);
  }
});

test("shared live attack and defense helpers replace only identical fallbacks", async () => {
  const crestEffects = await read("src/core/rulesets/svwb/crest-effects.js");
  const discardReactions = await read("src/core/rulesets/svwb/discard-reactions.js");

  assert.match(crestEffects, /import \{ cardType, currentAttack \} from "\.\/runtime-card-state\.js"/);
  assert.doesNotMatch(crestEffects, /function\s+currentAttack\s*\(/);

  assert.match(discardReactions, /import \{ cardType, currentAttack, currentDefense \} from "\.\/runtime-card-state\.js"/);
  assert.doesNotMatch(discardReactions, /function\s+currentAttack\s*\(/);
  assert.doesNotMatch(discardReactions, /function\s+currentDefense\s*\(/);
  assert.match(discardReactions, /function\s+currentMaxDefense\s*\(/);
});
