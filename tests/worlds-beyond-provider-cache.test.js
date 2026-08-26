import assert from "node:assert/strict";
import test from "node:test";

test("Worlds Beyond provider reuses one normalized catalog load per page", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return [{ id: 12345, name: "Cached Card", type: "Follower", cost: 1, attack: 1, defense: 1 }];
      }
    };
  };

  try {
    const { worldsBeyondProvider } = await import(`../src/data/providers/worlds-beyond.js?cache-test=${Date.now()}`);
    const [first, second] = await Promise.all([
      worldsBeyondProvider.loadCards(),
      worldsBeyondProvider.loadCards()
    ]);

    assert.equal(calls, 1);
    assert.notEqual(first, second, "callers receive independent arrays");
    assert.equal(first[0].uid, "svwb:12345");

    first.length = 0;
    const third = await worldsBeyondProvider.loadCards();
    assert.equal(calls, 1);
    assert.equal(third.length, 1, "mutating one returned array does not corrupt the cached catalog");
  } finally {
    globalThis.fetch = originalFetch;
  }
});