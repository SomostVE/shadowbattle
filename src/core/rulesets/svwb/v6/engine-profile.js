export const SHADOWBATTLE_V6_ENGINE_PROFILE = deepFreeze({
  id: "shadowbattle-v6-alpha",
  name: "ShadowBattle Battle Engine V6 Alpha",
  generation: 6,
  stage: "alpha",
  resolution: {
    model: "deterministic-fifo",
    synchronous: true,
    maxSteps: 512,
    eventDriven: true
  },
  architecture: {
    persistentGameSession: true,
    semanticEventLog: true,
    nativeEventReactionHook: true,
    hiddenInformationBoundary: true,
    controllerAgnostic: true,
    rendererAgnostic: true
  },
  compatibility: {
    migrationSource: "Beyond Decks Battle Engine V5",
    inheritedBattleRulesVersion: 5,
    inheritedHelpersPath: "src/core/rulesets/svwb/v5/"
  },
  migrationGates: {
    deterministicResolutionQueue: "complete",
    runtimeMonkeyPatches: "removed",
    legalActionGeneration: "active",
    actionResolver: "active",
    crestLifecycle: "migration",
    cardEffectCommands: "partial",
    classRuleCoverage: "migration",
    replayDeterminism: "foundation",
    cpuController: "migration",
    remoteController: "planned"
  }
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
