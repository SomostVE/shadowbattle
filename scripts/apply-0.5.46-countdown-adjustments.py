from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:140]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/core/rulesets/svwb/amulets.js",
    '''export function destroyWorldsBeyondAmulet(session, playerIndex, instanceId, {\n''',
    '''export function delayWorldsBeyondAmuletCountdown(session, playerIndex, instanceId, amount = 1, {\n  actor = playerIndex,\n  source = null,\n  reason = "ability"\n} = {}) {\n  const amulet = session.findBoardCard(playerIndex, instanceId);\n  const value = Math.max(0, Number(amount) || 0);\n  if (!amulet || cardType(amulet) !== "amulet" || !value || !Number.isFinite(Number(amulet.countdown))) {\n    return { applied: false, countdown: amulet?.countdown ?? null };\n  }\n\n  amulet.countdown = Number(amulet.countdown) + value;\n  session.emit(BATTLE_EVENT.COUNTDOWN_TICK, {\n    actor,\n    payload: {\n      card: session.cardView(amulet),\n      countdown: amulet.countdown,\n      amount: value,\n      source: source ? session.cardView(source) : null,\n      reason,\n      advanced: false,\n      delayed: true\n    }\n  });\n  return { applied: true, countdown: amulet.countdown };\n}\n\nexport function destroyWorldsBeyondAmulet(session, playerIndex, instanceId, {\n'''
)

replace_once(
    "src/core/rulesets/svwb/crests.js",
    '''export function advanceWorldsBeyondCrest(session, playerIndex, name, amount = 1) {\n  const crest = findCrest(session.getPlayer(playerIndex), name);\n  const value = Math.max(0, Number(amount) || 0);\n  if (!crest || !value || !hasFiniteCountdown(crest)) return false;\n  crest.countdown = Math.max(0, Number(crest.countdown) - value);\n  session.emit(BATTLE_EVENT.CREST_ACTIVATE, {\n    actor: playerIndex,\n    payload: { action: "advance", crest: crestView(crest), amount: value, countdown: crest.countdown }\n  });\n  return true;\n}\n''',
    '''export function advanceWorldsBeyondCrest(session, playerIndex, name, amount = 1, {\n  onExpire = null,\n  reason = "ability"\n} = {}) {\n  const player = session.getPlayer(playerIndex);\n  const crests = getWorldsBeyondCrests(player);\n  const crest = findCrest(player, name);\n  const value = Math.max(0, Number(amount) || 0);\n  if (!crest || !value || !hasFiniteCountdown(crest)) return false;\n  crest.countdown = Math.max(0, Number(crest.countdown) - value);\n  session.emit(BATTLE_EVENT.CREST_ACTIVATE, {\n    actor: playerIndex,\n    payload: { action: "advance", crest: crestView(crest), amount: value, countdown: crest.countdown }\n  });\n  if (crest.countdown > 0) return true;\n\n  const index = crests.indexOf(crest);\n  if (index >= 0) crests.splice(index, 1);\n  session.emit(BATTLE_EVENT.CREST_EXPIRED, {\n    actor: playerIndex,\n    payload: { crest: crestView(crest), activeCount: crests.length, reason }\n  });\n  if (typeof onExpire === "function") onExpire(crest);\n  return true;\n}\n'''
)

replace_once(
    "src/core/rulesets/worlds-beyond.js",
    '''import { applyWorldsBeyondCombatAction, listWorldsBeyondCombatActions } from "./svwb/combat-actions.js";\n''',
    '''import { applyWorldsBeyondCombatAction, listWorldsBeyondCombatActions } from "./svwb/combat-actions.js";\nimport { advanceWorldsBeyondAmuletCountdown, delayWorldsBeyondAmuletCountdown } from "./svwb/amulets.js";\n'''
)
replace_once(
    "src/core/rulesets/worlds-beyond.js",
    '''import { resolveWorldsBeyondEventReaction } from "./svwb/event-reactions.js";\n''',
    '''import { resolveWorldsBeyondCrestLastWords } from "./svwb/crest-effects.js";\nimport { advanceWorldsBeyondCrest, delayWorldsBeyondCrest } from "./svwb/crests.js";\nimport { resolveWorldsBeyondEventReaction } from "./svwb/event-reactions.js";\n'''
)
replace_once(
    "src/core/rulesets/worlds-beyond.js",
    '''  superEvolveFollowerByAbility(session, playerIndex, source) {\n    return superEvolveWorldsBeyondFollowerByAbility(session, playerIndex, source);\n  },\n  resolveRandomEnemyFollowerDamage(session, { playerIndex, source, amount, count }) {\n''',
    '''  superEvolveFollowerByAbility(session, playerIndex, source) {\n    return superEvolveWorldsBeyondFollowerByAbility(session, playerIndex, source);\n  },\n  advanceAmuletCountdown(session, { playerIndex, instanceId, amount, source = null }) {\n    return advanceWorldsBeyondAmuletCountdown(session, playerIndex, instanceId, amount, {\n      actor: playerIndex,\n      source,\n      reason: "ability"\n    });\n  },\n  delayAmuletCountdown(session, { playerIndex, instanceId, amount, source = null }) {\n    return delayWorldsBeyondAmuletCountdown(session, playerIndex, instanceId, amount, {\n      actor: playerIndex,\n      source,\n      reason: "ability"\n    });\n  },\n  advanceCrestCountdown(session, { playerIndex, name, amount }) {\n    return advanceWorldsBeyondCrest(session, playerIndex, name, amount, {\n      reason: "ability",\n      onExpire: crest => resolveWorldsBeyondCrestLastWords(session, playerIndex, crest)\n    });\n  },\n  delayCrestCountdown(session, { playerIndex, name, amount }) {\n    return delayWorldsBeyondCrest(session, playerIndex, name, amount);\n  },\n  resolveRandomEnemyFollowerDamage(session, { playerIndex, source, amount, count }) {\n'''
)

replace_once(
    "src/core/rulesets/svwb/generic-effects.js",
    '''const EVOLVE_ALL_UNEVOLVED_ALLIED = /\\bevolve all unevolved allied followers(?: on the field)?\\b/gi;\nconst EVOLVE_RANDOM_UNEVOLVED_ALLIED = /\\bevolve\\s+(another|a|an)\\s+random unevolved allied follower(?: on the field)?(?: with Ward)?(?: with a base cost of (\\d+) or more)?(?: that didn['’]t attack this turn)?(?:\\s+and give it\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+))?\\b/gi;\n''',
    '''const EVOLVE_ALL_UNEVOLVED_ALLIED = /\\bevolve all unevolved allied followers(?: on the field)?\\b/gi;\nconst EVOLVE_RANDOM_UNEVOLVED_ALLIED = /\\bevolve\\s+(another|a|an)\\s+random unevolved allied follower(?: on the field)?(?: with Ward)?(?: with a base cost of (\\d+) or more)?(?: that didn['’]t attack this turn)?(?:\\s+and give it\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+))?\\b/gi;\nconst ADVANCE_SPECIFIC_CREST = new RegExp(`\\\\badvance the count of your Crest\\\\s+${CARD_NAME}\\\\s+by\\\\s+${NUMBER}\\\\b`, "gi");\nconst DELAY_SPECIFIC_CREST = new RegExp(`\\\\bdelay the count of your Crest\\\\s+${CARD_NAME}\\\\s+by\\\\s+${NUMBER}\\\\b`, "gi");\nconst DELAY_ALL_CRESTS = new RegExp(`\\\\bdelay the counts of all your crests by\\\\s+${NUMBER}\\\\b`, "gi");\nconst ADVANCE_NAMED_ALLIED_COUNTDOWNS = new RegExp(`\\\\badvance the counts of all allied copies of\\\\s+${CARD_NAME}\\\\s+on the field by\\\\s+${NUMBER}\\\\b`, "gi");\nconst DELAY_RANDOM_NAMED_ALLIED_COUNTDOWN = new RegExp(`\\\\bdelay the count of a random allied\\\\s+${CARD_NAME}\\\\s+on the field by\\\\s+${NUMBER}\\\\b`, "gi");\nconst DELAY_SELF_AMULET_COUNTDOWN = new RegExp(`\\\\bdelay the count of this amulet by\\\\s+${NUMBER}\\\\b`, "gi");\n'''
)
replace_once(
    "src/core/rulesets/svwb/generic-effects.js",
    '''  LIVE_NEUTRAL_HAND_RANDOM_DAMAGE,\n  RANDOM_SUPER_EVOLVED_ALLIED_FOLLOWER_BUFF,\n''',
    '''  LIVE_NEUTRAL_HAND_RANDOM_DAMAGE,\n  ADVANCE_SPECIFIC_CREST,\n  DELAY_SPECIFIC_CREST,\n  DELAY_ALL_CRESTS,\n  ADVANCE_NAMED_ALLIED_COUNTDOWNS,\n  DELAY_RANDOM_NAMED_ALLIED_COUNTDOWN,\n  DELAY_SELF_AMULET_COUNTDOWN,\n  RANDOM_SUPER_EVOLVED_ALLIED_FOLLOWER_BUFF,\n'''
)
replace_once(
    "src/core/rulesets/svwb/generic-effects.js",
    '''  collect(value, LIVE_NEUTRAL_HAND_RANDOM_DAMAGE, () => ({\n    kind: "random-enemy-damage-by-neutral-hand"\n  }), effects);\n''',
    '''  collect(value, LIVE_NEUTRAL_HAND_RANDOM_DAMAGE, () => ({\n    kind: "random-enemy-damage-by-neutral-hand"\n  }), effects);\n  collect(value, ADVANCE_SPECIFIC_CREST, match => ({\n    kind: "crest-countdown",\n    direction: "advance",\n    crestName: match[1].trim(),\n    amount: numberWord(match[2])\n  }), effects);\n  collect(value, DELAY_SPECIFIC_CREST, match => ({\n    kind: "crest-countdown",\n    direction: "delay",\n    crestName: match[1].trim(),\n    amount: numberWord(match[2])\n  }), effects);\n  collect(value, DELAY_ALL_CRESTS, match => ({\n    kind: "delay-all-crests",\n    amount: numberWord(match[1])\n  }), effects);\n  collect(value, ADVANCE_NAMED_ALLIED_COUNTDOWNS, match => ({\n    kind: "advance-named-allied-countdowns",\n    cardName: match[1].trim(),\n    amount: numberWord(match[2])\n  }), effects);\n  collect(value, DELAY_RANDOM_NAMED_ALLIED_COUNTDOWN, match => ({\n    kind: "delay-random-named-allied-countdown",\n    cardName: match[1].trim(),\n    amount: numberWord(match[2])\n  }), effects);\n  collect(value, DELAY_SELF_AMULET_COUNTDOWN, match => ({\n    kind: "delay-self-amulet-countdown",\n    amount: numberWord(match[1])\n  }), effects);\n'''
)
replace_once(
    "src/core/rulesets/svwb/generic-effects.js",
    '''    if (effect.kind === "destroy-damaged-enemies") {\n      applied = destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) || applied;\n      continue;\n    }\n    if (effect.kind === "gain-shadows") {\n''',
    '''    if (effect.kind === "destroy-damaged-enemies") {\n      applied = destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) || applied;\n      continue;\n    }\n    if (effect.kind === "crest-countdown") {\n      applied = adjustSpecificCrestCountdown(session, playerIndex, effect) || applied;\n      continue;\n    }\n    if (effect.kind === "delay-all-crests") {\n      applied = delayAllCrestCountdowns(session, playerIndex, effect.amount) || applied;\n      continue;\n    }\n    if (effect.kind === "advance-named-allied-countdowns") {\n      applied = advanceNamedAlliedCountdowns(session, playerIndex, source, effect) || applied;\n      continue;\n    }\n    if (effect.kind === "delay-random-named-allied-countdown") {\n      applied = delayRandomNamedAlliedCountdown(session, playerIndex, source, effect) || applied;\n      continue;\n    }\n    if (effect.kind === "delay-self-amulet-countdown") {\n      applied = delaySelfAmuletCountdown(session, playerIndex, source, effect.amount) || applied;\n      continue;\n    }\n    if (effect.kind === "gain-shadows") {\n'''
)
replace_once(
    "src/core/rulesets/svwb/generic-effects.js",
    '''function destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) {\n''',
    '''function adjustSpecificCrestCountdown(session, playerIndex, effect) {\n  const amount = Math.max(0, Number(effect.amount) || 0);\n  if (!amount || !effect.crestName) return false;\n  if (effect.direction === "advance") {\n    return Boolean(session.ruleset?.advanceCrestCountdown?.(session, {\n      playerIndex,\n      name: effect.crestName,\n      amount\n    }));\n  }\n  return Boolean(session.ruleset?.delayCrestCountdown?.(session, {\n    playerIndex,\n    name: effect.crestName,\n    amount\n  }));\n}\n\nfunction delayAllCrestCountdowns(session, playerIndex, amount) {\n  const value = Math.max(0, Number(amount) || 0);\n  if (!value) return false;\n  const names = [...(session.getPlayer(playerIndex).resources?.crests ?? [])].map(crest => crest?.name).filter(Boolean);\n  let applied = false;\n  for (const name of names) {\n    applied = Boolean(session.ruleset?.delayCrestCountdown?.(session, { playerIndex, name, amount: value })) || applied;\n  }\n  return applied;\n}\n\nfunction advanceNamedAlliedCountdowns(session, playerIndex, source, effect) {\n  const wanted = String(effect.cardName ?? "").trim().toLowerCase();\n  const amount = Math.max(0, Number(effect.amount) || 0);\n  if (!wanted || !amount) return false;\n  const targetIds = session.getPlayer(playerIndex).board\n    .filter(unit => cardName(unit) === wanted && cardType(unit) === "amulet" && Number.isFinite(Number(unit.countdown)))\n    .map(unit => unit.instanceId);\n  let applied = false;\n  for (const instanceId of targetIds) {\n    const result = session.ruleset?.advanceAmuletCountdown?.(session, { playerIndex, instanceId, amount, source });\n    applied = Boolean(result?.applied) || applied;\n    if (session.phase === "ended") break;\n  }\n  return applied;\n}\n\nfunction delayRandomNamedAlliedCountdown(session, playerIndex, source, effect) {\n  const wanted = String(effect.cardName ?? "").trim().toLowerCase();\n  const amount = Math.max(0, Number(effect.amount) || 0);\n  if (!wanted || !amount) return false;\n  const candidates = session.getPlayer(playerIndex).board\n    .filter(unit => cardName(unit) === wanted && cardType(unit) === "amulet" && Number.isFinite(Number(unit.countdown)));\n  if (!candidates.length) return false;\n  const target = candidates[Math.floor(session.rng() * candidates.length)] ?? candidates[0];\n  const result = session.ruleset?.delayAmuletCountdown?.(session, {\n    playerIndex,\n    instanceId: target.instanceId,\n    amount,\n    source\n  });\n  return Boolean(result?.applied);\n}\n\nfunction delaySelfAmuletCountdown(session, playerIndex, source, amount) {\n  const value = Math.max(0, Number(amount) || 0);\n  if (!source?.instanceId || cardType(source) !== "amulet" || !value) return false;\n  const result = session.ruleset?.delayAmuletCountdown?.(session, {\n    playerIndex,\n    instanceId: source.instanceId,\n    amount: value,\n    source\n  });\n  return Boolean(result?.applied);\n}\n\nfunction destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) {\n'''
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
    if "0.5.45" not in text:
        raise SystemExit(f"missing 0.5.45 in {path}")
    file.write_text(text.replace("0.5.45", "0.5.46"), encoding="utf-8")
