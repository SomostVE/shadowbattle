from pathlib import Path

path = Path("src/core/rulesets/svwb/effect-resolver.js")
text = path.read_text()

replacements = [
    (
        'import { evaluateWorldsBeyondClassCondition } from "./class-conditions.js";\n',
        'import { evaluateWorldsBeyondClassCondition } from "./class-conditions.js";\nimport { spellboostWorldsBeyondHand, worldsBeyondCardX } from "./spellboost.js";\n'
    ),
    (
        '  const spec = worldsBeyondTargetEffectSpec(conditional.text, source);\n  return spec ? { ...spec, text: conditional.text } : null;\n',
        '  const resolvedText = resolveWorldsBeyondVariables(conditional.text, source);\n  const spec = worldsBeyondTargetEffectSpec(resolvedText, source);\n  return spec ? { ...spec, text: resolvedText } : null;\n'
    ),
    (
        '  const text = conditional.text;\n  const targetSpec = worldsBeyondTargetEffectSpec(text, source);\n',
        '  const text = resolveWorldsBeyondVariables(conditional.text, source);\n  const targetSpec = worldsBeyondTargetEffectSpec(text, source);\n'
    ),
    (
        '  const text = preview.text;\n  const targetSpec = worldsBeyondTargetEffectSpec(text, source);\n',
        '  const text = resolveWorldsBeyondVariables(preview.text, source);\n  const targetSpec = worldsBeyondTargetEffectSpec(text, source);\n'
    ),
    (
        '  const resolvedText = conditional.text || text;\n',
        '  const resolvedText = resolveWorldsBeyondVariables(conditional.text || text, source);\n'
    ),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f"Missing effect-resolver block: {old[:120]!r}")
    text = text.replace(old, new, 1)

old_trigger = '''function triggerText(source, trigger, mode) {
  const text = String(source?.activeText ?? source?.card?.text ?? "");
  if (trigger === "play") return baseText(mode?.text ?? text);
  if (trigger === "engage") return getWorldsBeyondEngageInfo(source)?.text ?? "";
  if (trigger === "strike") return section(text, "strike");
  if (trigger === "evolve") return section(text, "evolve") || naturalLifecycle(text, /when this follower evolves,\s*/i);
  if (trigger === "super-evolve") return section(text, "super-evolve");
  if (trigger === "last-words") return section(text, "last words");
  if (trigger === "turn-start") return section(text, "at the start of your turn") || naturalLifecycle(text, /at the start of your turn,\s*/i);
  if (trigger === "turn-end") return section(text, "at the end of your turn") || naturalLifecycle(text, /at the end of your turn,\s*/i);
  return "";
}
'''
new_trigger = '''function triggerText(source, trigger, mode) {
  const text = String(source?.activeText ?? source?.card?.text ?? "");
  if (trigger === "play") return baseText(mode?.text ?? text);
  if (trigger === "engage") return getWorldsBeyondEngageInfo(source)?.text ?? "";
  if (trigger === "strike") return section(text, "strike");
  if (trigger === "evolve") return replicateFanfareIfRequested(text, section(text, "evolve") || naturalLifecycle(text, /when this follower evolves,\s*/i));
  if (trigger === "super-evolve") return replicateFanfareIfRequested(text, section(text, "super-evolve"));
  if (trigger === "last-words") return section(text, "last words");
  if (trigger === "turn-start") return section(text, "at the start of your turn") || naturalLifecycle(text, /at the start of your turn,\s*/i);
  if (trigger === "turn-end") return section(text, "at the end of your turn") || naturalLifecycle(text, /at the end of your turn,\s*/i);
  return "";
}

function replicateFanfareIfRequested(fullText, triggerSection) {
  if (!/replicate the effects? of this card'?s fanfare ability/i.test(String(triggerSection ?? ""))) return triggerSection;
  return baseText(fullText);
}

function resolveWorldsBeyondVariables(textValue, source) {
  const text = String(textValue ?? "");
  if (!/\bX\b/.test(text)) return text;
  const hasExplicitX = Number.isFinite(Number(source?.x)) || /\bX starts at\s+\d+\b/i.test(String(source?.card?.text ?? ""));
  if (!hasExplicitX) return text;
  const x = Math.max(0, Number(worldsBeyondCardX(source)) || 0);
  return text.replace(/\bX\b/g, String(x));
}
'''
if old_trigger not in text:
    raise SystemExit("Missing triggerText block")
text = text.replace(old_trigger, new_trigger, 1)

residual_marker = '    /\\bgive this follower\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\b/gi\n'
residual_new = '''    /\\bgive this follower\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\b/gi,
    /\\bgain\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+earth sigils?\\b/gi,
    /\\bspellboost your hand(?:\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+times?)?\\b/gi,
    /\\bincrease your combo by\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\b/gi
'''
if residual_marker not in text:
    raise SystemExit("Missing residual marker")
text = text.replace(residual_marker, residual_new, 1)

shadows_marker = '''export function gainWorldsBeyondShadows(session, playerIndex, amount = 1) {
  const player = session.getPlayer(playerIndex);
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return Number(player.resources?.shadows ?? 0);
  player.resources.shadows = Math.max(0, Number(player.resources?.shadows ?? 0)) + value;
  return player.resources.shadows;
}
'''
shadows_new = shadows_marker + '''
export function gainWorldsBeyondEarthSigils(session, playerIndex, amount = 1) {
  const player = session.getPlayer(playerIndex);
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return Number(player.resources?.earthSigils ?? 0);
  player.resources.earthSigils = Math.max(0, Number(player.resources?.earthSigils ?? 0)) + value;
  return player.resources.earthSigils;
}
'''
if shadows_marker not in text:
    raise SystemExit("Missing shadows helper")
text = text.replace(shadows_marker, shadows_new, 1)

execution_marker = '''  for (const match of text.matchAll(/\\bgive this follower\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)\\b/gi)) {
    if (!session.findBoardCard(playerIndex, source.instanceId)) continue;
    const attack = Number(match[1]) || 0;
    const defense = Number(match[2]) || 0;
    source.attack = Number(source.attack ?? source.card?.attack ?? 0) + attack;
    source.maxDefense = Number(source.maxDefense ?? source.card?.defense ?? 0) + defense;
    source.defense = Number(source.defense ?? source.card?.defense ?? 0) + defense;
    session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
      actor: playerIndex,
      payload: { card: session.cardView(source), attack, defense, reason: "ability" }
    });
    applied = true;
  }

'''
execution_new = execution_marker + '''  for (const match of text.matchAll(/\\bgain\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+earth sigils?\\b/gi)) {
    gainWorldsBeyondEarthSigils(session, playerIndex, numberWord(match[1]));
    applied = true;
  }

  for (const match of text.matchAll(/\\bspellboost your hand(?:\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+times?)?\\b/gi)) {
    const amount = match[1] ? numberWord(match[1]) : 1;
    spellboostWorldsBeyondHand(session, playerIndex, amount, { source, reason: "ability" });
    applied = true;
  }

  for (const match of text.matchAll(/\\bincrease your combo by\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\b/gi)) {
    const amount = numberWord(match[1]);
    const player = session.getPlayer(playerIndex);
    player.cardsPlayedThisTurn = Math.max(0, Number(player.cardsPlayedThisTurn ?? 0)) + amount;
    player.resources.combo = player.cardsPlayedThisTurn;
    applied = true;
  }

'''
if execution_marker not in text:
    raise SystemExit("Missing self-buff execution block")
text = text.replace(execution_marker, execution_new, 1)

path.write_text(text)
