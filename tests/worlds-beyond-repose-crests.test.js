import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { hasWorldsBeyondKeyword } from "../src/core/rulesets/svwb/combat-readiness.js";
import { gainWorldsBeyondCrest } from "../src/core/rulesets/svwb/crests.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: [],
    traits: [],
    text: ""
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "repose-crest-test",
    firstPlayer: 0,
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function putFollower(game, playerIndex, { id, name = id, attack = 2, defense = 4 } = {}) {
  const unit = {
    instanceId: id,
    owner: playerIndex,
    cardId: id,
    card: {
      id,
      name,
      class: "Havencraft",
      type: "Follower",
      cost: 1,
      attack,
      defense,
      keywords: [],
      traits: [],
      text: ""
    },
    attack,
    defense,
    maxDefense: defense,
    evolved: false,
    superEvolved: false,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true
  };
  game.players[playerIndex].board.push(unit);
  return unit;
}

test("Devotee of Repose Crest gives a random allied follower -2 attack and Ward", () => {
  const game = readyGame();
  const ally = putFollower(game, 0, { id: "devotee-target", attack: 3, defense: 4 });
  const enemy = putFollower(game, 1, { id: "devotee-enemy", attack: 2, defense: 2 });
  gainWorldsBeyondCrest(game, 0, "Devotee of Repose", { id: 9101, name: "Devotee of Repose" });

  game.endTurn(0);

  assert.equal(ally.attack, 1);
  assert.equal(hasWorldsBeyondKeyword(ally, "Ward"), true);
  assert.equal(ally.card.keywords.includes("Ward"), false, "temporary Ward must not mutate the canonical Codex definition");
  const enemyAttacks = game.listLegalActions(1).filter(action => action.type === "attack" && action.attackerInstanceId === enemy.instanceId);
  assert.equal(enemyAttacks.some(action => action.target === "leader"), false, "Ward must block leader attacks");
  assert.equal(enemyAttacks.some(action => action.targetInstanceId === ally.instanceId), true);
  const activation = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === "Devotee of Repose");
  assert.equal(activation?.payload.attackReduction, 2);
  assert.equal(activation?.payload.ward, true);
});

test("Congregant of Repose draws a random defense-4 follower without leaking it", () => {
  const game = readyGame();
  const eligible = game.players[0].deck[0];
  eligible.card = { ...eligible.card, name: "Hidden Defense Four", defense: 4 };
  eligible.cardId = eligible.card.id;
  gainWorldsBeyondCrest(game, 0, "Congregant of Repose", { id: 9201, name: "Congregant of Repose" });
  const cursor = game.eventSequence;

  game.endTurn(0);

  assert.equal(game.players[0].deck.some(item => item.instanceId === eligible.instanceId), false);
  assert.equal(game.players[0].hand.some(item => item.instanceId === eligible.instanceId), true);
  const ownerDraw = game.getEvents({ since: cursor, viewer: 0 }).find(event => event.type === BATTLE_EVENT.DRAW && event.actor === 0 && event.payload.reason === "crest");
  assert.equal(ownerDraw?.payload.cards?.[0]?.name, "Hidden Defense Four");
  const opponentDraw = game.getEvents({ since: cursor, viewer: 1 }).find(event => event.type === BATTLE_EVENT.DRAW && event.actor === 0 && event.payload.reason === "crest");
  assert.equal(opponentDraw, undefined, "filtered Crest draw remains owner-only");
  const publicActivation = game.getEvents({ since: cursor, viewer: 1 }).find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === "Congregant of Repose");
  assert.equal(publicActivation?.payload.drawn, true);
  assert.equal(JSON.stringify(publicActivation).includes("Hidden Defense Four"), false);
});

test("Himeka Crest locks eligible followers and banishes them at their controller's turn end", () => {
  const game = readyGame();
  putFollower(game, 0, { id: "himeka", name: "Himeka, Heir to Repose", attack: 4, defense: 6 });
  const lowA = putFollower(game, 1, { id: "himeka-low-a", attack: 2, defense: 3 });
  const lowB = putFollower(game, 1, { id: "himeka-low-b", attack: 4, defense: 4 });
  const high = putFollower(game, 1, { id: "himeka-high", attack: 5, defense: 5 });
  gainWorldsBeyondCrest(game, 0, "Himeka, Heir to Repose", { id: 9301, name: "Himeka, Heir to Repose" });
  gainWorldsBeyondCrest(game, 0, "QA Persistent Crest", { id: 9302, name: "QA Persistent Crest" });
  const cursor = game.eventSequence;

  game.endTurn(0);

  assert.equal(lowA.permanentAttackLock, true);
  assert.equal(lowB.permanentAttackLock, true);
  assert.equal(high.permanentAttackLock, undefined);
  const lockedAttackers = new Set([lowA.instanceId, lowB.instanceId]);
  const attacks = game.listLegalActions(1).filter(action => action.type === "attack");
  assert.equal(attacks.some(action => lockedAttackers.has(action.attackerInstanceId)), false, "Himeka locks survive normal turn preparation");
  assert.equal(attacks.some(action => action.attackerInstanceId === high.instanceId), true);

  game.endTurn(1);

  assert.equal(game.players[1].board.some(unit => lockedAttackers.has(unit.instanceId)), false);
  assert.equal(game.players[1].board.some(unit => unit.instanceId === high.instanceId), true);
  assert.deepEqual(new Set(game.players[1].banished.map(unit => unit.instanceId)), lockedAttackers);
  const banishes = game.getEvents({ since: cursor, viewer: 0 }).filter(event => event.type === BATTLE_EVENT.CARD_BANISHED && event.payload.reason === "himeka-crest");
  assert.equal(banishes.length, 2);
  assert.equal(banishes.every(event => event.actor === 0), true);
});
