import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { hasWorldsBeyondKeyword } from "../src/core/rulesets/svwb/combat-readiness.js";
import { resolveWorldsBeyondCrestLastWords } from "../src/core/rulesets/svwb/crest-effects.js";

function filler(id) {
  return { id, name: id, class: "Havencraft", type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [] };
}

function deck(prefix) {
  return Array.from({ length: 40 }, (_, index) => filler(`${prefix}-${index}`));
}

function begin() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "crest-keyword-test",
    firstPlayer: 0,
    players: [
      { name: "Human", className: "Havencraft", deck: deck("A") },
      { name: "CPU", className: "Havencraft", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

test("Lapis Crest grants real Storm even when Codex only indexed a conditional Storm mention", () => {
  const game = begin();
  const lapisCard = {
    id: "lapis-conditional-index",
    name: "Lapis, Shining Seraph",
    class: "Havencraft",
    type: "Follower",
    cost: 8,
    attack: 5,
    defense: 5,
    keywords: ["Storm", "Fanfare", "Combo"],
    text: "Fanfare: Combo (3) - Give this follower Storm."
  };

  assert.equal(hasWorldsBeyondKeyword({ card: lapisCard }, "Storm"), false);

  const resolved = resolveWorldsBeyondCrestLastWords(game, 0, {
    name: "Lapis, Shining Seraph",
    cardId: lapisCard.id,
    card: lapisCard,
    countdown: 0
  });
  assert.equal(resolved, true);

  const summoned = game.players[0].board.find(unit => unit.cardId === lapisCard.id);
  assert.ok(summoned);
  assert.equal(hasWorldsBeyondKeyword(summoned, "Storm"), true);
  assert.ok((summoned.grantedKeywords ?? []).includes("Storm"));

  const leaderAttack = game.listLegalActions(0).find(action =>
    action.type === "attack"
    && action.attackerInstanceId === summoned.instanceId
    && action.target === "leader"
  );
  assert.ok(leaderAttack, "the Crest-granted Storm must be usable immediately");
});
