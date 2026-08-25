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
  assert.match(controller, /action\.type === "play-card"/);
  assert.match(controller, /action\.type === "engage"/);
  assert.match(controller, /type === "attack"/);
  assert.match(controller, /type === "evolve"/);
  assert.match(controller, /type === "super-evolve"/);
  assert.match(controller, /session\.dispatch\(action\)/);
  assert.match(controller, /attackOpponentLeader/);
});

test("targeted card and Engage effects share the legal target graph with attacks", () => {
  assert.match(controller, /selectedPlayCard/);
  assert.match(controller, /selectedEngageAmulet/);
  assert.match(controller, /targetInstanceId/);
  assert.match(controller, /resolveEnemyFollowerTarget/);
  assert.match(controller, /Choose effect target/);
  assert.match(controller, /Choose Engage target/);
  assert.match(controller, /is-effect-target/);
});

test("V5 alternative modes require an explicit human choice when multiple modes are legal", () => {
  assert.match(controller, /selectedPlayModeKey/);
  assert.match(controller, /uniqueModeActions/);
  assert.match(controller, /choosePlayMode/);
  assert.match(controller, /renderModeMenu/);
  assert.match(controller, /Enhance \$\{action\.cost\}/);
  assert.match(controller, /Accelerate \$\{action\.cost\}/);
  assert.match(controller, /Crystallize \$\{action\.cost\}/);
  assert.match(css, /\.sb-battle-mode-menu/);
  assert.match(css, /\.sb-battle-mode-button/);
});

test("Engage is visible as a dedicated amulet action and class resources are readable", () => {
  assert.match(controller, /engageAmulet/);
  assert.match(controller, /`Engage \$\{engage\.cost\}`/);
  assert.match(controller, /Shadows \$\{resources\.shadows/);
  assert.match(controller, /Combo \$\{resources\.combo/);
  assert.match(controller, /Overflow \$\{Number\(resources\.maxPp/);
  assert.match(css, /\.sb-battle-evolution-button\.is-engage/);
  assert.match(css, /\.sb-battle-unit\.is-engage-selected/);
});

test("CPU lab driver executes legal actions instead of auto-passing", () => {
  assert.match(controller, /runCpuTurnIfNeeded/);
  assert.match(controller, /chooseCpuAction/);
  assert.match(controller, /action\.type === "engage"/);
  assert.match(controller, /shouldCpuUseBonusPp/);
  assert.match(controller, /session\.endTurn\(1\)/);
});

test("playable board has action, combat target, effect target, evolution and stat presentation", () => {
  assert.match(css, /\.sb-battle-card\.is-playable/);
  assert.match(css, /\.sb-battle-unit\.is-attacker-ready/);
  assert.match(css, /\.sb-battle-unit\.is-targetable/);
  assert.match(css, /\.sb-battle-unit\.is-effect-target/);
  assert.match(css, /\.sb-battle-evolution-controls/);
  assert.match(css, /\.sb-battle-stat-attack/);
  assert.match(css, /\.sb-battle-stat-defense/);
});
