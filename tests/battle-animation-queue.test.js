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

test("unhandled battle events do not add invisible animation delays", async () => {
  const queue = new BattleAnimationQueue({ timings: { idle: 1000 } });
  const result = await Promise.race([
    queue.enqueue({ sequence: 1, type: "idle" }).then(() => "done"),
    new Promise(resolve => setTimeout(() => resolve("timeout"), 50))
  ]);
  assert.equal(result, "done");
});

test("registered animation handlers still receive their configured duration", async () => {
  const durations = [];
  const queue = new BattleAnimationQueue({ timings: { draw: 123 } });
  queue.register("draw", async (_event, options) => durations.push(options.duration));
  await queue.enqueue({ sequence: 1, type: "draw" });
  assert.deepEqual(durations, [123]);
});