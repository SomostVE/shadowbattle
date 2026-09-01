from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/core/rulesets/svwb/class-conditions.js",
    '''  const superEvolutionUnlocked = findThresholdMechanic(text, /\\bif you(?:'ve| have) unlocked super[- ]evolution\\s*,?\\s*(.*)$/i);\n  if (superEvolutionUnlocked) {\n    const active = Boolean(player?.resources?.superEvolutionAvailable);\n    text = resolveConditionalSegments(superEvolutionUnlocked.prefix, superEvolutionUnlocked.match[1], active);\n    mechanic = mechanic ?? "superEvolutionUnlocked";\n    notes.push(active ? "Super Evolution unlocked" : "Super Evolution not unlocked");\n  }\n''',
    '''  const superEvolutionUnlocked = findThresholdMechanic(text, /\\bif you(?:'ve| have) unlocked super[- ]evolution\\s*,?\\s*(.*)$/i);\n  if (superEvolutionUnlocked) {\n    const active = Boolean(player?.resources?.superEvolutionAvailable);\n    text = resolveConditionalSegments(superEvolutionUnlocked.prefix, superEvolutionUnlocked.match[1], active);\n    mechanic = mechanic ?? "superEvolutionUnlocked";\n    notes.push(active ? "Super Evolution unlocked" : "Super Evolution not unlocked");\n  }\n\n  const sourceEvolved = findThresholdMechanic(text, /\\bif this follower is evolved\\s*,?\\s*(.*)$/i);\n  if (sourceEvolved) {\n    const active = Boolean(source?.evolved);\n    text = resolveConditionalSegments(sourceEvolved.prefix, sourceEvolved.match[1], active);\n    mechanic = mechanic ?? "sourceEvolved";\n    notes.push(active ? "Source follower evolved" : "Source follower not evolved");\n  }\n'''
)

replace_once(
    "src/core/rulesets/svwb/generic-effects.js",
    '''const OPPOSING_FOLLOWER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to the opposing follower\\\\b", "gi");\nconst OPPOSING_FOLLOWER_DESTROY = /\\bdestroy the opposing follower\\b/gi;\n''',
    '''const OPPOSING_FOLLOWER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to the opposing follower\\\\b", "gi");\nconst DAMAGED_OPPOSING_FOLLOWER_DESTROY = /\\bif the opposing follower is damaged,?\\s*destroy it\\b/gi;\nconst OPPOSING_FOLLOWER_DESTROY = /\\bdestroy the opposing follower\\b/gi;\n'''
)
replace_once(
    "src/core/rulesets/svwb/generic-effects.js",
    '''  OPPOSING_FOLLOWER_DAMAGE,\n  OPPOSING_FOLLOWER_DESTROY,\n''',
    '''  OPPOSING_FOLLOWER_DAMAGE,\n  DAMAGED_OPPOSING_FOLLOWER_DESTROY,\n  OPPOSING_FOLLOWER_DESTROY,\n'''
)
replace_once(
    "src/core/rulesets/svwb/generic-effects.js",
    '''  collect(value, OPPOSING_FOLLOWER_DAMAGE, match => ({\n    kind: "opposing-follower-damage",\n    amount: numberWord(match[1])\n  }), effects);\n  collect(value, OPPOSING_FOLLOWER_DESTROY, () => ({\n    kind: "opposing-follower-destroy"\n  }), effects);\n''',
    '''  collect(value, OPPOSING_FOLLOWER_DAMAGE, match => ({\n    kind: "opposing-follower-damage",\n    amount: numberWord(match[1])\n  }), effects);\n  collect(value, DAMAGED_OPPOSING_FOLLOWER_DESTROY, () => ({\n    kind: "damaged-opposing-follower-destroy"\n  }), effects);\n  collect(value, OPPOSING_FOLLOWER_DESTROY, () => ({\n    kind: "opposing-follower-destroy"\n  }), effects);\n'''
)
replace_once(
    "src/core/rulesets/svwb/generic-effects.js",
    '''    if (effect.kind === "opposing-follower-damage") {\n      applied = damageOpposingFollower(session, playerIndex, source, opposingFollowerInstanceId, effect.amount, destroyFollower) || applied;\n      continue;\n    }\n    if (effect.kind === "opposing-follower-destroy") {\n      applied = destroyOpposingFollower(session, playerIndex, source, opposingFollowerInstanceId, destroyFollower) || applied;\n      continue;\n    }\n''',
    '''    if (effect.kind === "opposing-follower-damage") {\n      applied = damageOpposingFollower(session, playerIndex, source, opposingFollowerInstanceId, effect.amount, destroyFollower) || applied;\n      continue;\n    }\n    if (effect.kind === "damaged-opposing-follower-destroy") {\n      applied = destroyDamagedOpposingFollower(session, playerIndex, source, opposingFollowerInstanceId, destroyFollower) || applied;\n      continue;\n    }\n    if (effect.kind === "opposing-follower-destroy") {\n      applied = destroyOpposingFollower(session, playerIndex, source, opposingFollowerInstanceId, destroyFollower) || applied;\n      continue;\n    }\n'''
)
replace_once(
    "src/core/rulesets/svwb/generic-effects.js",
    '''function destroyOpposingFollower(session, playerIndex, source, instanceId, destroyFollower) {\n''',
    '''function destroyDamagedOpposingFollower(session, playerIndex, source, instanceId, destroyFollower) {\n  if (!instanceId) return false;\n  const enemyIndex = 1 - playerIndex;\n  const target = session.findBoardCard(enemyIndex, instanceId);\n  if (!target || cardType(target) !== "follower") return false;\n  if (currentDefense(target) >= currentMaxDefense(target)) return false;\n  return Boolean(destroyFollower?.(session, enemyIndex, target.instanceId, {\n    actor: playerIndex,\n    source,\n    reason: "ability",\n    byAbility: true,\n    abilityDestroy: true\n  }));\n}\n\nfunction destroyOpposingFollower(session, playerIndex, source, instanceId, destroyFollower) {\n'''
)

replace_once(
    "src/core/rulesets/svwb/effect-resolver.js",
    '''  if (targetSpec) inspect = stripSupportedTargetText(inspect);\n  inspect = inspect.replace(/\\bGain Crest\\s*:\\s*[^.;\\n]+[.;]?/gi, "");\n  return /\\b(?:select|choose)\\b|\\bif\\b|\\bunless\\b|\\bfor each\\b|\\bwhenever\\b|\\bwhen(?:ever)?\\b|\\brandomly select\\b|\\bX\\b|\\b(?:Earth Rite|Engage|Fuse|Transmute|Crest|Faith)\\b/i.test(inspect);\n''',
    '''  if (targetSpec) inspect = stripSupportedTargetText(inspect);\n  inspect = inspect.replace(/\\bGain Crest\\s*:\\s*[^.;\\n]+[.;]?/gi, "");\n  inspect = stripWorldsBeyondGenericEffectText(inspect);\n  return /\\b(?:select|choose)\\b|\\bif\\b|\\bunless\\b|\\bfor each\\b|\\bwhenever\\b|\\bwhen(?:ever)?\\b|\\brandomly select\\b|\\bX\\b|\\b(?:Earth Rite|Engage|Fuse|Transmute|Crest|Faith)\\b/i.test(inspect);\n'''
)

for path in [
    "package.json",
    "version.json",
    "index.html",
    "api/index.html",
    "test/index.html",
    "decks/index.html",
    "library/index.html",
]:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if "0.5.44" not in text:
        raise SystemExit(f"missing 0.5.44 in {path}")
    file.write_text(text.replace("0.5.44", "0.5.45"), encoding="utf-8")
