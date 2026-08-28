import test from "node:test";
import assert from "node:assert/strict";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { getWorldsBeyondFuseRequirement } from "../src/core/rulesets/svwb/fuse.js";
import { baseText } from "../src/core/rulesets/svwb/v5/battle-engine-v5-text.js";

const STRIKER_TEXT = `Fuse: Artifact cards
When you Fuse to this card, transform it based on the total cost of the cards fused.
1: Ominous Artifact α
2: Ominous Artifact β
3 or more: Ominous Artifact γ
Rush`;

const FORTIFIER_TEXT = `Fuse: Artifact cards
When you Fuse to this card, transform it based on the total cost of the cards fused.
1: Ominous Artifact α
2: Ominous Artifact β
3 or more: Ominous Artifact γ
Ward`;

function source(id, name, text) {
  const definition = {
    id,
    name,
    class: "Portalcraft",
    type: "Follower",
    cost: 3,
    attack: 1,
    defense: 1,
    traits: ["Artifact"],
    keywords: ["Fuse"],
    text
  };
  return { instanceId: `source:${id}`, cardId: id, card: definition };
}

test("Striker and Fortifier Fuse cost tables are metadata, not play effects", () => {
  for (const [id, name, text] of [
    [90072110, "Striker Artifact", STRIKER_TEXT],
    [90072120, "Fortifier Artifact", FORTIFIER_TEXT]
  ]) {
    const instance = source(id, name, text);
    assert.equal(baseText(text), "");
    assert.equal(getWorldsBeyondFuseRequirement(instance), "Artifact cards");
    const support = getWorldsBeyondTriggerSupport(instance, "play");
    assert.equal(support.supported, true);
    assert.equal(support.text, "");
    assert.equal(support.residual, "");
  }
});

test("stripping Fuse metadata preserves a real Fanfare that follows it", () => {
  const text = `Fuse: Artifact cards
Fanfare: Draw a card.`;
  assert.equal(baseText(text), "Draw a card.");
});
