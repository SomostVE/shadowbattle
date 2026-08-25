import { chooseIntermediateAction, getAiSkillProfile } from "../ai/skill-profile.js";
import { getGameVisuals } from "../assets/game-visuals.js";

const gameSelect = document.querySelector("#test-game");
const seedInput = document.querySelector("#test-seed");
const runButton = document.querySelector("#run-decision");
const resetButton = document.querySelector("#reset-test");
const logRoot = document.querySelector("#decision-log");
const profileOutput = document.querySelector("#profile-json");
const visualOutput = document.querySelector("#visual-json");
const chosenOutput = document.querySelector("#chosen-action");

const profile = getAiSkillProfile("intermediate");
profileOutput.textContent = JSON.stringify(profile, null, 2);

const baseCandidates = Object.freeze([
  { id: "clean-trade", label: "Trade into the highest immediate threat", score: 8.4, legal: true, plan: "stabilize" },
  { id: "tempo-play", label: "Develop a follower and keep the evolution point", score: 8.15, legal: true, plan: "tempo" },
  { id: "hold-resources", label: "Take the safe trade and preserve the key card", score: 7.92, legal: true, plan: "resource" },
  { id: "greedy-face", label: "Push face damage and ignore the board", score: 7.25, legal: true, plan: "pressure" },
  { id: "illegal-test", label: "Play a card without enough PP", score: 99, legal: false, plan: "invalid" }
]);

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function renderVisualProfile() {
  const visuals = getGameVisuals(gameSelect.value);
  document.body.dataset.game = gameSelect.value;
  visualOutput.textContent = JSON.stringify({
    gameId: visuals.gameId,
    theme: visuals.theme,
    assetPolicy: visuals.assetPolicy,
    cardArtProvider: visuals.cardArtProvider
  }, null, 2);
}

function addLog(title, detail, score = null) {
  const item = document.createElement("div");
  item.className = "sb-log-entry";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const body = document.createElement("div");
  body.className = "sb-muted";
  body.textContent = detail;
  item.append(heading, body);
  if (score != null) {
    const scoreLine = document.createElement("div");
    scoreLine.className = "sb-score";
    scoreLine.textContent = `score ${Number(score).toFixed(2)}`;
    item.append(scoreLine);
  }
  logRoot.prepend(item);
}

function runDecision() {
  const seed = `${gameSelect.value}:${seedInput.value}:${logRoot.childElementCount}`;
  const rng = createRng(seed);
  const chosen = chooseIntermediateAction(baseCandidates, { rng, profile });
  if (!chosen) {
    chosenOutput.textContent = "No legal action";
    addLog("No action", "The test position contains no legal candidate.");
    return;
  }

  const best = [...baseCandidates].filter(candidate => candidate.legal).sort((a, b) => b.score - a.score)[0];
  const delta = best.score - chosen.score;
  chosenOutput.textContent = chosen.label;
  addLog(
    chosen.id === best.id ? "Best line selected" : "Near-best line selected",
    `${chosen.label}. Intermediate AI accepted a ${delta.toFixed(2)} score gap inside its ${profile.nearBestWindow.toFixed(2)} near-best window.`,
    chosen.score
  );
}

function resetTest() {
  logRoot.replaceChildren();
  chosenOutput.textContent = "No decision yet";
  seedInput.value = "shadowbattle-demo";
}

gameSelect.addEventListener("change", renderVisualProfile);
runButton.addEventListener("click", runDecision);
resetButton.addEventListener("click", resetTest);

renderVisualProfile();
resetTest();
