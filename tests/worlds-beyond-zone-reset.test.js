import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { hasWorldsBeyondKeyword } from "../src/core/rulesets/svwb/combat-readiness.js";
import { returnBoardCardToHand } from "../src/core/zone-actions.js";

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    type: "Follower",
    cost: 1,
    attack: 1,
    defense: 1,
    keywords: [],
    text: ""
  }));
}

function game() {
  const session = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "zone-reset",
    firstPlayer: 0,
    players: [{ deck: deck("A") }, { deck: deck("B") }]
  });
  session.start();
  session.submitMulligan(0, []);
  session.submitMulligan(1, []);
  return session;
}

test("returning a follower clears temporary board keywords, locks and evolution state", () => {
  const session = game();
  const base = {
    id: 92001,
    name: "Clean Return Target",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 3,
    keywords: [],
    text: "Fanfare: Draw 1 card."
  };
  session.registerCardDefinitions([base]);

  const victim = {
    instanceId: "return-reset-victim",
    owner: 1,
    cardId: base.id,
    card: { ...base, keywords: ["Storm", "Ward"] },
    costDelta: -2,
    attackBonus: 4,
    defenseBonus: 4,
    spellboost: 0,
    attack: 6,
    defense: 7,
    maxDefense: 7,
    evolved: true,
    superEvolved: true,
    attacksRemaining: 0,
    hasAttacked: true,
    canAttackFollowers: false,
    canAttackLeader: false,
    playedTurn: session.turn,
    grantedKeywords: ["Storm", "Ward"],
    suppressedKeywords: ["Ward"],
    permanentAttackLock: true,
    himekaBanishAtOwnTurnEnd: true,
    himekaBanishActor: 0,
    engagedThisTurn: true
  };
  session.players[1].board.push(victim);

  returnBoardCardToHand(session, 1, victim.instanceId, { actor: 0, reason: "test-return" });

  const returned = session.findHandCard(1, victim.instanceId);
  assert.ok(returned);
  assert.equal(returned.card, base, "the canonical card definition is restored");
  assert.deepEqual(returned.card.keywords, []);
  assert.equal(returned.grantedKeywords, undefined);
  assert.equal(returned.suppressedKeywords, undefined);
  assert.equal(returned.permanentAttackLock, undefined);
  assert.equal(returned.himekaBanishAtOwnTurnEnd, undefined);
  assert.equal(returned.himekaBanishActor, undefined);
  assert.equal(returned.engagedThisTurn, undefined);
  assert.equal(returned.evolved, undefined);
  assert.equal(returned.superEvolved, undefined);
  assert.equal(returned.attack, undefined);
  assert.equal(returned.defense, undefined);
  assert.equal(returned.playedTurn, undefined);
  assert.equal(returned.costDelta, 0);
  assert.equal(returned.attackBonus, 0);
  assert.equal(returned.defenseBonus, 0);
  assert.equal(hasWorldsBeyondKeyword(returned, "Storm"), false);
  assert.equal(hasWorldsBeyondKeyword(returned, "Ward"), false);
});

test("returning a follower restores a printed keyword that was suppressed on the field", () => {
  const session = game();
  const base = {
    id: 92002,
    name: "Printed Ward Return Target",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 3,
    keywords: ["Ward"],
    text: ""
  };
  session.registerCardDefinitions([base]);

  const victim = {
    instanceId: "return-printed-ward",
    owner: 1,
    cardId: base.id,
    card: base,
    attack: 2,
    defense: 3,
    maxDefense: 3,
    suppressedKeywords: ["Ward"]
  };
  session.players[1].board.push(victim);
  assert.equal(hasWorldsBeyondKeyword(victim, "Ward"), false);

  returnBoardCardToHand(session, 1, victim.instanceId, { actor: 0, reason: "test-return-printed-ward" });

  const returned = session.findHandCard(1, victim.instanceId);
  assert.ok(returned);
  assert.equal(returned.suppressedKeywords, undefined);
  assert.equal(hasWorldsBeyondKeyword(returned, "Ward"), true);
});
