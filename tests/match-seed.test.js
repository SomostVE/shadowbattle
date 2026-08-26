import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { resolveMatchSeed } from "../src/core/match-seed.js";

const root = new URL("../", import.meta.url);

test("manual match seeds remain exactly replayable", () => {
  assert.equal(resolveMatchSeed("  replay-42  "), "replay-42");
  assert.equal(resolveMatchSeed("replay-42"), "replay-42");
});

test("blank match seeds use fresh cryptographic entropy", () => {
  let sequence = 0;
  const cryptoObject = {
    getRandomValues(values) {
      sequence += 1;
      for (let index = 0; index < values.length; index += 1) values[index] = sequence * 100 + index;
      return values;
    }
  };

  const first = resolveMatchSeed("", { cryptoObject });
  const second = resolveMatchSeed("", { cryptoObject });
  assert.notEqual(first, second);
  assert.match(first, /^shadowbattle-/);
  assert.match(second, /^shadowbattle-/);
});

test("blank seed fallback still changes between match starts when crypto is unavailable", () => {
  let tick = 1000;
  let entropy = 0.1;
  const options = {
    cryptoObject: null,
    now: () => tick++,
    random: () => (entropy += 0.1)
  };
  assert.notEqual(resolveMatchSeed("", options), resolveMatchSeed("", options));
});

test("Battle Lab defaults to random matches but keeps an explicit replay seed field", async () => {
  const [html, controller] = await Promise.all([
    fs.readFile(new URL("test/index.html", root), "utf8"),
    fs.readFile(new URL("src/test/battle-action-lab.js", root), "utf8")
  ]);

  assert.doesNotMatch(html, /id="test-seed"[^>]*value="shadowbattle-demo"/);
  assert.match(html, /id="test-seed"[^>]*placeholder="Random each match/);
  assert.match(controller, /resolveMatchSeed/);
  assert.match(controller, /const matchSeed = resolveMatchSeed\(ui\.seed\.value\)/);
  assert.match(controller, /seed: `\$\{matchSeed\}:cpu:1`/);
  assert.match(controller, /seed: matchSeed/);
});
