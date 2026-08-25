import test from "node:test";
import assert from "node:assert/strict";
import { GAME_CATALOG } from "../src/core/game-catalog.js";
import { normalizeShadowBattleCard } from "../src/data/normalize-card.js";
import { shadowverseCcgProvider } from "../src/data/providers/shadowverse-ccg.js";
import { championsBattleProvider } from "../src/data/providers/champions-battle.js";

test("every supported game has a unique data namespace", () => {
  const games = Object.values(GAME_CATALOG);
  const namespaces = games.map(game => game.dataNamespace);
  assert.equal(new Set(namespaces).size, namespaces.length);
});

test("normalized card identity is qualified by game namespace", () => {
  const sourceCard = { id: 12345, name: "Example" };
  const wb = normalizeShadowBattleCard({ gameId: "worlds-beyond", dataNamespace: "svwb", sourceCard });
  const classic = normalizeShadowBattleCard({ gameId: "shadowverse-ccg", dataNamespace: "sv1", sourceCard });
  const switchCard = normalizeShadowBattleCard({ gameId: "champions-battle", dataNamespace: "svcb", sourceCard });

  assert.equal(wb.uid, "svwb:12345");
  assert.equal(classic.uid, "sv1:12345");
  assert.equal(switchCard.uid, "svcb:12345");
  assert.notEqual(wb.uid, classic.uid);
  assert.notEqual(classic.uid, switchCard.uid);
});

test("CCG provider reads the local ShadowBattle archive and qualifies Portal card IDs", async () => {
  let requestedUrl = null;
  const cards = await shadowverseCcgProvider.loadCards({
    fetchImpl: async url => {
      requestedUrl = String(url);
      return {
        ok: true,
        async json() {
          return {
            cards: [
              { card_id: 101011010, card_name: "Water Fairy" },
              { card_id: 101021010, card_name: "Oathless Knight" }
            ]
          };
        }
      };
    }
  });

  assert.match(requestedUrl, /api\/v1\/shadowverse-ccg\/cards\.json$/);
  assert.equal(shadowverseCcgProvider.runtimeNetworkDependency, false);
  assert.equal(cards[0].uid, "sv1:101011010");
  assert.equal(cards[1].gameId, "shadowverse-ccg");
});

test("Champion's Battle provider reads only the local svcb dataset", async () => {
  let requestedUrl = null;
  const cards = await championsBattleProvider.loadCards({
    fetchImpl: async url => {
      requestedUrl = String(url);
      return {
        ok: true,
        async json() {
          return { cards: [{ card_id: 101011010, card_name: "Water Fairy" }] };
        }
      };
    }
  });

  assert.match(requestedUrl, /api\/v1\/champions-battle\/cards\.json$/);
  assert.equal(championsBattleProvider.runtimeNetworkDependency, false);
  assert.equal(championsBattleProvider.basePoolComplete, true);
  assert.equal(championsBattleProvider.exclusiveCardsComplete, false);
  assert.equal(cards[0].uid, "svcb:101011010");
  assert.equal(cards[0].gameId, "champions-battle");
});
