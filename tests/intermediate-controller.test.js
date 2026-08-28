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

function player(index, {
  hp = 20,
  pp = 5,
  hand = [],
  board = [],
  bonusPpAvailable = false,
  mulliganDone = false,
  evolutionPoints = 2,
  superEvolutionPoints = 2
} = {}) {
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
      evolutionPoints,
      superEvolutionPoints,
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

test("discard variants preserve valuable cards when a cheaper legal discard exists", () => {
  const source = card("source", { cost: 2, type: "Spell" });
  const cheap = card("cheap", { cost: 1, attack: 1, defense: 1 });
  const valuable = card("valuable", { cost: 6, attack: 5, defense: 5 });
  const target = card("target", { attack: 3, defense: 3 });
  const game = session({
    ai: player(1, { hand: [source, cheap, valuable], pp: 5 }),
    enemy: player(0, { board: [target] }),
    actions: [
      { type: "play-card", player: 1, cardInstanceId: "source", cost: 2, effectiveType: "spell", targetInstanceId: "target", targetKind: "destroy", discardInstanceId: "cheap" },
      { type: "play-card", player: 1, cardInstanceId: "source", cost: 2, effectiveType: "spell", targetInstanceId: "target", targetKind: "destroy", discardInstanceId: "valuable" }
    ]
  });

  const ranked = evaluateIntermediateActions(game, 1);
  assert.equal(ranked[0].action.discardInstanceId, "cheap");
  assert.ok(ranked[0].reasons.includes("discard"));
});

test("Fuse prefers the lower-value material when both produce the same transformation", () => {
  const target = card("fuse-source", { cost: 2, type: "Spell" });
  const cheap = card("cheap-material", { cost: 1, attack: 1, defense: 1 });
  const valuable = card("valuable-material", { cost: 6, attack: 5, defense: 5 });
  const game = session({
    ai: player(1, { hand: [target, cheap, valuable] }),
    enemy: player(0),
    actions: [
      { type: "fuse", player: 1, targetInstanceId: "fuse-source", materialInstanceIds: ["cheap-material"], projectedTransform: "Artifact Ω" },
      { type: "fuse", player: 1, targetInstanceId: "fuse-source", materialInstanceIds: ["valuable-material"], projectedTransform: "Artifact Ω" }
    ]
  });

  const ranked = evaluateIntermediateActions(game, 1);
  assert.deepEqual(ranked[0].action.materialInstanceIds, ["cheap-material"]);
  assert.ok(ranked[0].reasons.includes("material-cost"));
});

test("targeted damage prefers a follower it can remove over a larger follower it only scratches", () => {
  const spell = card("damage-spell", { cost: 2, type: "Spell" });
  const killable = card("killable", { attack: 3, defense: 2 });
  const tank = card("tank", { attack: 5, defense: 5 });
  const game = session({
    ai: player(1, { hand: [spell] }),
    enemy: player(0, { board: [killable, tank] }),
    actions: [
      { type: "play-card", player: 1, cardInstanceId: "damage-spell", cost: 2, effectiveType: "spell", targetInstanceId: "killable", targetKind: "damage", targetAmount: 3 },
      { type: "play-card", player: 1, cardInstanceId: "damage-spell", cost: 2, effectiveType: "spell", targetInstanceId: "tank", targetKind: "damage", targetAmount: 3 }
    ]
  });

  const ranked = evaluateIntermediateActions(game, 1, { strategy: { tradeBias: 0.7 } });
  assert.equal(ranked[0].action.targetInstanceId, "killable");
  assert.ok(ranked[0].reasons.includes("removes-follower"));
});

test("targeted leader damage is recognized as visible lethal", () => {
  const spell = card("burn", { cost: 2, type: "Spell" });
  const follower = card("follower", { attack: 4, defense: 2 });
  const game = session({
    ai: player(1, { hand: [spell] }),
    enemy: player(0, { hp: 3, board: [follower] }),
    actions: [
      { type: "play-card", player: 1, cardInstanceId: "burn", cost: 2, effectiveType: "spell", targetInstanceId: "leader:0", targetKind: "damage", targetAmount: 3 },
      { type: "play-card", player: 1, cardInstanceId: "burn", cost: 2, effectiveType: "spell", targetInstanceId: "follower", targetKind: "damage", targetAmount: 3 }
    ]
  });

  const ranked = evaluateIntermediateActions(game, 1, { strategy: { faceBias: 0.5, tradeBias: 0.8 } });
  assert.equal(ranked[0].action.targetInstanceId, "leader:0");
  assert.ok(ranked[0].reasons.includes("leader-target"));
  assert.ok(ranked[0].reasons.includes("lethal"));
});

test("targeted damage uses face and trade bias when leader and follower are both legal", () => {
  const spell = card("flex-burn", { cost: 2, type: "Spell" });
  const follower = card("killable", { attack: 2, defense: 2 });
  const actions = [
    { type: "play-card", player: 1, cardInstanceId: "flex-burn", cost: 2, effectiveType: "spell", targetInstanceId: "leader:0", targetKind: "damage", targetAmount: 3 },
    { type: "play-card", player: 1, cardInstanceId: "flex-burn", cost: 2, effectiveType: "spell", targetInstanceId: "killable", targetKind: "damage", targetAmount: 3 }
  ];
  const game = session({ ai: player(1, { hand: [spell] }), enemy: player(0, { hp: 20, board: [follower] }), actions });

  const aggro = evaluateIntermediateActions(game, 1, { strategy: { faceBias: 0.95, tradeBias: 0.1 } });
  const control = evaluateIntermediateActions(game, 1, { strategy: { faceBias: 0.1, tradeBias: 0.95 } });

  assert.equal(aggro[0].action.targetInstanceId, "leader:0");
  assert.ok(aggro[0].reasons.includes("leader-pressure"));
  assert.equal(control[0].action.targetInstanceId, "killable");
  assert.ok(control[0].reasons.includes("removes-follower"));
});

test("allied self-damage avoids killing a follower when a survivable legal target exists", () => {
  const spell = card("self-damage", { cost: 2, type: "Spell" });
  const fragile = card("fragile", { attack: 1, defense: 1 });
  const sturdy = card("sturdy", { attack: 5, defense: 5 });
  const game = session({
    ai: player(1, { hand: [spell], board: [fragile, sturdy] }),
    enemy: player(0),
    actions: [
      { type: "play-card", player: 1, cardInstanceId: "self-damage", cost: 2, effectiveType: "spell", targetInstanceId: "fragile", targetKind: "damage", targetAmount: 1 },
      { type: "play-card", player: 1, cardInstanceId: "self-damage", cost: 2, effectiveType: "spell", targetInstanceId: "sturdy", targetKind: "damage", targetAmount: 1 }
    ]
  });

  const ranked = evaluateIntermediateActions(game, 1);
  assert.equal(ranked[0].action.targetInstanceId, "sturdy");
  assert.ok(ranked.find(item => item.action.targetInstanceId === "fragile").reasons.includes("self-lethal"));
});

test("naked Super Evo is conserved when a strong normal development play is available", () => {
  const follower = card("board-follower", { attack: 4, defense: 4 });
  const development = card("development", { cost: 4, attack: 4, defense: 4 });
  const game = session({
    ai: player(1, { hand: [development], board: [follower], pp: 4, superEvolutionPoints: 1 }),
    enemy: player(0),
    actions: [
      { type: "super-evolve", player: 1, followerInstanceId: "board-follower" },
      { type: "play-card", player: 1, cardInstanceId: "development", cost: 4, effectiveType: "follower" }
    ]
  });

  const ranked = evaluateIntermediateActions(game, 1);
  assert.equal(ranked[0].action.type, "play-card");
  const evo = ranked.find(item => item.action.type === "super-evolve");
  assert.ok(evo.reasons.includes("no-immediate-pressure"));
  assert.ok(evo.reasons.includes("last-evolution-point"));
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
