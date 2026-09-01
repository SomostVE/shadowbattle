import test from "node:test";
import assert from "node:assert/strict";
import { buildOpponentBelief, sampleOpponentHands } from "../src/ai/hidden-information.js";

function sessionWithGeneratedDeckCard() {
  const generated = {
    instanceId: "generated:0:12:G",
    cardId: "G",
    name: "Generated G",
    type: "Follower",
    cost: 1
  };
  return {
    generated,
    session: {
      ruleset: { maxPp: 10 },
      getSnapshot(viewer) {
        assert.equal(viewer, 1);
        return {
          players: [
            { index: 0, handCount: 1, deckCount: 1, board: [], resources: { maxPp: 2 } },
            { index: 1, handCount: 0, deckCount: 0, board: [], resources: { maxPp: 2 } }
          ]
        };
      },
      getDeckManifest(playerIndex) {
        assert.equal(playerIndex, 0);
        return [{ cardId: "A", name: "Initial A", type: "Follower", cost: 5, qty: 1 }];
      },
      getEvents({ viewer }) {
        assert.equal(viewer, 1);
        return [{
          sequence: 1,
          type: "card-returned",
          visibility: "public",
          actor: 0,
          payload: {
            owner: 0,
            card: generated,
            sourceZone: "hand",
            destination: "deck",
            deckIndex: 0,
            reason: "ability"
          }
        }];
      }
    }
  };
}

function sessionWithTransformedInitialDeckCard() {
  const before = {
    instanceId: "0:1:A",
    cardId: "A",
    name: "Initial A",
    type: "Follower",
    cost: 5
  };
  const after = {
    instanceId: before.instanceId,
    cardId: "T",
    name: "Transformed T",
    type: "Follower",
    cost: 1
  };
  return {
    before,
    after,
    session: {
      ruleset: { maxPp: 10 },
      getSnapshot(viewer) {
        assert.equal(viewer, 1);
        return {
          players: [
            { index: 0, handCount: 1, deckCount: 0, board: [], resources: { maxPp: 2 } },
            { index: 1, handCount: 0, deckCount: 0, board: [], resources: { maxPp: 2 } }
          ]
        };
      },
      getDeckManifest(playerIndex) {
        assert.equal(playerIndex, 0);
        return [{ cardId: "A", name: "Initial A", type: "Follower", cost: 5, qty: 1 }];
      },
      getEvents({ viewer }) {
        assert.equal(viewer, 1);
        return [
          {
            sequence: 1,
            type: "card-returned",
            visibility: "public",
            actor: 0,
            payload: { owner: 0, card: before, destination: "hand", reason: "test" }
          },
          {
            sequence: 2,
            type: "card-transform",
            visibility: "public",
            actor: 0,
            payload: { before, after, reason: "fuse" }
          },
          {
            sequence: 3,
            type: "card-returned",
            visibility: "public",
            actor: 0,
            payload: { owner: 0, card: after, sourceZone: "hand", destination: "deck", deckIndex: 0, reason: "ability" }
          }
        ];
      }
    }
  };
}

test("a known generated card returned to deck remains possible hidden hand information", () => {
  const { session, generated } = sessionWithGeneratedDeckCard();
  const belief = buildOpponentBelief(session, 1);

  assert.equal(belief.revealedInitialCards, 0);
  assert.equal(belief.remainingInitialCards, 1);
  assert.equal(belief.knownPublicHand.length, 0);
  assert.equal(belief.unknownHandSlots, 1);
  assert.equal(belief.playableRemaining, 1);
  assert.equal(belief.playableProbability, 0.5);

  const generatedCandidate = belief.remaining.find(row => row.instanceId === generated.instanceId);
  assert.ok(generatedCandidate);
  assert.equal(generatedCandidate.generated, true);
  assert.equal(generatedCandidate.qtyRemaining, 1);

  const samples = sampleOpponentHands(belief, { samples: 1, rng: () => 1 });
  assert.equal(samples.length, 1);
  assert.equal(samples[0].length, 1);
  assert.equal(samples[0][0].instanceId, generated.instanceId);
});

test("a transformed initial card returned to deck keeps its transformed hidden identity", () => {
  const { session, before, after } = sessionWithTransformedInitialDeckCard();
  const belief = buildOpponentBelief(session, 1);

  assert.equal(belief.revealedInitialCards, 1);
  assert.equal(belief.remainingInitialCards, 1);
  assert.equal(belief.knownPublicHand.length, 0);
  assert.equal(belief.unknownHandSlots, 1);
  assert.equal(belief.playableRemaining, 1);
  assert.equal(belief.playableProbability, 1);

  const originalCandidate = belief.remaining.find(row => String(row.cardId) === before.cardId);
  assert.ok(originalCandidate);
  assert.equal(originalCandidate.qtyRemaining, 0);

  const transformedCandidate = belief.remaining.find(row => row.instanceId === after.instanceId && String(row.cardId) === after.cardId);
  assert.ok(transformedCandidate);
  assert.equal(transformedCandidate.transformed, true);
  assert.equal(transformedCandidate.name, after.name);
  assert.equal(transformedCandidate.cost, after.cost);
  assert.equal(transformedCandidate.qtyRemaining, 1);

  const samples = sampleOpponentHands(belief, { samples: 1, rng: () => 0 });
  assert.equal(samples.length, 1);
  assert.equal(samples[0].length, 1);
  assert.equal(samples[0][0].cardId, after.cardId);
});
