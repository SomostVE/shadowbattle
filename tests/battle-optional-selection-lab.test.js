import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bridgeUrl = new URL("../src/test/optional-selection-lab.js", import.meta.url);
const labHtmlUrl = new URL("../test/index.html", import.meta.url);
const versionUrl = new URL("../version.json", import.meta.url);

test("Battle Lab loads the optional allied-card selection bridge", async () => {
  const [html, versionText] = await Promise.all([
    readFile(labHtmlUrl, "utf8"),
    readFile(versionUrl, "utf8")
  ]);
  const { version } = JSON.parse(versionText);
  assert.ok(html.includes(`optional-selection-lab.js?v=${version}`));
});

test("optional allied-card bridge exposes source-click skip replay without changing the engine graph", async () => {
  const source = await readFile(bridgeUrl, "utf8");
  assert.match(source, /optional-allied-card-destroy/);
  assert.match(source, /replayOptionalSkip/);
  assert.match(source, /keepOnlyOptionalSkipBranch/);
  assert.match(source, /click the source again to skip the optional selection/);
  assert.doesNotMatch(source, /activeSession\.dispatch\(/);
});
