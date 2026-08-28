import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const html = await fs.readFile(new URL("test/index.html", root), "utf8");
const controller = await fs.readFile(new URL("src/test/battle-action-lab.js", root), "utf8");
const ai = await fs.readFile(new URL("src/ai/intermediate-controller.js", root), "utf8");
const css = await fs.readFile(new URL("src/ui/battle-actions.css", root), "utf8");

test("internal battle lab loads the playable action controller", () => {
  assert.match(html, /battle-actions\.css\?v=\d+\.\d+\.\d+/);
  assert.match(html, /battle-action-lab\.js\?v=\d+\.\d+\.\d+/);
  assert.match(html, /Playable action resolver/);
});

test("human battle controls dispatch real GameSession actions", () => {
  assert.match(controller, /listLegalActions/);
  assert.match(controller, /action\.type === "play-card"/);
  assert.match(controller, /action\.type === "fuse"/);
  assert.match(controller, /action\.type === "engage"/);
  assert.match(controller, /type === "attack"/);
  assert.match(controller, /type === "evolve"/);
  assert.match(controller, /type === "super-evolve"/);
  assert.match(controller, /session\.dispatch\(action\)/);
  assert.match(controller, /attackOpponentLeader/);
});

test("targeted card, Engage and evolution effects share the legal target graph with attacks", () => {
  assert.match(controller, /selectedPlayCard/);
  assert.match(controller, /selectedEngageAmulet/);
  assert.match(controller, /selectedEvolution/);
  assert.match(controller, /targetInstanceId/);
  assert.match(controller, /resolveEnemyFollowerTarget/);
  assert.match(controller, /Choose effect target/);
  assert.match(controller, /Choose Engage target/);
  assert.match(controller, /Choose evolution target/);
  assert.match(controller, /evolutionTarget/);
  assert.match(controller, /is-effect-target/);
});

test("enemy leader effect targets reuse the explicit legal action graph", () => {
  assert.match(controller, /resolveEffectFollowerTarget\("leader:1"\)/);
  assert.match(controller, /const canEffectTargetLeader = Boolean/);
  assert.match(controller, /action\.targetInstanceId === "leader:1"/);
  assert.match(controller, /canHitLeader \|\| canEffectTargetLeader/);
  assert.match(controller, /highlighted enemy leader when legal/);
});

test("allied effect targets use the same explicit target graph instead of auto-selecting", () => {
  assert.match(controller, /resolveAlliedFollowerTarget/);
  assert.match(controller, /resolveEffectFollowerTarget/);
  assert.match(controller, /owner === 0/);
  assert.match(controller, /const effectTarget = playTarget \|\| engageTarget \|\| evolutionTarget/);
  assert.match(controller, /hitbox\.disabled = !\(effectTarget \|\| attackReady\)/);
  assert.match(controller, /Choose a highlighted follower as the card effect target/);
});

test("targeted Evo waits for a human target instead of auto-selecting the first legal branch", () => {
  assert.match(controller, /const targeted = actions\.filter\(action => action\.targetInstanceId\)/);
  assert.match(controller, /selectedEvolution = \{ type, followerInstanceId: instanceId \}/);
  assert.match(controller, /item\.type === selectedEvolution\.type/);
  assert.match(controller, /item\.followerInstanceId === selectedEvolution\.followerInstanceId/);
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

test("Fuse uses an explicit source, material selection and local transformation catalog", () => {
  assert.match(controller, /selectedFuseTarget/);
  assert.match(controller, /selectedFuseMaterials/);
  assert.match(controller, /selectFuseTarget/);
  assert.match(controller, /toggleFuseMaterial/);
  assert.match(controller, /confirmFuse/);
  assert.match(controller, /renderFuseTargetMenu/);
  assert.match(controller, /renderFuseSelectionMenu/);
  assert.match(controller, /cardCatalog:\s*\[\.\.\.cards\.values\(\)\]/);
  assert.match(controller, /"fuse": `\$\{actor\} Fuses`/);
  assert.match(controller, /"card-transform": `\$\{actor\} transforms a card`/);
  assert.match(css, /\.sb-battle-card\.is-fuse-target/);
  assert.match(css, /\.sb-battle-card\.is-fuse-material/);
  assert.match(css, /\.sb-battle-fuse-menu/);
  assert.match(css, /\.sb-battle-fuse-button/);
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

test("CPU lab driver uses the reusable V6 Intermediate controller", () => {
  assert.match(controller, /createIntermediateController/);
  assert.match(controller, /cpuController\.chooseMulligan\(session, 1\)/);
  assert.match(controller, /cpuController\?\.shouldUseBonusPp\(session, 1\)/);
  assert.match(controller, /cpuController\?\.chooseAction\(session, 1\)/);
  assert.match(controller, /session\.dispatch\(action\)/);
  assert.match(controller, /session\.endTurn\(1\)/);
  assert.doesNotMatch(controller, /function chooseCpuAction/);
});

test("Intermediate controller scores every supported V6 action family", () => {
  for (const action of ["attack", "play-card", "engage", "evolve", "super-evolve", "fuse"]) {
    assert.match(ai, new RegExp(`case "${action}"`));
  }
  assert.match(ai, /projectedTransform/);
  assert.match(ai, /getSnapshot\(playerIndex\)/);
  assert.match(ai, /listLegalActions\(playerIndex\)/);
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
