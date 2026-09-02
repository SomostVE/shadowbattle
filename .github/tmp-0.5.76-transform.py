from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def replace_exact(text, old, new, *, count=1, label="replacement"):
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{label}: expected {count} occurrence(s), found {actual}")
    return text.replace(old, new, count)


# action-resolver: reuse the exact invariants extracted in 0.5.75.
path = "src/core/rulesets/svwb/action-resolver.js"
text = read(path)
text = replace_exact(
    text,
    'import { BATTLE_EVENT } from "../../battle-events.js";\n',
    'import { BATTLE_EVENT } from "../../battle-events.js";\nimport { assertWorldsBeyondMainActor } from "./action-guards.js";\n',
    label="action guard import",
)
text = replace_exact(
    text,
    'import { gainWorldsBeyondRally } from "./rally.js";\n',
    'import { gainWorldsBeyondRally } from "./rally.js";\nimport { cardType, currentAttack, currentMaxDefenseIgnoringDamage } from "./runtime-card-state.js";\n',
    label="action runtime import",
)
local_guard = '''\nfunction assertMainActor(session, playerIndex) {\n  if (session.phase !== "main") throw new Error(`Expected phase main, got ${session.phase}`);\n  if (session.winner != null) throw new Error("The match has ended");\n  if (playerIndex !== 0 && playerIndex !== 1) throw new Error(`Invalid player index: ${playerIndex}`);\n  if (session.activePlayer !== playerIndex) throw new Error(`It is not player ${playerIndex}'s turn`);\n  return playerIndex;\n}\n'''
text = replace_exact(text, local_guard, "\n", label="local action guard")
text = replace_exact(
    text,
    'function currentAttack(instance) { return Number(instance.attack ?? (Number(instance.card?.attack ?? 0) + Number(instance.attackBonus ?? 0))); }\n',
    '',
    label="local action attack helper",
)
text = replace_exact(
    text,
    'function currentMaxDefense(instance) { return Number(instance.maxDefense ?? (Number(instance.card?.defense ?? 0) + Number(instance.defenseBonus ?? 0))); }\n',
    '',
    label="local action max-defense helper",
)
text = replace_exact(
    text,
    'function cardType(instance) { return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase(); }\n',
    '',
    label="local action card-type helper",
)
if text.count("assertMainActor(") != 3:
    raise SystemExit(f"action guard calls: expected 3, found {text.count('assertMainActor(')}")
text = text.replace("assertMainActor(", "assertWorldsBeyondMainActor(")
if text.count("currentMaxDefense(") != 2:
    raise SystemExit(f"action max-defense calls: expected 2, found {text.count('currentMaxDefense(')}")
text = text.replace("currentMaxDefense(", "currentMaxDefenseIgnoringDamage(")
write(path, text)

# Override-aware type semantics are identical in these three modules.
override_modules = [
    ("src/core/rulesets/svwb/class-conditions.js", 'import { hasWorldsBeyondKeyword } from "./combat-readiness.js";\n'),
    ("src/core/rulesets/svwb/generic-effects.js", 'import { resolveEffectCommands } from "../../effect-commands.js";\n'),
    ("src/core/rulesets/svwb/effect-resolver.js", 'import { evaluateWorldsBeyondClassCondition } from "./class-conditions.js";\n'),
]
local_effective_type = '''\nfunction cardType(instance) {\n  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();\n}\n'''
for module, anchor in override_modules:
    text = read(module)
    if module.endswith("class-conditions.js"):
        imported = anchor + 'import { effectiveCardType } from "./runtime-card-state.js";\n'
    elif module.endswith("generic-effects.js"):
        imported = anchor + 'import { currentAttack, currentDefense, currentMaxDefense, effectiveCardType } from "./runtime-card-state.js";\n'
    else:
        imported = anchor + 'import { effectiveCardType } from "./runtime-card-state.js";\n'
    text = replace_exact(text, anchor, imported, label=f"{module} runtime import")
    text = replace_exact(text, local_effective_type, "\n", label=f"{module} local effective card type")
    call_count = text.count("cardType(")
    if call_count < 1:
        raise SystemExit(f"{module}: expected cardType call sites")
    text = text.replace("cardType(", "effectiveCardType(")
    write(module, text)

# generic-effects has three more helpers identical to runtime-card-state.
path = "src/core/rulesets/svwb/generic-effects.js"
text = read(path)
for label, block in [
    ("attack", '''\nfunction currentAttack(instance) {\n  return Number(instance?.attack ?? (Number(instance?.card?.attack ?? 0) + Number(instance?.attackBonus ?? 0)));\n}\n'''),
    ("defense", '''\nfunction currentDefense(instance) {\n  return Number(instance?.defense ?? (Number(instance?.card?.defense ?? 0) + Number(instance?.defenseBonus ?? 0)));\n}\n'''),
    ("max-defense", '''\nfunction currentMaxDefense(instance) {\n  return Number(instance?.maxDefense ?? currentDefense(instance));\n}\n'''),
]:
    text = replace_exact(text, block, "\n", label=f"generic local {label} helper")
write(path, text)

# Structural regression coverage for the newly migrated modules.
path = "tests/v6-runtime-dedup.test.js"
text = read(path)
text = replace_exact(
    text,
    '  "src/core/rulesets/svwb/discard-reactions.js"\n];',
    '  "src/core/rulesets/svwb/discard-reactions.js",\n  "src/core/rulesets/svwb/action-resolver.js"\n];',
    label="printed card-type test inventory",
)
text = replace_exact(
    text,
    '  "src/core/rulesets/svwb/all-followers-count-x.js"\n];',
    '  "src/core/rulesets/svwb/all-followers-count-x.js",\n  "src/core/rulesets/svwb/class-conditions.js",\n  "src/core/rulesets/svwb/generic-effects.js",\n  "src/core/rulesets/svwb/effect-resolver.js"\n];',
    label="effective card-type test inventory",
)
text = replace_exact(
    text,
    'test("Fuse and natural evolution share the main-phase actor guard", async () => {\n  const fuse = await read("src/core/rulesets/svwb/fuse.js");\n  const evolutionActions = await read("src/core/rulesets/svwb/evolution-actions.js");\n\n  for (const [path, source] of [["fuse", fuse], ["evolution-actions", evolutionActions]]) {',
    'test("Fuse, natural evolution and the action resolver share the main-phase actor guard", async () => {\n  const fuse = await read("src/core/rulesets/svwb/fuse.js");\n  const evolutionActions = await read("src/core/rulesets/svwb/evolution-actions.js");\n  const actionResolver = await read("src/core/rulesets/svwb/action-resolver.js");\n\n  for (const [path, source] of [["fuse", fuse], ["evolution-actions", evolutionActions], ["action-resolver", actionResolver]]) {',
    label="main actor guard regression extension",
)
insertion = '''\n\ntest("action resolver and generic effects reuse shared V6 runtime stats", async () => {\n  const actionResolver = await read("src/core/rulesets/svwb/action-resolver.js");\n  const genericEffects = await read("src/core/rulesets/svwb/generic-effects.js");\n\n  assert.match(actionResolver, /currentMaxDefenseIgnoringDamage/);\n  assert.doesNotMatch(actionResolver, /function\\s+currentAttack\\s*\\(/);\n  assert.doesNotMatch(actionResolver, /function\\s+currentMaxDefense\\s*\\(/);\n\n  for (const helper of ["currentAttack", "currentDefense", "currentMaxDefense", "effectiveCardType"]) {\n    assert.match(genericEffects, new RegExp(`\\b${helper}\\b`), helper);\n  }\n  assert.match(genericEffects, /from "\\.\\/runtime-card-state\\.js"/);\n  assert.doesNotMatch(genericEffects, /function\\s+currentAttack\\s*\\(/);\n  assert.doesNotMatch(genericEffects, /function\\s+currentDefense\\s*\\(/);\n  assert.doesNotMatch(genericEffects, /function\\s+currentMaxDefense\\s*\\(/);\n});\n'''
marker = '\ntest("max-defense helpers keep live-defense and undamaged fallbacks distinct", () => {'
text = replace_exact(text, marker, insertion + marker, label="runtime stat regression insertion")
write(path, text)
