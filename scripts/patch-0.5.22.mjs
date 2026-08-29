import fs from "node:fs";

const path = "src/core/rulesets/svwb/effect-resolver.js";
let text = fs.readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`Missing patch marker: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Patch marker is not unique: ${label}`);
  text = `${text.slice(0, first)}${to}${text.slice(first + from.length)}`;
}

replaceOnce(
`  const text = resolveWorldsBeyondVariables(conditional.text, source);\n  const targetSpec = worldsBeyondTargetEffectSpec(text, source);\n  const discardRequired = HAND_DISCARD_SELECTION.test(text);\n  const handReturnSelection = hasWorldsBeyondHandReturnSelection(text);\n  const unsupportedTarget = Boolean(targetSpec && !SUPPORTED_TARGET_KINDS.has(targetSpec.kind));\n  const unsupportedChoice = hasUnsupportedChoiceOrCondition(text, { targetSpec, discardRequired, handReturnSelection });\n  const residual = unsupportedResidualText(text, { targetSpec, discardRequired, handReturnSelection });`,
`  const text = resolveWorldsBeyondVariables(conditional.text, source);\n  const supportText = normalizeWorldsBeyondStructuralVariables(text);\n  const targetSpec = worldsBeyondTargetEffectSpec(supportText, source);\n  const discardRequired = HAND_DISCARD_SELECTION.test(supportText);\n  const handReturnSelection = hasWorldsBeyondHandReturnSelection(supportText);\n  const unsupportedTarget = Boolean(targetSpec && !SUPPORTED_TARGET_KINDS.has(targetSpec.kind));\n  const unsupportedChoice = hasUnsupportedChoiceOrCondition(supportText, { targetSpec, discardRequired, handReturnSelection });\n  const residual = unsupportedResidualText(supportText, { targetSpec, discardRequired, handReturnSelection });`,
"structural support normalization"
);

replaceOnce(
`  const text = resolveWorldsBeyondVariables(preview.text, source);`,
`  const text = resolveWorldsBeyondVariables(preview.text, source, { session, playerIndex });`,
"runtime preview variables"
);

replaceOnce(
`  const resolvedText = resolveWorldsBeyondVariables(conditional.text || text, source);`,
`  const resolvedText = resolveWorldsBeyondVariables(conditional.text || text, source, { session, playerIndex });`,
"runtime commit variables"
);

replaceOnce(
`function resolveWorldsBeyondVariables(textValue, source) {\n  let text = String(textValue ?? "");\n  if (!/\\bX\\b/.test(text)) return text;`,
`function resolveWorldsBeyondVariables(textValue, source, { session = null, playerIndex = null } = {}) {\n  let text = String(textValue ?? "");\n  if (!/\\bX\\b/.test(text)) return text;`,
"variable resolver signature"
);

replaceOnce(
`  const hasExplicitX = Number.isFinite(Number(source?.x)) || /\\bX starts at\\s+\\d+\\b/i.test(String(source?.card?.text ?? ""));`,
`  const boardDifferenceDefinition = /\\bX is the number of enemy followers on the field minus the number of allied followers on the field\\s*\\.?/i;\n  if (boardDifferenceDefinition.test(text) && /\\bdestroy X random enemy followers\\b/i.test(text) && session && (playerIndex === 0 || playerIndex === 1)) {\n    const alliedFollowers = session.getPlayer(playerIndex).board.filter(item => cardType(item) === "follower").length;\n    const enemyFollowers = session.getPlayer(1 - playerIndex).board.filter(item => cardType(item) === "follower").length;\n    const x = Math.max(0, enemyFollowers - alliedFollowers);\n    text = text.replace(boardDifferenceDefinition, " ");\n    return text\n      .replace(/\\bX\\b/g, String(x))\n      .replace(/\\s+/g, " ")\n      .replace(/\\s+([.,;:!?])/g, "$1")\n      .trim();\n  }\n\n  const hasExplicitX = Number.isFinite(Number(source?.x)) || /\\bX starts at\\s+\\d+\\b/i.test(String(source?.card?.text ?? ""));`,
"board-difference runtime X"
);

replaceOnce(
`function currentSourceAttack(source) {`,
`function normalizeWorldsBeyondStructuralVariables(textValue) {\n  let text = String(textValue ?? "");\n  const definition = /\\bX is the number of enemy followers on the field minus the number of allied followers on the field\\s*\\.?/i;\n  if (!definition.test(text) || !/\\bdestroy X random enemy followers\\b/i.test(text)) return text;\n  text = text.replace(definition, " ");\n  return text\n    .replace(/\\bX\\b/g, "0")\n    .replace(/\\s+/g, " ")\n    .replace(/\\s+([.,;:!?])/g, "$1")\n    .trim();\n}\n\nfunction currentSourceAttack(source) {`,
"structural variable helper"
);

fs.writeFileSync(path, text);
