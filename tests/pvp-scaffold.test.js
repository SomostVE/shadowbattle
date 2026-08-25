import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const hub = await fs.readFile(new URL("index.html", root), "utf8");
const hubJs = await fs.readFile(new URL("src/ui/hub.js", root), "utf8");
const hubPvpCss = await fs.readFile(new URL("src/ui/hub-pvp.css", root), "utf8");

test("hub exposes a future private PvP setup without pretending networking is live", () => {
  assert.match(hub, /id="open-private-match"/);
  assert.match(hub, /PvP Private Match/);
  assert.match(hub, /id="private-match-dialog"/);
  assert.match(hub, /id="private-match-game"/);
  assert.match(hub, /value="shadowverse-ccg"/);
  assert.match(hub, /value="champions-battle"/);
  assert.match(hub, /value="worlds-beyond"/);
  assert.match(hub, /id="private-match-spectators"/);
  assert.match(hub, /id="private-match-reveal-hands"/);
  assert.match(hub, /Player invite code/);
  assert.match(hub, /Spectator code/);
  assert.match(hub, /Create private match — later/);
  assert.match(hub, /WebRTC private rooms are planned/);
});

test("private PvP preferences are local-only and spectator visibility is explicit", () => {
  assert.match(hubJs, /shadowbattle:pvp-private-settings:v1/);
  assert.match(hubJs, /bindPrivateMatchSetup/);
  assert.match(hubJs, /spectators:\s*spectators\.checked/);
  assert.match(hubJs, /revealHands:\s*spectators\.checked && revealHands\.checked/);
  assert.match(hubJs, /revealHands\.disabled = !spectators\.checked/);
  assert.doesNotMatch(hubJs, /RTCPeerConnection|RTCDataChannel/);
});

test("private PvP dialog remains usable on mobile", () => {
  assert.match(hubPvpCss, /@media \(max-width: 620px\)/);
  assert.match(hubPvpCss, /\.hub-pvp-codes\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(hubPvpCss, /\.hub-pvp-foot\s*\{[\s\S]*?flex-direction:\s*column/);
});
