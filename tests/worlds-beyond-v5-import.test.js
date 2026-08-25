import test from "node:test";
import assert from "node:assert/strict";
import { createStats, costOf } from "../src/core/rulesets/svwb/v5/battle-engine-v5-state.js";
import { classMechanicStatus } from "../src/core/rulesets/svwb/v5/battle-class-mechanics.js";

test("vendored Battle Engine V5 state helpers remain importable", () => {
  const stats = createStats();
  assert.deepEqual(stats.evolutions, [0, 0]);
  assert.deepEqual(stats.superEvolutions, [0, 0]);
  const card = { cost: 5, text: "On Spellboost: subtract 1 from this card's cost.", class: "Runecraft", keywords: ["On Spellboost"] };
  assert.equal(costOf({ card, spellboost: 2 }), 3);
});

test("vendored V5 class mechanics preserve current WB class resources", () => {
  assert.deepEqual(classMechanicStatus({ className: "Abysscraft", shadows: 7 }), [{ key: "necromancy", label: "Shadows", value: 7 }]);
});
