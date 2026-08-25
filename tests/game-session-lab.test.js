import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const html = await fs.readFile(new URL("test/index.html", root), "utf8");
const script = await fs.readFile(new URL("src/test/test-page.js", root), "utf8");
const css = await fs.readFile(new URL("src/ui/battle-lab.css", root), "utf8");

test("internal test page exposes the interactive Worlds Beyond GameSession lab", () => {
  assert.match(html, /id="game-session-lab"/);
  assert.match(html, /id="battle-player-hand"/);
  assert.match(html, /id="battle-mulligan"/);
  assert.match(html, /battle-lab\.css\?v=\d+\.\d+\.\d+/);
});

test("battle lab uses real data, GameSession and the ordered animation queue", () => {
  assert.match(script, /worldsBeyondProvider\.loadCards/);
  assert.match(script, /loadReferenceDecks\(GAME_IDS\.WORLDS_BEYOND/);
  assert.match(script, /new GameSession/);
  assert.match(script, /new BattleAnimationQueue/);
  assert.match(script, /submitMulligan/);
  assert.match(script, /passCpuTurnIfNeeded/);
});

test("battle lab has dedicated card, field and mulligan presentation states", () => {
  assert.match(css, /\.sb-battle-card\.is-selected/);
  assert.match(css, /\.sb-battle-field-slot/);
  assert.match(css, /prefers-reduced-motion/);
});
