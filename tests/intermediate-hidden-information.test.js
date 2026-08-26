import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseIntermediateGameAction,
  evaluateIntermediateActions
} from "../src/ai/intermediate-controller.js";
import { getAiSkillProfile } from "../src/ai/skill-profile.js";

function gameWithHiddenPressure() {
  const attacker = { instanceId: "ai-attacker", cardId: "ai-attacker", name: "AI Attacker", type: "Follower", attack: 3, defense: 3, cost: 3 };
  const target = { instanceId: "0:8:enemy-board", cardId: "enemy-board", name: "Enemy Board", type: "Follower", attack: 2, defense: 2, cost: 2 };
  const enemy = {
    index: 0,
    hp: 20,
    handCount: 5,
    deckCount: 30,
    board: [target],
    resources: { maxPp: 4 }
  };
  Object.defineProperty(enemy, "hand", {
    enumerable: true,
    get() {
      throw new Error("AI attempted to read the real enemy hand");
    }
  });
  const ai = {
    index: 1,
    hp: 20,
    handCount: 0,
    hand: [],
    board: [attacker],
    resources: { pp: 5, maxPp: 5, evolutionPoints: 2, superEvolutionPoints: 2 }
  };
  const rows = Array.from({ length: 10 }, (_, index) => ({
    cardId: `enemy-${index}`,
    name: `Enemy ${index}`,
    type: index < 7 ? "Follower" : "Spell",
    cost: index < 8 ? 3 : 7,
    qty: 1
  }));

  return {
    phase: "main",
    activePlayer: 1,
    winner: null,
    ruleset: { maxPp: 10 },
    getSnapshot(viewer) {
      assert.equal(viewer, 1);
      return { players: [enemy, ai] };
    },
    getDeckManifest(playerIndex) {
      assert.equal(playerIndex, 0);
      return rows.map(row => ({ ...row }));
    },
    getEvents({ viewer }) {
      assert.equal(viewer, 1);
      return [];
    },
    listLegalActions(playerIndex) {
      assert.equal(playerIndex, 1);
      return [
        { type: "attack", player: 1, attackerInstanceId: "ai-attacker", target: "leader" },
        { type: "attack", player: 1, attackerInstanceId: "ai-attacker", targetInstanceId: "0:8:enemy-board" }
      ];
    }
  };
}

test("hidden counterplay pressure is visible in Intermediate attack scoring", () => {
  const ranked = evaluateIntermediateActions(gameWithHiddenPressure(), 1, {
    strategy: { faceBias: 0.2, tradeBias: 1 }
  });
  const trade = ranked.find(row => row.action.targetInstanceId);
  const face = ranked.find(row => row.action.target === "leader");

  assert.ok(trade.reasons.includes("hidden-counterplay-buffer"));
  assert.ok(face.reasons.includes("hidden-counterplay-risk"));
  assert.ok(trade.score > face.score);
});

test("Intermediate decision consumes its configured hidden-information sample budget", () => {
  const profile = { ...getAiSkillProfile("intermediate"), hiddenInformationSamples: 3, nearBestWindow: 0 };
  let cursor = 0;
  const values = [0.1, 0.7, 0.2, 0.8, 0.3, 0.6, 0.4, 0.5];
  const decision = chooseIntermediateGameAction(gameWithHiddenPressure(), 1, {
    profile,
    strategy: { faceBias: 0.2, tradeBias: 1 },
    rng: () => values[cursor++ % values.length]
  });

  assert.equal(decision.hiddenInformation.samples, 3);
  assert.equal(decision.hiddenInformation.unknownHandSlots, 5);
  assert.ok(decision.hiddenInformation.pressure >= 0 && decision.hiddenInformation.pressure <= 1);
});
