import test from "node:test";
import assert from "node:assert/strict";
import { BattleResolutionQueue } from "../src/core/resolution-queue.js";

test("BattleResolutionQueue resolves nested work in deterministic FIFO order", () => {
  const queue = new BattleResolutionQueue();
  const order = [];

  queue.enqueue("first", () => {
    order.push("first");
    queue.enqueue("nested", () => order.push("nested"));
  });
  queue.enqueue("second", () => order.push("second"));

  const completed = queue.drain();
  assert.deepEqual(order, ["first", "second", "nested"]);
  assert.deepEqual(completed.map(item => item.label), ["first", "second", "nested"]);
  assert.deepEqual(queue.getState(), { pending: 0, processing: false, nextId: 3, maxSteps: 512 });
});

test("BattleResolutionQueue stops runaway reaction loops", () => {
  const queue = new BattleResolutionQueue({ maxSteps: 3 });
  const loop = () => queue.enqueue("loop", loop);
  queue.enqueue("loop", loop);

  assert.throws(() => queue.drain(), /exceeded 3 steps/);
  assert.equal(queue.size, 0);
  assert.equal(queue.getState().processing, false);
});

test("BattleResolutionQueue rejects asynchronous resolvers", () => {
  const queue = new BattleResolutionQueue();
  queue.enqueue("async", async () => true);
  assert.throws(() => queue.drain(), /only accepts synchronous resolvers/);
  assert.equal(queue.size, 0);
});
