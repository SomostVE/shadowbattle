import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const overlay = await fs.readFile(new URL("src/test/multi-selection-lab.js", root), "utf8");

test("Battle Lab requires an explicit Evo or Super Evo mode choice when multiple modes are legal", () => {
  assert.match(overlay, /evolutionModeKey/);
  assert.match(overlay, /showEvolutionModeMenu/);
  assert.match(overlay, /selectEvolutionMode/);
  assert.match(overlay, /Choose evolution mode/);
  assert.match(overlay, /Mode \$\{index\}/);
  assert.match(overlay, /replayingEvolution/);
  assert.match(overlay, /prioritizeEvolutionMode/);
});
