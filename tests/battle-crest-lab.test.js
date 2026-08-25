import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const html = await fs.readFile(new URL("test/index.html", root), "utf8");
const overlay = await fs.readFile(new URL("src/test/crest-lab-overlay.js", root), "utf8");
const css = await fs.readFile(new URL("src/ui/battle-crests.css", root), "utf8");

test("battle lab exposes five-slot Crest strips for both players", () => {
  assert.match(html, /battle-player-crests/);
  assert.match(html, /battle-opponent-crests/);
  assert.match(html, /battle-crests\.css\?v=\d+\.\d+\.\d+/);
  assert.match(html, /crest-lab-overlay\.js\?v=\d+\.\d+\.\d+/);
  assert.match(overlay, /for \(let index = 0; index < 5; index \+= 1\)/);
});

test("Crest overlay is driven by GameSession lifecycle events", () => {
  assert.match(overlay, /GameSession\.prototype\.emit/);
  assert.match(overlay, /BATTLE_EVENT\.CREST_GAINED/);
  assert.match(overlay, /BATTLE_EVENT\.CREST_TICK/);
  assert.match(overlay, /BATTLE_EVENT\.CREST_ACTIVATE/);
  assert.match(overlay, /BATTLE_EVENT\.CREST_EXPIRED/);
  assert.match(overlay, /resources\?\.crests/);
});

test("Crest presentation exposes Countdown and reduced-motion support", () => {
  assert.match(overlay, /sb-crest-countdown/);
  assert.match(overlay, /prefers-reduced-motion/);
  assert.match(css, /\.sb-crest-slot\.is-active/);
  assert.match(css, /\.sb-crest-countdown/);
  assert.match(css, /@media \(max-width: 560px\)/);
});
