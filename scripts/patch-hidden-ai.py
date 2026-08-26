from pathlib import Path

path = Path("src/ai/intermediate-controller.js")
text = path.read_text()

replacements = [
    (
        'import { chooseIntermediateAction, getAiSkillProfile } from "./skill-profile.js";\n',
        'import { buildOpponentBelief, sampleOpponentHands, summarizeOpponentBelief, summarizeOpponentSamples } from "./hidden-information.js";\nimport { chooseIntermediateAction, getAiSkillProfile } from "./skill-profile.js";\n'
    ),
    (
        '  const ranked = evaluateIntermediateActions(session, playerIndex, { strategy });\n',
        '  const belief = buildOpponentBelief(session, playerIndex);\n  const samples = sampleOpponentHands(belief, { samples: profile.hiddenInformationSamples, rng });\n  const hiddenInfo = summarizeOpponentSamples(belief, samples);\n  const ranked = evaluateIntermediateActions(session, playerIndex, { strategy, hiddenInfo });\n'
    ),
    (
        '    reasons: [...chosen.reasons],\n    alternatives:',
        '    reasons: [...chosen.reasons],\n    hiddenInformation: {\n      opponent: belief.opponent,\n      unknownHandSlots: belief.unknownHandSlots,\n      revealedInitialCards: belief.revealedInitialCards,\n      remainingInitialCards: belief.remainingInitialCards,\n      nextTurnPp: belief.nextTurnPp,\n      ...hiddenInfo\n    },\n    alternatives:'
    ),
    (
        'export function evaluateIntermediateActions(session, playerIndex, { strategy = DEFAULT_STRATEGY } = {}) {\n',
        'export function evaluateIntermediateActions(session, playerIndex, { strategy = DEFAULT_STRATEGY, hiddenInfo = null } = {}) {\n'
    ),
    (
        '  const actions = session.listLegalActions(playerIndex);\n  const context = createDecisionContext(view, playerIndex, normalizeStrategy(strategy));\n',
        '  const actions = session.listLegalActions(playerIndex);\n  const resolvedHiddenInfo = hiddenInfo ?? summarizeOpponentBelief(buildOpponentBelief(session, playerIndex));\n  const context = createDecisionContext(view, playerIndex, normalizeStrategy(strategy), resolvedHiddenInfo);\n'
    ),
    (
        'function createDecisionContext(view, playerIndex, strategy) {\n',
        'function createDecisionContext(view, playerIndex, strategy, hiddenInfo) {\n'
    ),
    (
        '    enemy,\n    strategy,\n',
        '    enemy,\n    strategy,\n    hiddenInfo,\n'
    ),
    (
        '    reasons.push("leader-pressure");\n    return { score: 2.1 + pressure + closing, reasons };\n',
        '    const hiddenRisk = Number(context.hiddenInfo?.pressure ?? 0) * (0.25 + context.strategy.tradeBias * 0.55);\n    reasons.push("leader-pressure");\n    if (hiddenRisk >= 0.15) reasons.push("hidden-counterplay-risk");\n    return { score: 2.1 + pressure + closing - hiddenRisk, reasons };\n'
    ),
    (
        '  if (survives) {\n    score += Math.min(2, attackerValue * 0.22);\n    reasons.push("favorable-trade");\n  } else if (kills) {\n',
        '  if (survives) {\n    score += Math.min(2, attackerValue * 0.22);\n    reasons.push("favorable-trade");\n  } else if (kills) {\n'
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"Expected controller block not found: {old[:140]!r}")
    text = text.replace(old, new, 1)

trade_marker = '''  } else if (kills) {
    score -= attackerValue * 0.28;
    reasons.push("trade-off");
  }
  return { score, reasons: reasons.length ? reasons : ["board-trade"] };
}
'''
trade_replacement = '''  } else if (kills) {
    score -= attackerValue * 0.28;
    reasons.push("trade-off");
  }
  const hiddenBuffer = Number(context.hiddenInfo?.pressure ?? 0) * context.strategy.tradeBias * 0.85;
  if (kills && hiddenBuffer >= 0.15) reasons.push("hidden-counterplay-buffer");
  score += hiddenBuffer;
  return { score, reasons: reasons.length ? reasons : ["board-trade"] };
}
'''
if trade_marker not in text:
    raise SystemExit("Expected attack trade block not found")
text = text.replace(trade_marker, trade_replacement, 1)

path.write_text(text)
