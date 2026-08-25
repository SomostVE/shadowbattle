import test from "node:test";
import assert from "node:assert/strict";
import { AI_SKILL_PROFILES, chooseIntermediateAction, getAiSkillProfile } from "../src/ai/skill-profile.js";

test("intermediate profile keeps a bounded search budget", () => {
  const profile = getAiSkillProfile("intermediate");
  assert.equal(profile.maxDepth, 2);
  assert.ok(profile.beamWidth > 1 && profile.beamWidth <= 8);
  assert.ok(profile.nearBestWindow > 0);
  assert.ok(profile.hiddenInformationSamples > 1);
});

test("intermediate selection never picks illegal actions", () => {
  const chosen = chooseIntermediateAction([
    { id: "illegal", legal: false, score: 999 },
    { id: "legal", legal: true, score: 4 }
  ], { rng: () => 0, profile: AI_SKILL_PROFILES.intermediate });
  assert.equal(chosen.id, "legal");
});

test("intermediate selection refuses clearly inferior lines", () => {
  const chosen = chooseIntermediateAction([
    { id: "best", legal: true, score: 10 },
    { id: "close", legal: true, score: 9.6 },
    { id: "bad", legal: true, score: 7 }
  ], { rng: () => 0.999, profile: AI_SKILL_PROFILES.intermediate });
  assert.notEqual(chosen.id, "bad");
});
