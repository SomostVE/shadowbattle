import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWorldsBeyondClassCondition } from "../src/core/rulesets/svwb/class-conditions.js";

function card(id, { name = String(id), className = "Neutral", type = "Follower", cost = 1, text = "", keywords = [] } = {}) {
  return { id, name, class: className, type, cost, text, keywords };
}

function unit(id, options = {}) {
  const source = card(id, options);
  return {
    instanceId: `unit:${id}`,
    card: source,
    cardId: id,
    cost: source.cost,
    type: source.type,
    grantedKeywords: [...(options.grantedKeywords ?? [])]
  };
}

function player({ className = "Neutral", board = [], hand = [], earthSigils = 0, rally = 0 } = {}) {
  return {
    className,
    board,
    hand,
    cardsPlayedThisTurn: 0,
    resources: {
      earthSigils,
      rally,
      combo: 0,
      maxPp: 10
    }
  };
}

test("state-derived X resolves current Earth Sigils without consuming them", () => {
  const current = player({ className: "Runecraft", earthSigils: 3 });
  const result = evaluateWorldsBeyondClassCondition(
    "Deal X damage to an enemy follower. X is the number of earth sigils you have.",
    current,
    card(10133110, { name: "Juno, Visionary Alchemist", className: "Runecraft" })
  );

  assert.equal(result.text, "Deal 3 damage to an enemy follower.");
  assert.equal(result.mechanic, "stateCount");
  assert.ok(result.notes.includes("X = Earth Sigils 3"));
  assert.equal(current.resources.earthSigils, 3);
});

test("state-derived X counts only allied followers with active Ward", () => {
  const current = player({
    className: "Havencraft",
    board: [
      unit("ward", { keywords: ["Ward"] }),
      unit("granted", { grantedKeywords: ["Ward"] }),
      unit("plain"),
      unit("amulet", { type: "Amulet" })
    ]
  });
  const result = evaluateWorldsBeyondClassCondition(
    "Draw X cards. X is the number of allied followers on the field with Ward.",
    current,
    card(10562210, { name: "Protective Shell", className: "Havencraft", type: "Amulet" })
  );

  assert.equal(result.text, "Draw 2 cards.");
  assert.ok(result.notes.includes("X = allied Ward followers 2"));
});

test("state-derived X counts allied followers at or above a printed base cost", () => {
  const current = player({
    className: "Portalcraft",
    board: [
      unit("eight", { cost: 8 }),
      unit("ten", { cost: 10 }),
      unit("seven", { cost: 7 }),
      unit("amulet", { type: "Amulet", cost: 10 })
    ]
  });
  const result = evaluateWorldsBeyondClassCondition(
    "Deal X damage to the enemy leader. X is the number of allied followers on the field with a base cost of 8 or more.",
    current,
    card(10674110, { name: "Camiscilla, Unfeeling Heart", className: "Portalcraft" })
  );

  assert.equal(result.text, "Deal 2 damage to the enemy leader.");
  assert.ok(result.notes.includes("X = allied high-cost followers 2"));
});

test("state-derived X composes with Rally and counts the live allied follower board", () => {
  const current = player({
    className: "Swordcraft",
    rally: 10,
    board: [unit("a"), unit("b"), unit("c"), unit("amulet", { type: "Amulet" })]
  });
  const result = evaluateWorldsBeyondClassCondition(
    "Rally (10): Deal X damage to the enemy leader. X is the number of allied followers on the field.",
    current,
    card(10723310, { name: "Caesura al Fine", className: "Swordcraft" })
  );

  assert.equal(result.text, "Deal 3 damage to the enemy leader.");
  assert.ok(result.notes.includes("X = allied followers 3"));
  assert.ok(result.notes.includes("Rally 10"));
});

test("state-derived X counts only amulets in hand", () => {
  const current = player({
    className: "Havencraft",
    hand: [
      unit("amulet-a", { type: "Amulet" }),
      unit("follower", { type: "Follower" }),
      unit("amulet-b", { type: "Amulet" })
    ]
  });
  const result = evaluateWorldsBeyondClassCondition(
    "Deal X damage to all enemies. X is the number of amulets in your hand.",
    current,
    card(10761120, { name: "Missionary of Recruitment", className: "Havencraft" })
  );

  assert.equal(result.text, "Deal 2 damage to all enemies.");
  assert.ok(result.notes.includes("X = amulets in hand 2"));
});

test("state-derived X can read a stable current hand size", () => {
  const current = player({
    className: "Forestcraft",
    hand: [unit("one"), unit("two"), unit("three"), unit("four")]
  });
  const result = evaluateWorldsBeyondClassCondition(
    "Deal X damage to an enemy follower. X is the number of cards in your hand.",
    current,
    card(10113120, { name: "Glade, Fragrantwood Ward", className: "Forestcraft" })
  );

  assert.equal(result.text, "Deal 4 damage to an enemy follower.");
  assert.ok(result.notes.includes("X = cards in hand 4"));
});

test("hand-size X stays unresolved when an earlier effect changes the hand", () => {
  const current = player({ className: "Forestcraft", hand: [unit("one"), unit("two"), unit("three")] });
  const text = "Draw a card. Restore X defense to your leader. X is the number of cards in your hand.";
  const result = evaluateWorldsBeyondClassCondition(
    text,
    current,
    card(10111130, { name: "Deepwood Fairy Beast", className: "Forestcraft" })
  );

  assert.equal(result.text, text);
  assert.equal(result.mechanic, null);
  assert.equal(result.notes.some(note => note.startsWith("X =")), false);
});

test("board-count X stays unresolved when an earlier effect changes allied followers", () => {
  const current = player({ className: "Runecraft", board: [unit("existing")] });
  const text = "Summon a Clay Golem. Give it +X/+X. X is the number of allied followers on the field.";
  const result = evaluateWorldsBeyondClassCondition(
    text,
    current,
    card(10132120, { name: "Emmylou, Witch of Wonder", className: "Runecraft" })
  );

  assert.equal(result.text, text);
  assert.equal(result.mechanic, null);
  assert.equal(result.notes.some(note => note.startsWith("X =")), false);
});
