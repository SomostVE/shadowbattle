import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { assertWorldsBeyondMainActor } from "../src/core/rulesets/svwb/action-guards.js";
import {
  currentMaxDefense,
  currentMaxDefenseIgnoringDamage
} from "../src/core/rulesets/svwb/runtime-card-state.js";

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
  "src/core/rulesets/svwb/discard-reactions.js",
  "src/core/rulesets/svwb/action-resolver.js"
];

const effectiveCardTypeModules = [
  "src/core/rulesets/svwb/amulets.js",
  "src/core/rulesets/svwb/optional-allied-card.js",
  "src/core/rulesets/svwb/all-followers-count-x.js",
  "src/core/rulesets/svwb/class-conditions.js",
  "src/core/rulesets/svwb/generic-effects.js",
  "src/core/rulesets/svwb/effect-resolver.js"
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

test("shared live stat helpers replace only identical fallbacks", async () => {
  const crestEffects = await read("src/core/rulesets/svwb/crest-effects.js");
  const discardReactions = await read("src/core/rulesets/svwb/discard-reactions.js");
  const evolutionActions = await read("src/core/rulesets/svwb/evolution-actions.js");
  const actionResolver = await read("src/core/rulesets/svwb/action-resolver.js");

  assert.match(crestEffects, /from "\.\/runtime-card-state\.js"/);
  assert.doesNotMatch(crestEffects, /function\s+currentAttack\s*\(/);

  for (const [path, source] of [
    ["discard-reactions", discardReactions],
    ["evolution-actions", evolutionActions],
    ["action-resolver", actionResolver]
  ]) {
    assert.match(source, /currentMaxDefenseIgnoringDamage/, path);
    assert.match(source, /from "\.\/runtime-card-state\.js"/, path);
    assert.doesNotMatch(source, /function\s+currentAttack\s*\(/, path);
    assert.doesNotMatch(source, /function\s+currentMaxDefense\s*\(/, path);
  }
  assert.doesNotMatch(discardReactions, /function\s+currentDefense\s*\(/);

  const genericEffects = await read("src/core/rulesets/svwb/generic-effects.js");
  for (const helper of ["currentAttack", "currentDefense", "currentMaxDefense"]) {
    assert.match(genericEffects, new RegExp("\\b" + helper + "\\b"), helper);
    assert.doesNotMatch(genericEffects, new RegExp("function\\s+" + helper + "\\s*\\("), helper);
  }
  assert.match(genericEffects, /from "\.\/runtime-card-state\.js"/);
});

test("max-defense helpers keep live-defense and undamaged fallbacks distinct", () => {
  const damaged = {
    defense: 2,
    defenseBonus: 1,
    card: { defense: 5 }
  };
  assert.equal(currentMaxDefense(damaged), 2);
  assert.equal(currentMaxDefenseIgnoringDamage(damaged), 6);

  damaged.maxDefense = 8;
  assert.equal(currentMaxDefense(damaged), 8);
  assert.equal(currentMaxDefenseIgnoringDamage(damaged), 8);
});

test("Fuse, natural evolution and the action resolver share the main-phase actor guard", async () => {
  const fuse = await read("src/core/rulesets/svwb/fuse.js");
  const evolutionActions = await read("src/core/rulesets/svwb/evolution-actions.js");
  const actionResolver = await read("src/core/rulesets/svwb/action-resolver.js");

  for (const [path, source] of [
    ["fuse", fuse],
    ["evolution-actions", evolutionActions],
    ["action-resolver", actionResolver]
  ]) {
    assert.match(source, /assertWorldsBeyondMainActor/, path);
    assert.match(source, /from "\.\/action-guards\.js"/, path);
    assert.doesNotMatch(source, /function\s+assertMainActor\s*\(/, path);
  }

  const session = { phase: "main", winner: null, activePlayer: 1 };
  assert.equal(assertWorldsBeyondMainActor(session, 1), 1);
  assert.throws(() => assertWorldsBeyondMainActor(session, 0), /not player 0's turn/);
  assert.throws(() => assertWorldsBeyondMainActor({ ...session, phase: "mulligan" }, 1), /Expected phase main/);
  assert.throws(() => assertWorldsBeyondMainActor({ ...session, winner: 1 }, 1), /match has ended/);
});
