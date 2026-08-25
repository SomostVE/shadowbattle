import test from "node:test";
import assert from "node:assert/strict";
import { BattleAnimationQueue } from "../src/ui/battle-animation-queue.js";

test("battle animation queue preserves GameSession event order", async () => {
  const seen = [];
  const queue = new BattleAnimationQueue({ reducedMotion: true });
  queue.register("turn-start", async event => seen.push(event.sequence));
  queue.register("draw", async event => seen.push(event.sequence));
  queue.enqueueMany([
    { sequence: 10, type: "turn-start" },
    { sequence: 11, type: "draw" }
  ]);
  await queue.flush();
  assert.deepEqual(seen, [10, 11]);
});
