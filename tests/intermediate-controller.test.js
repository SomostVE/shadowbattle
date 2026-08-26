import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseIntermediateGameAction,
  chooseIntermediateMulligan,
  createIntermediateController,
  evaluateIntermediateActions,
  shouldUseIntermediateBonusPp
} from "../src/ai/intermediate-controller.js";

function card(instanceId, { cost = 0, attack = 0, defense = 0, type = "Follower" } = {}) {
  return { instanceId, cardId: instanceId, name: instanceId, cost, attack, defense, type, evolved: false, superEvolved: false };
}

function player(index, { hp = 20, pp = 5, hand = [], board = [], bonusPpAvailable = false, mulliganDone = false } = {}) {
  return {
    index,
    hp,
    maxHp: 20,
    hand,
    handCount: hand.length,
    board,
    resources: {
      pp,
      maxPp: pp,
      evolutionPoints: 2,
      superEvolutionPoints: 2,
      bonusPpAvailable
    },
    mulliganDone
  };
}

function session({ ai = player(1), enemy = player(0), actions = [], phase = "main", activePlayer = 1, winner = null } = {}) {
  const players = enemy.index === 0 ? [enemy, ai] : [ai, enemy];
  return {
    phase,
    activePlayer,
    winner,
    getSnapshot() {
      return { phase, activePlayer, winner, players };
    },
    listLegalActions(requestedPlayer) {
      assert.equal(requestedPlayer, activePlayer);
      return actions;
    }
  };
}

test("V6 intermediate AI always takes visible lethal", () => {
  const attacker = card("attacker", { attack: 5, defense: 3 });
  const spell = card("spell", { cost: 4, type: "Spell" });
  const game = session({
    ai: player(1, { hand: [spell], board: [attacker], pp: 5 }),
    enemy: player(0, { hp: 4 }),
    actions: [
      { type: "play-card", player: 1, cardInstanceId: "spell", cost: 4, effectiveType: "spell" },
      { type: "attack", player: 1, attackerInstanceId: "attacker", target: "leader" }
    ]
  });

  const decision = chooseIntermediateGameAction(game, 1, { rng: () => 0.99 });
  assert.equal(decision.action.type, "attack");
  assert.equal(decision.action.target, "leader");
  assert.ok(decision.reasons.includes("lethal"));
});

test("reference deck face/trade bias changes the preferred legal line", () => {
  const attacker = card("attacker", { attack: 3, defense: 3 });
  const target = card("target", { attack: 2, defense: 2 });
  const actions = [
    { type: "attack", player: 1, attackerInstanceId: "attacker", target: "leader" },
    { type: "attack", player: 1, attackerInstanceId: "attacker", targetInstanceId: "target" }
  ];
  const game = session({ ai: player(1, { board: [attacker] }), enemy: player(0, { board: [target] }), actions });

  const aggro = evaluateIntermediateActions(game, 1, { strategy: { faceBias: 0.9, tradeBias: 0.2 } });
  const control = evaluateIntermediateActions(game, 1, { strategy: { faceBias: 0.1, tradeBias: 0.95 } });

  assert.equal(aggro[0].action.target, "leader");
  assert.equal(control[0].action.targetInstanceId, "target");
});

test("V6 intermediate evaluation never inspects the opponent hidden hand", () => {
  const attacker = card("attacker", { attack: 2, defense: 3 });
  const enemy = player(0, { hp: 20 });
  enemy.handCount = 7;
  Object.defineProperty(enemy, "hand", {
    enumerable: true,
    get() {
      throw new Error("opponent hidden hand was inspected");
    }
  });
  const game = session({
    ai: player(1, { board: [attacker] }),
    enemy,
    actions: [{ type: "attack", player: 1, attackerInstanceId: "attacker", target: "leader" }]
  });

  assert.doesNotThrow(() => evaluateIntermediateActions(game, 1));
});

test("intermediate mulligan uses the reference strategy curve without revealing the opponent", () => {
  const hand = [
    card("one", { cost: 1 }),
    card("four", { cost: 4 }),
    card("six", { cost: 6 })
  ];
  const game = session({ ai: player(1, { hand }), enemy: player(0), phase: "mulligan", activePlayer: 1 });
  assert.deepEqual(chooseIntermediateMulligan(game, 1, { strategy: { mulliganMaxCost: 3 } }), ["four", "six"]);
});

test("intermediate mulligan keeps the cheapest card when the whole opening hand is expensive", () => {
  const hand = [card("five", { cost: 5 }), card("six", { cost: 6 }), card("seven", { cost: 7 })];
  const game = session({ ai: player(1, { hand }), enemy: player(0), phase: "mulligan", activePlayer: 1 });
  assert.deepEqual(chooseIntermediateMulligan(game, 1, { strategy: { mulliganMaxCost: 3 } }), ["six", "seven"]);
});

test("Bonus PP is recommended only when it unlocks a meaningful visible hand play", () => {
  const unlock = card("unlock", { cost: 3, attack: 4, defense: 4 });
  const game = session({
    ai: player(1, { hand: [unlock], pp: 2, bonusPpAvailable: true }),
    enemy: player(0),
    actions: []
  });
  assert.equal(shouldUseIntermediateBonusPp(game, 1), true);

  const noUnlock = session({
    ai: player(1, { hand: [card("later", { cost: 5 })], pp: 2, bonusPpAvailable: true }),
    enemy: player(0),
    actions: []
  });
  assert.equal(shouldUseIntermediateBonusPp(noUnlock, 1), false);
});

test("seeded intermediate controllers make reproducible near-best choices", () => {
  const attacker = card("attacker", { attack: 2, defense: 3 });
  const target = card("target", { attack: 1, defense: 2 });
  const game = session({
    ai: player(1, { board: [attacker] }),
    enemy: player(0, { board: [target] }),
    actions: [
      { type: "attack", player: 1, attackerInstanceId: "attacker", target: "leader" },
      { type: "attack", player: 1, attackerInstanceId: "attacker", targetInstanceId: "target" }
    ]
  });
  const a = createIntermediateController({ seed: "same-seed", strategy: { faceBias: 0.45, tradeBias: 0.45 } });
  const b = createIntermediateController({ seed: "same-seed", strategy: { faceBias: 0.45, tradeBias: 0.45 } });

  assert.deepEqual(a.chooseAction(game, 1).action, b.chooseAction(game, 1).action);
});
