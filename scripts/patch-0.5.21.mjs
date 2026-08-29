import fs from "node:fs";

function replaceOnce(path, needle, replacement) {
  const input = fs.readFileSync(path, "utf8");
  const first = input.indexOf(needle);
  if (first < 0) throw new Error(`Missing patch marker in ${path}: ${needle.slice(0, 80)}`);
  if (input.indexOf(needle, first + needle.length) >= 0) throw new Error(`Ambiguous patch marker in ${path}`);
  fs.writeFileSync(path, input.replace(needle, replacement));
}

const classConditions = "src/core/rulesets/svwb/class-conditions.js";
replaceOnce(
  classConditions,
  `    {\n      label: "other allied followers",`,
  `    {\n      label: "other allied cards",\n      pattern: /\\bX is the number of other allied cards on the field\\s*\\.?/i,\n      blocked: prefixMutatesAlliedCards,\n      count: () => (player?.board ?? []).filter(item => item?.instanceId !== source?.instanceId).length\n    },\n    {\n      label: "other allied followers",`
);
replaceOnce(
  classConditions,
  `function prefixMutatesAlliedFollowers(prefix) {`,
  `function prefixMutatesAlliedCards(prefix) {\n  const value = String(prefix ?? "");\n  return prefixMutatesAlliedFollowers(value)\n    || /\\b(?:destroy|banish|return|transform)\\b[^.]*\\ballied (?:cards?|amulets?)\\b/i.test(value);\n}\n\nfunction prefixMutatesAlliedFollowers(prefix) {`
);

const generic = "src/core/rulesets/svwb/generic-effects.js";
replaceOnce(
  generic,
  `  /\\bdestroy all damaged enemy followers\\b/gi,`,
  `  new RegExp(\`\\\\bdestroy\\\\s+${NUMBER}\\\\s+random enemy followers?\\\\b\`, "gi"),\n  /\\bdestroy all other allied cards(?: on the field)?\\b/gi,\n  /\\bdestroy all damaged enemy followers\\b/gi,`
);
replaceOnce(
  generic,
  `  destroyFollower,\n  gainShadows`,
  `  destroyFollower,\n  destroyCard,\n  gainShadows`
);
replaceOnce(
  generic,
  `  collect(value, /\\bdestroy all damaged enemy followers\\b/gi, () => ({\n    kind: "destroy-damaged-enemies"\n  }), effects);`,
  `  collect(value, new RegExp(\`\\\\bdestroy\\\\s+${NUMBER}\\\\s+random enemy followers?\\\\b\`, "gi"), match => ({\n    kind: "destroy-random-enemy-followers",\n    count: numberWord(match[1])\n  }), effects);\n  collect(value, /\\bdestroy all other allied cards(?: on the field)?\\b/gi, () => ({\n    kind: "destroy-other-allied-cards"\n  }), effects);\n  collect(value, /\\bdestroy all damaged enemy followers\\b/gi, () => ({\n    kind: "destroy-damaged-enemies"\n  }), effects);`
);
replaceOnce(
  generic,
  `    if (effect.kind === "destroy-damaged-enemies") {\n      applied = destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) || applied;\n      continue;\n    }`,
  `    if (effect.kind === "destroy-random-enemy-followers") {\n      applied = destroyRandomEnemyFollowers(session, playerIndex, source, effect.count, destroyFollower) || applied;\n      continue;\n    }\n    if (effect.kind === "destroy-other-allied-cards") {\n      applied = destroyOtherAlliedCards(session, playerIndex, source, destroyCard) || applied;\n      continue;\n    }\n    if (effect.kind === "destroy-damaged-enemies") {\n      applied = destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) || applied;\n      continue;\n    }`
);
replaceOnce(
  generic,
  `function destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) {`,
  `function destroyRandomEnemyFollowers(session, playerIndex, source, count, destroyFollower) {\n  const enemyIndex = 1 - playerIndex;\n  const candidates = session.getPlayer(enemyIndex).board\n    .filter(unit => cardType(unit) === "follower")\n    .map(unit => unit.instanceId);\n  const targetIds = [];\n  let remaining = Math.min(Math.max(0, Number(count) || 0), candidates.length);\n  while (remaining > 0 && candidates.length) {\n    const index = Math.floor(session.rng() * candidates.length);\n    targetIds.push(candidates.splice(index, 1)[0]);\n    remaining -= 1;\n  }\n\n  let applied = false;\n  for (const instanceId of targetIds) {\n    const live = session.findBoardCard(enemyIndex, instanceId);\n    if (!live || session.phase === "ended") continue;\n    const destroyed = destroyFollower?.(session, enemyIndex, live.instanceId, {\n      actor: playerIndex,\n      source,\n      reason: "ability",\n      byAbility: true,\n      abilityDestroy: true\n    });\n    applied = Boolean(destroyed) || applied;\n  }\n  return applied;\n}\n\nfunction destroyOtherAlliedCards(session, playerIndex, source, destroyCard) {\n  const sourceInstanceId = source?.instanceId ?? null;\n  const targetIds = session.getPlayer(playerIndex).board\n    .filter(card => card?.instanceId !== sourceInstanceId)\n    .map(card => card.instanceId);\n  let applied = false;\n\n  for (const instanceId of targetIds) {\n    const live = session.findBoardCard(playerIndex, instanceId);\n    if (!live || session.phase === "ended") continue;\n    const destroyed = destroyCard?.(session, playerIndex, live, {\n      actor: playerIndex,\n      source,\n      reason: "ability",\n      byAbility: true,\n      abilityDestroy: true\n    });\n    applied = Boolean(destroyed) || applied;\n  }\n  return applied;\n}\n\nfunction destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) {`
);

const resolver = "src/core/rulesets/svwb/effect-resolver.js";
replaceOnce(
  resolver,
  `    destroyFollower: destroyWorldsBeyondFollower,\n    gainShadows: gainWorldsBeyondShadows`,
  `    destroyFollower: destroyWorldsBeyondFollower,\n    destroyCard: destroyWorldsBeyondTargetCard,\n    gainShadows: gainWorldsBeyondShadows`
);

console.log("Applied ShadowBattle 0.5.21 ordered other-allied-card X patch.");
