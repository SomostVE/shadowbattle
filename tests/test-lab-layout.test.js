import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Battle Lab keeps engine controls and diagnostics in the primary workspace", async () => {
  const html = await read("test/index.html");
  for (const id of [
    "battle-player-deck",
    "battle-cpu-deck",
    "battle-start",
    "battle-mulligan",
    "battle-bonus-pp",
    "battle-end-turn",
    "battle-stage",
    "battle-event-log"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /class="sb-test-workspace"/);
  assert.match(html, /Legacy intermediate-AI decision sandbox/);
});
