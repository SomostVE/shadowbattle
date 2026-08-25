import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { GAME_VISUALS } from "../src/assets/game-visuals.js";

const repoPath = relative => new URL(`../${relative}`, import.meta.url);

test("original CCG Fan Kit is archived and extracted for direct use", async () => {
  const manifest = JSON.parse(await fs.readFile(repoPath("assets/fankits/shadowverse-ccg/manifest.json"), "utf8"));
  assert.equal(manifest.status, "archived");
  assert.equal(manifest.fileCount, 36);

  const roots = [
    "assets/fankits/shadowverse-ccg/extracted/Backgrounds",
    "assets/fankits/shadowverse-ccg/extracted/Characters-1",
    "assets/fankits/shadowverse-ccg/extracted/RankIcons-1"
  ];
  for (const root of roots) {
    const stat = await fs.stat(repoPath(root));
    assert.equal(stat.isDirectory(), true, `${root} must remain available`);
    const entries = await fs.readdir(repoPath(root));
    assert.ok(entries.length > 0, `${root} must contain extracted Fan Kit assets`);
  }
});

test("visual registry points at the archived CCG asset namespaces", () => {
  const visuals = GAME_VISUALS["shadowverse-ccg"];
  assert.equal(visuals.assetPolicy, "archived-cygames-fan-kit");
  assert.match(visuals.backgroundsRoot, /fankits\/shadowverse-ccg\/extracted\/Backgrounds/);
  assert.match(visuals.charactersRoot, /fankits\/shadowverse-ccg\/extracted\/Characters-1/);
  assert.match(visuals.rankIconsRoot, /fankits\/shadowverse-ccg\/extracted\/RankIcons-1/);
});
