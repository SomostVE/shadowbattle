import test from "node:test";
import assert from "node:assert/strict";
import { baseText } from "../src/core/rulesets/svwb/v5/battle-engine-v5-text.js";

test("hand activation preamble is excluded from a spell's playable body", () => {
  const text = `Activates in hand. At the end of your turn, Combo (3) - Reduce the cost of this card by 1.

Select an enemy follower on the field and destroy it. Draw a card.`;
  assert.equal(baseText(text), "Select an enemy follower on the field and destroy it. Draw a card.");
});

test("hand activation followed only by a passive keyword has no play ability text", () => {
  const text = `Activates in hand. When an enemy follower super-evolves, give this follower Bane.

Ward`;
  assert.equal(baseText(text), "");
});

test("Fanfare remains the playable body after a hand activation preamble", () => {
  const text = `Activates in hand. Whenever an allied follower super-evolves, set the cost of this card to 1.

Fanfare: Add a Fairy to your hand.`;
  assert.equal(baseText(text), "Add a Fairy to your hand.");
});

test("a standalone hand activation paragraph contributes no play text", () => {
  assert.equal(baseText("Activates in hand. Whenever an allied follower evolves, reduce the cost of this card by 1."), "");
});
