import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const html = await fs.readFile(new URL("test/index.html", root), "utf8");
const controller = await fs.readFile(new URL("src/test/battle-action-lab.js", root), "utf8");
const css = await fs.readFile(new URL("src/ui/battle-actions.css", root), "utf8");

test("internal battle lab loads the playable action controller", () => {
  assert.match(html, /battle-actions\.css\?v=\d+\.\d+\.\d+/);
  assert.match(html, /battle-action-lab\.js\?v=\d+\.\d+\.\d+/);
  assert.match(html, /Playable action resolver/);
});

test("human battle controls dispatch real GameSession actions", () => {
  assert.match(controller, /listLegalActions/);
  assert.match(controller, /type: "play-card"/);
  assert.match(controller, /type === "attack"/);
  assert.match(controller, /type === "evolve"/);
  assert.match(controller, /type === "super-evolve"/);
  assert.match(controller, /session\.dispatch\(action\)/);
  assert.match(controller, /attackOpponentLeader/);
});

test("CPU lab driver executes legal actions instead of auto-passing", () => {
  assert.match(controller, /runCpuTurnIfNeeded/);
  assert.match(controller, /chooseCpuAction/);
  assert.match(controller, /shouldCpuUseBonusPp/);
  assert.match(controller, /session\.endTurn\(1\)/);
});

test("playable board has action, target, evolution and stat presentation", () => {
  assert.match(css, /\.sb-battle-card\.is-playable/);
  assert.match(css, /\.sb-battle-unit\.is-attacker-ready/);
  assert.match(css, /\.sb-battle-unit\.is-targetable/);
  assert.match(css, /\.sb-battle-evolution-controls/);
  assert.match(css, /\.sb-battle-stat-attack/);
  assert.match(css, /\.sb-battle-stat-defense/);
});
