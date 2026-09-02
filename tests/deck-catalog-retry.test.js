import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { loadDeckCatalog, loadDeckReferenceCards } from "../src/decks/catalog.js";

test("failed deck catalog loads can be retried", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) return response(false, 503, {});
    return response(true, 200, { cards: [{ id: 1, name: "Retry" }] });
  };

  try {
    await assert.rejects(loadDeckCatalog(GAME_IDS.SHADOWVERSE_CCG), /503/);
    const payload = await loadDeckCatalog(GAME_IDS.SHADOWVERSE_CCG);
    assert.equal(payload.cards[0].name, "Retry");
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed reference-card loads can be retried", async () => {
  const originalFetch = globalThis.fetch;
  let rawAttempts = 0;
  globalThis.fetch = async url => {
    const pathname = String(url);
    if (pathname.endsWith("cards.json")) {
      rawAttempts += 1;
      if (rawAttempts === 1) return response(false, 503, {});
      return response(true, 200, {
        cards: [{ card_id: 9001, card_set_id: 90000, card_name: "Generated", clan: 0, rarity: 1, char_type: 1 }]
      });
    }
    return response(true, 200, { cards: [{ id: 2, name: "Base" }] });
  };

  try {
    await assert.rejects(loadDeckReferenceCards(GAME_IDS.CHAMPIONS_BATTLE), /503/);
    const cards = await loadDeckReferenceCards(GAME_IDS.CHAMPIONS_BATTLE);
    assert.equal(rawAttempts, 2);
    assert.deepEqual(cards.map(card => card.name), ["Base", "Generated"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function response(ok, status, payload) {
  return {
    ok,
    status,
    async json() {
      return payload;
    }
  };
}
