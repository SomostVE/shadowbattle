import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Battle Lab exposes a dedicated effect inspector next to the board", async () => {
  const html = await read("test/index.html");
  const { version } = JSON.parse(await read("version.json"));
  assert.match(html, /id="battle-card-inspector"/);
  assert.match(html, /id="battle-card-inspector-text"/);
  assert.match(html, /id="battle-card-inspector-evolved-text"/);
  assert.equal(html.includes(`card-inspector-lab.js?v=${version}`), true);
  assert.equal(html.includes(`test-lab-tools.css?v=${version}`), true);
});

test("card inspector reads real Beyond Codex text without treating the keyword index as runtime state", async () => {
  const source = await read("src/test/card-inspector-lab.js");
  assert.match(source, /worldsBeyondProvider\.loadCards\(\)/);
  assert.match(source, /card\.text/);
  assert.match(source, /card\.evolved\?\.text/);
  assert.match(source, /card\.keywords/);
  assert.match(source, /Codex index \(may be conditional\)/);
  assert.match(source, /card\.evolved\?\.image \?\? card\.image/);
  assert.match(source, /removeAttribute\("src"\)/);
  assert.match(source, /\.sb-battle-card:not\(\.sb-battle-card-back\), \.sb-battle-unit/);
});

test("card inspector avoids repeated DOM work while the pointer stays on the same card", async () => {
  const source = await read("src/test/card-inspector-lab.js");
  assert.match(source, /stage: document\.querySelector\("#battle-stage"\)/);
  assert.match(source, /let lastInspectedNode = null/);
  assert.match(source, /node === lastInspectedNode/);
  assert.match(source, /lastInspectedNode = node/);
  assert.match(source, /ui\.stage\?\.contains\(node\)/);
  assert.match(source, /inspectFromTarget\(event\.target\)/);
});