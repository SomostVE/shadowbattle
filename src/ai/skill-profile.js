export const AI_SKILL_PROFILES = Object.freeze({
  intermediate: Object.freeze({
    id: "intermediate",
    label: "Intermediate",
    maxDepth: 2,
    beamWidth: 5,
    nearBestWindow: 0.8,
    temperature: 0.55,
    hiddenInformationSamples: 6,
    explanationLimit: 4,
    actionFloor: 0.35
  })
});

export function getAiSkillProfile(id = "intermediate") {
  const profile = AI_SKILL_PROFILES[id];
  if (!profile) throw new Error(`Unknown ShadowBattle AI skill profile: ${id}`);
  return profile;
}

function weightedChoice(entries, rng) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (!(total > 0)) return entries[0]?.candidate ?? null;
  let cursor = rng() * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.candidate;
  }
  return entries.at(-1)?.candidate ?? null;
}

export function chooseIntermediateAction(candidates, { rng = Math.random, profile = AI_SKILL_PROFILES.intermediate } = {}) {
  const legal = (candidates ?? [])
    .filter(candidate => candidate?.legal !== false && Number.isFinite(Number(candidate?.score)))
    .map(candidate => ({ ...candidate, score: Number(candidate.score) }))
    .sort((a, b) => b.score - a.score);

  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];

  const bestScore = legal[0].score;
  const viable = legal.filter(candidate => bestScore - candidate.score <= profile.nearBestWindow);
  if (viable.length === 1) return viable[0];

  const temperature = Math.max(0.05, Number(profile.temperature) || 0.55);
  const weighted = viable.map(candidate => ({
    candidate,
    weight: Math.exp((candidate.score - bestScore) / temperature)
  }));
  return weightedChoice(weighted, rng);
}
