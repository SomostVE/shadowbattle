import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOpponentBelief,
  sampleOpponentHands,
  summarizeOpponentBelief,
  summarizeOpponentSamples
} from "../src/ai/hidden-information.js";

function manifest() {
  return [
    { cardId: "A", name: "Early A", type: "Follower", cost: 2, qty: 3 },
    { cardId: "B", name: "Late B", type: "Follower", cost: 5, qty: 3 }
  ];
}

function hiddenEnemy({ handCount = 4, deckCount = 36, board = [], maxPp = 2 } = {}) {
  const enemy = {
    index: 0,
    hp: 20,
    handCount,
    deckCount,
    board,
    resources: { maxPp }
  };
  Object.defineProperty(enemy, "hand", {
    enumerable: true,
    get() {
      throw new Error("hidden opponent hand was inspected");
    }
  });
  return enemy;
}

function beliefSession({ enemy = hiddenEnemy(), events = [], rows = manifest() } = {}) {
  return {
    ruleset: { maxPp: 10 },
    getSnapshot(viewer) {
      assert.equal(viewer, 1);
      return {
        players: [enemy, { index: 1, hp: 20, handCount: 3, hand: [], board: [], resources: { maxPp: 2 } }]
      };
    },
    getDeckManifest(playerIndex) {
      assert.equal(playerIndex, 0);
      return rows.map(row => ({ ...row }));
    },
    getEvents({ viewer }) {
      assert.equal(viewer, 1);
      return events;
    }
  };
}

test("hidden-information belief never reads the opponent hand", () => {
  const game = beliefSession();
  const belief = assert.doesNotThrow(() => buildOpponentBelief(game, 1));
  assert.equal(belief, undefined);

  const result = buildOpponentBelief(game, 1);
  assert.equal(result.unknownHandSlots, 4);
  assert.equal(result.nextTurnPp, 3);
  assert.equal(result.playableRemaining, 3);
  assert.equal(result.playableProbability, 1);
});

test("publicly revealed initial cards are removed once even across repeated public events", () => {
  const early = { instanceId: "0:1:A", cardId: "A", name: "Early A", cost: 2, type: "Follower" };
  const late = { instanceId: "0:2:B", cardId: "B", name: "Late B", cost: 5, type: "Follower" };
  const game = beliefSession({
    enemy: hiddenEnemy({ handCount: 3, board: [early] }),
    events: [
      { sequence: 1, type: "card-play", visibility: "public", actor: 0, payload: { card: early } },
      { sequence: 2, type: "follower-enter", visibility: "public", actor: 0, payload: { card: early } },
      { sequence: 3, type: "card-returned", visibility: "public", actor: 0, payload: { card: late, destination: "hand" } }
    ]
  });

  const belief = buildOpponentBelief(game, 1);
  assert.equal(belief.revealedInitialCards, 2);
  assert.equal(belief.knownPublicHand.length, 1);
  assert.equal(belief.knownPublicHand[0].cardId, "B");
  assert.equal(belief.unknownHandSlots, 2);
  assert.equal(belief.remainingInitialCards, 4);
  assert.equal(belief.remaining.find(row => row.cardId === "A").qtyRemaining, 2);
  assert.equal(belief.remaining.find(row => row.cardId === "B").qtyRemaining, 2);
});

test("a publicly known opponent card leaves known hand belief when discarded", () => {
  const known = { instanceId: "0:2:B", cardId: "B", name: "Late B", cost: 5, type: "Follower" };
  const game = beliefSession({
    enemy: hiddenEnemy({ handCount: 2 }),
    events: [
      { sequence: 1, type: "card-returned", visibility: "public", actor: 0, payload: { card: known, destination: "hand" } },
      { sequence: 2, type: "card-discarded", visibility: "public", actor: 0, payload: { card: known, reason: "ability" } }
    ]
  });

  const belief = buildOpponentBelief(game, 1);
  assert.equal(belief.revealedInitialCards, 1);
  assert.equal(belief.knownPublicHand.length, 0);
  assert.equal(belief.unknownHandSlots, 2);
  assert.equal(belief.remaining.find(row => row.cardId === "B").qtyRemaining, 2);
});

test("a revealed initial card returned to deck becomes possible hidden hand information again", () => {
  const known = { instanceId: "0:1:A", cardId: "A", name: "Early A", cost: 2, type: "Follower" };
  const game = beliefSession({
    enemy: hiddenEnemy({ handCount: 2, deckCount: 4 }),
    events: [
      { sequence: 1, type: "follower-enter", visibility: "public", actor: 0, payload: { card: known } },
      { sequence: 2, type: "card-returned", visibility: "public", actor: 0, payload: { card: known, destination: "deck", deckIndex: 1 } }
    ]
  });

  const belief = buildOpponentBelief(game, 1);
  assert.equal(belief.revealedInitialCards, 1);
  assert.equal(belief.knownPublicHand.length, 0);
  assert.equal(belief.remainingInitialCards, 6);
  assert.equal(belief.remaining.find(row => row.cardId === "A").qtyRemaining, 3);
  assert.equal(belief.unknownHandSlots, 2);
});

test("a transformed known hand card keeps its latest public identity while deck accounting uses the original card", () => {
  const before = { instanceId: "0:1:A", cardId: "A", name: "Early A", cost: 2, type: "Follower" };
  const after = { instanceId: "0:1:A", cardId: "X", name: "Transformed X", cost: 4, type: "Follower" };
  const game = beliefSession({
    enemy: hiddenEnemy({ handCount: 2 }),
    events: [
      { sequence: 1, type: "card-returned", visibility: "public", actor: 0, payload: { card: before, destination: "hand" } },
      { sequence: 2, type: "card-transform", visibility: "public", actor: 0, payload: { before, after, reason: "fuse" } }
    ]
  });

  const belief = buildOpponentBelief(game, 1);
  assert.equal(belief.revealedInitialCards, 1);
  assert.equal(belief.knownPublicHand.length, 1);
  assert.equal(belief.knownPublicHand[0].instanceId, before.instanceId);
  assert.equal(belief.knownPublicHand[0].cardId, "X");
  assert.equal(belief.knownPublicHand[0].name, "Transformed X");
  assert.equal(belief.knownPublicHand[0].cost, 4);
  assert.equal(belief.remaining.find(row => row.cardId === "A").qtyRemaining, 2);
  assert.equal(belief.unknownHandSlots, 1);
});

test("generated cards never remove copies from the initial deck manifest", () => {
  const generated = { instanceId: "generated:0:8:A", cardId: "A", name: "Early A", cost: 2, type: "Follower" };
  const game = beliefSession({
    events: [{ sequence: 1, type: "follower-enter", visibility: "public", actor: 0, payload: { card: generated } }]
  });
  const belief = buildOpponentBelief(game, 1);
  assert.equal(belief.revealedInitialCards, 0);
  assert.equal(belief.remaining.find(row => row.cardId === "A").qtyRemaining, 3);
});

test("owner-prefixed summoned copies never consume initial deck belief", () => {
  const summoned = { instanceId: "0:summon:8:0:A", cardId: "A", name: "Early A", cost: 2, type: "Follower" };
  const game = beliefSession({
    events: [{ sequence: 1, type: "follower-enter", visibility: "public", actor: 0, payload: { card: summoned } }]
  });

  const belief = buildOpponentBelief(game, 1);
  assert.equal(belief.revealedInitialCards, 0);
  assert.equal(belief.remainingInitialCards, 6);
  assert.equal(belief.remaining.find(row => row.cardId === "A").qtyRemaining, 3);
});

test("a public generated card returned to the opponent hand stays known without consuming deck belief", () => {
  const generated = { instanceId: "generated:0:8:A", cardId: "A", name: "Early A", cost: 2, type: "Follower" };
  const game = beliefSession({
    enemy: hiddenEnemy({ handCount: 2 }),
    events: [
      { sequence: 1, type: "follower-enter", visibility: "public", actor: 0, payload: { owner: 0, card: generated } },
      { sequence: 2, type: "card-returned", visibility: "public", actor: 1, payload: { owner: 0, card: generated, destination: "hand" } }
    ]
  });

  const belief = buildOpponentBelief(game, 1);
  assert.equal(belief.revealedInitialCards, 0);
  assert.equal(belief.knownPublicHand.length, 1);
  assert.equal(belief.knownPublicHand[0].instanceId, generated.instanceId);
  assert.equal(belief.knownPublicHand[0].cardId, "A");
  assert.equal(belief.unknownHandSlots, 1);
  assert.equal(belief.remaining.find(row => row.cardId === "A").qtyRemaining, 3);
});

test("a known generated opponent hand card leaves hand belief when it is played", () => {
  const generated = { instanceId: "generated:0:8:A", cardId: "A", name: "Early A", cost: 2, type: "Follower" };
  const game = beliefSession({
    enemy: hiddenEnemy({ handCount: 1 }),
    events: [
      { sequence: 1, type: "card-returned", visibility: "public", actor: 1, payload: { owner: 0, card: generated, destination: "hand" } },
      { sequence: 2, type: "card-play", visibility: "public", actor: 0, payload: { card: generated, cost: 2, ppRemaining: 0, type: "follower" } }
    ]
  });

  const belief = buildOpponentBelief(game, 1);
  assert.equal(belief.revealedInitialCards, 0);
  assert.equal(belief.knownPublicHand.length, 0);
  assert.equal(belief.unknownHandSlots, 1);
  assert.equal(belief.remaining.find(row => row.cardId === "A").qtyRemaining, 3);
});

test("generated Fuse materials leave known hand and a generated Fuse target keeps its transformed identity", () => {
  const targetBefore = { instanceId: "generated:0:10:B", cardId: "B", name: "Generated Fuse Target", cost: 5, type: "Follower" };
  const material = { instanceId: "generated:0:11:A", cardId: "A", name: "Generated Material", cost: 2, type: "Follower" };
  const targetAfter = { ...targetBefore, cardId: "X", name: "Transformed X", cost: 4 };
  const game = beliefSession({
    enemy: hiddenEnemy({ handCount: 1 }),
    events: [
      { sequence: 1, type: "card-returned", visibility: "public", actor: 1, payload: { owner: 0, card: targetBefore, destination: "hand" } },
      { sequence: 2, type: "card-returned", visibility: "public", actor: 1, payload: { owner: 0, card: material, destination: "hand" } },
      { sequence: 3, type: "fuse", visibility: "public", actor: 0, payload: { target: targetBefore, materials: [material], materialCount: 1, fusedZoneCount: 1 } },
      { sequence: 4, type: "card-transform", visibility: "public", actor: 0, payload: { before: targetBefore, after: targetAfter, reason: "fuse" } }
    ]
  });

  const belief = buildOpponentBelief(game, 1);
  assert.equal(belief.revealedInitialCards, 0);
  assert.equal(belief.knownPublicHand.length, 1);
  assert.equal(belief.knownPublicHand[0].instanceId, targetBefore.instanceId);
  assert.equal(belief.knownPublicHand[0].cardId, "X");
  assert.equal(belief.knownPublicHand[0].name, "Transformed X");
  assert.equal(belief.knownPublicHand[0].cost, 4);
  assert.equal(belief.unknownHandSlots, 0);
  assert.equal(belief.remainingInitialCards, 6);
  assert.equal(belief.remaining.find(row => row.cardId === "A").qtyRemaining, 3);
  assert.equal(belief.remaining.find(row => row.cardId === "B").qtyRemaining, 3);
});

test("opponent hand samples contain only cards still possible from public information", () => {
  const early = { instanceId: "0:1:A", cardId: "A", name: "Early A", cost: 2, type: "Follower" };
  const belief = buildOpponentBelief(beliefSession({
    enemy: hiddenEnemy({ handCount: 2 }),
    events: [{ sequence: 1, type: "card-play", visibility: "public", actor: 0, payload: { card: early } }]
  }), 1);
  let cursor = 0;
  const values = [0, 0.75, 0.25, 0.5, 0.1, 0.9];
  const samples = sampleOpponentHands(belief, { samples: 3, rng: () => values[cursor++ % values.length] });

  assert.equal(samples.length, 3);
  assert.ok(samples.every(sample => sample.length === 2));
  assert.ok(samples.flat().every(card => card.cardId === "A" || card.cardId === "B"));
  assert.ok(samples.flat().every(card => card.qtyRemaining > 0));
  assert.equal(belief.remaining.find(row => row.cardId === "A").qtyRemaining, 2);
});

test("sample summary stays bounded and falls back to exact belief without samples", () => {
  const belief = buildOpponentBelief(beliefSession({ enemy: hiddenEnemy({ handCount: 2 }) }), 1);
  const exact = summarizeOpponentBelief(belief);
  assert.ok(exact.pressure >= 0 && exact.pressure <= 1);
  assert.equal(exact.samples, 0);

  const samples = [
    [{ cardId: "A", cost: 2 }, { cardId: "B", cost: 5 }],
    [{ cardId: "B", cost: 5 }, { cardId: "B", cost: 5 }]
  ];
  const sampled = summarizeOpponentSamples(belief, samples);
  assert.ok(sampled.pressure >= 0 && sampled.pressure <= 1);
  assert.equal(sampled.samples, 2);
  assert.equal(sampled.playableProbability, 0.5);
});
