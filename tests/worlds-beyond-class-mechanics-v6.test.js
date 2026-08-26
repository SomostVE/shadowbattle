import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT, BATTLE_VISIBILITY } from "../src/core/battle-events.js";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";
import { spellboostWorldsBeyondHand } from "../src/core/rulesets/svwb/spellboost.js";
import { classMechanicStatus } from "../src/core/rulesets/svwb/v5/battle-class-mechanics.js";
import { costOf } from "../src/core/rulesets/svwb/v5/battle-engine-v5-state.js";
import { baseText } from "../src/core/rulesets/svwb/v5/battle-engine-v5-text.js";

function player(className, resources = {}) {
  return {
    index: 0,
    className,
    cardsPlayedThisTurn: 0,
    hand: [],
    board: [],
    resources: {
      rally: 0,
      earthSigils: 0,
      shadows: 0,
      maxPp: 0,
      ...resources
    }
  };
}

test("Rally conditions resolve only for Swordcraft at the required count", () => {
  const card = { class: "Swordcraft" };
  const sword = player("Swordcraft", { rally: 10 });
  assert.equal(evaluateWorldsBeyondClassCondition("Rally (10) - Draw a card.", sword, card).text, "Draw a card.");

  sword.resources.rally = 9;
  const inactive = evaluateWorldsBeyondClassCondition("Rally (10) - Draw a card.", sword, card);
  assert.equal(inactive.text, "");
  assert.match(inactive.notes.join(" "), /Rally 10 unavailable/);

  const forest = player("Forestcraft", { rally: 30 });
  assert.equal(evaluateWorldsBeyondClassCondition("Rally (10) - Draw a card.", forest, card).text, "");
});

test("Earth Rite previews atomically and consumes sigils only on commit", () => {
  const card = { class: "Runecraft" };
  const rune = player("Runecraft", { earthSigils: 3 });

  const preview = evaluateWorldsBeyondClassCondition("Earth Rite (2) - Draw a card.", rune, card);
  assert.equal(preview.text, "Draw a card.");
  assert.equal(rune.resources.earthSigils, 3);

  const committed = evaluateWorldsBeyondClassCondition("Earth Rite (2) - Draw a card.", rune, card, { consume: true });
  assert.equal(committed.text, "Draw a card.");
  assert.equal(rune.resources.earthSigils, 1);

  const inactive = evaluateWorldsBeyondClassCondition("Earth Rite (2) - Draw a card.", rune, card, { consume: true });
  assert.equal(inactive.text, "");
  assert.equal(rune.resources.earthSigils, 1);
});

test("class status reads V6 resource storage", () => {
  assert.deepEqual(classMechanicStatus(player("Swordcraft", { rally: 12 })), [{ key: "rally", label: "Rally", value: 12 }]);
  assert.deepEqual(classMechanicStatus(player("Dragoncraft", { maxPp: 7 })), [{ key: "overflow", label: "Overflow", value: "Active" }]);
  assert.deepEqual(classMechanicStatus(player("Abysscraft", { shadows: 8 })), [{ key: "necromancy", label: "Shadows", value: 8 }]);
  assert.deepEqual(classMechanicStatus(player("Runecraft", { earthSigils: 4 })), [
    { key: "spellboost", label: "Spellboost", value: "Hand" },
    { key: "earthRite", label: "Earth Sigils", value: 4 }
  ]);
});

test("Spellboost updates only eligible Runecraft hand cards and preserves private visibility", () => {
  const recipient = {
    instanceId: "0:rune",
    spellboost: 0,
    attackBonus: 0,
    defenseBonus: 0,
    card: {
      id: 1,
      class: "Runecraft",
      type: "Follower",
      cost: 5,
      attack: 2,
      defense: 2,
      keywords: ["On Spellboost"],
      text: "X starts at 2.\nOn Spellboost: Increase X by 1."
    }
  };
  const neutral = {
    instanceId: "0:neutral",
    spellboost: 0,
    card: { id: 2, class: "Neutral", type: "Follower", cost: 2, keywords: [], text: "" }
  };
  const rune = player("Runecraft");
  rune.hand = [recipient, neutral];
  const events = [];
  const session = {
    getPlayer: () => rune,
    cardView: item => ({ instanceId: item.instanceId, cardId: item.card?.id ?? item.cardId, name: item.card?.name ?? item.name }),
    emit(type, detail) { events.push({ type, ...detail }); }
  };

  const boosted = spellboostWorldsBeyondHand(session, 0, 2);
  assert.equal(boosted.length, 1);
  assert.equal(recipient.spellboost, 2);
  assert.equal(recipient.x, 4);
  assert.equal(neutral.spellboost, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, BATTLE_EVENT.CARD_SPELLBOOSTED);
  assert.equal(events[0].visibility, BATTLE_VISIBILITY.OWNER);
});

test("Spellboost cost reduction uses the semantic hand counter", () => {
  const instance = {
    spellboost: 0,
    costDelta: 0,
    card: {
      class: "Runecraft",
      type: "Spell",
      cost: 8,
      keywords: ["On Spellboost"],
      text: "On Spellboost: Subtract 1 from this card's cost."
    }
  };
  assert.equal(costOf(instance), 8);
  instance.spellboost = 3;
  assert.equal(costOf(instance), 5);
});

test("On Spellboost preambles do not hide the playable spell effect", () => {
  const text = "X starts at 2.\nOn Spellboost: Increase X by 1.\n\nSelect an enemy follower on the field and deal it X damage.";
  assert.equal(baseText(text), "Select an enemy follower on the field and deal it X damage.");

  const source = {
    instanceId: "0:storm",
    x: 5,
    card: { class: "Runecraft", type: "Spell", text }
  };
  const support = getWorldsBeyondTriggerSupport(source, "play", null, player("Runecraft"));
  assert.equal(support.supported, true);
  assert.equal(support.targetSpec.kind, "damage");
  assert.equal(support.targetSpec.amount, 5);
});

test("Evolve replicate-Fanfare sections reuse the real Fanfare text", () => {
  const source = {
    instanceId: "0:replicate",
    card: {
      class: "Swordcraft",
      type: "Follower",
      text: "Fanfare: Draw a card.\n\nEvolve: Replicate the effects of this card's Fanfare ability."
    }
  };
  const support = getWorldsBeyondTriggerSupport(source, "evolve", null, player("Swordcraft"));
  assert.equal(support.supported, true);
  assert.equal(support.text, "Draw a card.");
});

test("Runecraft resource primitives are structurally supported after class-condition resolution", () => {
  const rune = player("Runecraft", { earthSigils: 3 });
  for (const text of [
    "Gain 3 earth sigils.",
    "Gain an earth sigil.",
    "Spellboost your hand.",
    "Spellboost your hand 2 times."
  ]) {
    const source = { instanceId: `0:${text}`, card: { class: "Runecraft", type: "Spell", text } };
    assert.equal(getWorldsBeyondTriggerSupport(source, "play", null, rune).supported, true, text);
  }
});
