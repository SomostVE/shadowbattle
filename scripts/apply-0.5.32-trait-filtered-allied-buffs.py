from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


generic = "src/core/rulesets/svwb/generic-effects.js"
replace_once(
    generic,
    '''  /\\bgive all (?:other )?allied followers(?: on the field)?\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\b/gi,\n  /\\bgive all allied followers(?: on the field)?\\s+Barrier\\b/gi,''',
    '''  /\\bgive all (?:other )?allied followers(?: on the field)?\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\b/gi,\n  /\\bgive all (?:other )?allied [A-Za-z][A-Za-z0-9'’\\-]* followers(?: on the field)?\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\b/gi,\n  /\\bgive all allied followers(?: on the field)?\\s+Barrier\\b/gi,'''
)
replace_once(
    generic,
    '''  collect(value, /\\bgive all (other )?allied followers(?: on the field)?\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)\\b/gi, match => ({\n    kind: "allied-buff",\n    attack: Number(match[2]) || 0,\n    defense: Number(match[3]) || 0,\n    excludeSource: Boolean(match[1])\n  }), effects);\n  collect(value, /\\bgive all allied followers(?: on the field)?\\s+Barrier\\b/gi,''',
    '''  collect(value, /\\bgive all (other )?allied followers(?: on the field)?\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)\\b/gi, match => ({\n    kind: "allied-buff",\n    attack: Number(match[2]) || 0,\n    defense: Number(match[3]) || 0,\n    excludeSource: Boolean(match[1])\n  }), effects);\n  collect(value, /\\bgive all (other )?allied ([A-Za-z][A-Za-z0-9'’\\-]*) followers(?: on the field)?\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)\\b/gi, match => ({\n    kind: "allied-buff",\n    attack: Number(match[3]) || 0,\n    defense: Number(match[4]) || 0,\n    excludeSource: Boolean(match[1]),\n    requiredClass: /craft$/i.test(match[2]) ? match[2] : null,\n    requiredTrait: /craft$/i.test(match[2]) ? null : match[2]\n  }), effects);\n  collect(value, /\\bgive all allied followers(?: on the field)?\\s+Barrier\\b/gi,'''
)
replace_once(
    generic,
    '''  for (const unit of followers) {\n    if (effect.excludeSource && unit.instanceId === source?.instanceId) continue;\n    const attack = Math.max(0, Number(effect.attack) || 0);''',
    '''  for (const unit of followers) {\n    if (effect.excludeSource && unit.instanceId === source?.instanceId) continue;\n    if (effect.requiredTrait && !hasCardTrait(unit, effect.requiredTrait)) continue;\n    if (effect.requiredClass && cardClass(unit) !== String(effect.requiredClass).trim().toLowerCase()) continue;\n    const attack = Math.max(0, Number(effect.attack) || 0);'''
)
replace_once(
    generic,
    '''function cardType(instance) {\n  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();\n}\n\nfunction currentAttack''',
    '''function cardType(instance) {\n  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();\n}\n\nfunction cardClass(instance) {\n  return String(instance?.card?.class ?? instance?.class ?? "").trim().toLowerCase();\n}\n\nfunction currentAttack'''
)

tests = "tests/worlds-beyond-generic-effects-v6.test.js"
replace_once(
    tests,
    '''function follower(instanceId, owner, { attack = 2, defense = 3, keywords = [], name = instanceId } = {}) {\n  return {\n    instanceId,\n    owner,\n    cardId: instanceId,\n    card: { id: instanceId, name, type: "Follower", cost: 1, attack, defense, keywords },''',
    '''function follower(instanceId, owner, { attack = 2, defense = 3, keywords = [], traits = [], cardClass = "Neutral", name = instanceId } = {}) {\n  return {\n    instanceId,\n    owner,\n    cardId: instanceId,\n    card: { id: instanceId, name, class: cardClass, type: "Follower", cost: 1, attack, defense, keywords, traits },'''
)
p = Path(tests)
text = p.read_text()
anchor = '''test("enemy-wide stat reduction clamps attack and destroys followers at zero defense", () => {'''
insert = '''test("trait-filtered allied buffs affect only matching followers", () => {\n  const game = readyGame();\n  const pixie = follower("pixie-ally", 0, { attack: 2, defense: 2, traits: ["Pixie"] });\n  const artifact = follower("artifact-ally", 0, { attack: 3, defense: 3, traits: ["Artifact"] });\n  const plain = follower("plain-ally", 0, { attack: 4, defense: 4 });\n  game.players[0].board.push(pixie, artifact, plain);\n  const card = replaceHandCard(game, {\n    id: "pixie-wide-buffer",\n    name: "Pixie Wide Buffer",\n    class: "Forestcraft",\n    type: "Spell",\n    cost: 0,\n    keywords: [],\n    text: "Give all allied Pixie followers on the field +1/+2."\n  });\n\n  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });\n\n  assert.equal(pixie.attack, 3);\n  assert.equal(pixie.defense, 4);\n  assert.equal(pixie.maxDefense, 4);\n  assert.equal(artifact.attack, 3);\n  assert.equal(artifact.defense, 3);\n  assert.equal(plain.attack, 4);\n  assert.equal(plain.defense, 4);\n});\n\ntest("trait-filtered allied buffs include a matching source unless 'other' is printed", () => {\n  const game = readyGame();\n  const ally = follower("artifact-friend", 0, { attack: 2, defense: 2, traits: ["Artifact"] });\n  game.players[0].board.push(ally);\n  const card = replaceHandCard(game, {\n    id: "artifact-source",\n    name: "Artifact Source",\n    class: "Portalcraft",\n    type: "Follower",\n    cost: 0,\n    attack: 1,\n    defense: 1,\n    traits: ["Artifact"],\n    keywords: ["Fanfare"],\n    text: "Fanfare: Give all allied Artifact followers on the field +1/+1."\n  });\n\n  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });\n\n  const source = game.players[0].board.find(unit => unit.cardId === "artifact-source");\n  assert.equal(ally.attack, 3);\n  assert.equal(ally.defense, 3);\n  assert.equal(source.attack, 2);\n  assert.equal(source.defense, 2);\n  assert.equal(source.maxDefense, 2);\n});\n\n'''
if insert not in text:
    if anchor not in text:
        raise SystemExit("missing trait-buff test insertion anchor")
    p.write_text(text.replace(anchor, insert + anchor, 1))

for path in [
    "package.json",
    "version.json",
    "index.html",
    "api/index.html",
    "test/index.html",
    "decks/index.html",
    "library/index.html"
]:
    p = Path(path)
    text = p.read_text()
    if "0.5.32" in text:
        continue
    if "0.5.31" not in text:
        raise SystemExit(f"missing 0.5.31 version anchor in {path}")
    p.write_text(text.replace("0.5.31", "0.5.32"))
