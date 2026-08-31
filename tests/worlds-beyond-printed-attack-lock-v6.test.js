import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  hasWorldsBeyondPrintedAttackLock
} from "../src/core/rulesets/svwb/combat-readiness.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

function card(id, extra = {}) {
  return {
    id,
    name: id,
    class: "Swordcraft",
    type: "Follower",
    cost: 0,
    attack: 3,
    defense: 3,
    keywords: [],
    traits: [],
    text: "",
    ...extra
  };
}

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { cost: 9 }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "printed-attack-lock",
    firstPlayer: 0,
    players: [
      { name: "Sword", className: "Swordcraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, definition) {
  const instance = game.players[0].hand[0];
  assert.ok(instance);
  instance.card = definition;
  instance.cardId = definition.id;
  game.registerCardDefinitions([definition]);
  return instance;
}

function attacksFor(game, instanceId) {
  return game.listLegalActions(0).filter(action => action.type === "attack" && action.attackerInstanceId === instanceId);
}

const UNMOVING = card(10523110, {
  name: "Unmoving Tactician",
  cost: 3,
  attack: 3,
  defense: 4,
  keywords: ["Super-Evolve", "Steelclad Knight"],
  text: "Can't attack followers or leaders.\nAt the end of your turn, summon a Steelclad Knight.\n\nSuper-Evolve: Give all other allied followers on the field +3/+3."
});

test("standalone printed attack restriction is passive support metadata", () => {
  const source = { instanceId: "unmoving-source", owner: 0, cardId: UNMOVING.id, card: UNMOVING };
  const support = getWorldsBeyondTriggerSupport(source, "play", null, {
    index: 0,
    className: "Swordcraft",
    board: [],
    hand: [],
    resources: { pp: 10, maxPp: 10, rally: 0, evolutionPoints: 2, superEvolutionPoints: 2 }
  });
  assert.equal(support.supported, true);
  assert.equal(support.residual, "");
  assert.equal(support.text, "");
});

test("Unmoving Tactician initializes a permanent attack lock from printed text", () => {
  const game = readyGame();
  const handCard = replaceHandCard(game, { ...UNMOVING, cost: 0 });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: handCard.instanceId });
  const unit = game.findBoardCard(0, handCard.instanceId);
  assert.ok(unit);
  assert.equal(unit.permanentAttackLock, true);
  assert.equal(unit.canAttackFollowers, false);
  assert.equal(unit.canAttackLeader, false);
  assert.deepEqual(attacksFor(game, unit.instanceId), []);

  game.endTurn(0);
  game.endTurn(1);

  assert.equal(unit.permanentAttackLock, true);
  assert.equal(unit.attacksRemaining, 0);
  assert.equal(unit.canAttackFollowers, false);
  assert.equal(unit.canAttackLeader, false);
  assert.deepEqual(attacksFor(game, unit.instanceId), []);
});

test("quoted temporary attack-lock grants are not mistaken for a printed self restriction", () => {
  const temporaryGrant = card("temporary-lock-grant", {
    text: "Evolve: Select an enemy follower on the field and give it \"Can't attack followers or leaders\" until the end of your opponent's turn."
  });
  assert.equal(hasWorldsBeyondPrintedAttackLock({ card: UNMOVING }), true);
  assert.equal(hasWorldsBeyondPrintedAttackLock({ card: temporaryGrant }), false);
});
