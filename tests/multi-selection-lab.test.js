import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const html = await fs.readFile(new URL("test/index.html", root), "utf8");
const controller = await fs.readFile(new URL("src/test/multi-selection-lab.js", root), "utf8");

test("battle lab installs the multi-selection bridge before the action controller", () => {
  const multi = html.indexOf("multi-selection-lab.js");
  const actions = html.indexOf("battle-action-lab.js");
  assert.ok(multi >= 0);
  assert.ok(actions > multi);
  assert.match(html, /multi-selection-lab\.js\?v=0\.4\.66/);
});

test("human discard choices are explicit and block target resolution until selected", () => {
  assert.match(controller, /discardInstanceId/);
  assert.match(controller, /is-discard-candidate/);
  assert.match(controller, /selectedDiscardInstanceId/);
  assert.match(controller, /stopImmediatePropagation/);
  assert.match(controller, /Choose discard/);
  assert.match(controller, /prioritizeSelectedDiscard/);
});

test("CPU discard variants are deliberately ranked instead of taking hand order", () => {
  assert.match(controller, /prioritizeCpuDiscardVariants/);
  assert.match(controller, /discardValue/);
  assert.match(controller, /findHandCard/);
  assert.match(controller, /card\.cost/);
});
