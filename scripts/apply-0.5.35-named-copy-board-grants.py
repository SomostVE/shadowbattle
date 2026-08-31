from pathlib import Path


def repl(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing anchor: {path}")
    p.write_text(text.replace(old, new, 1))


g = "src/core/rulesets/svwb/generic-effects.js"
repl(g,
'''  /\\bgive all (?:other )?allied [A-Za-z][A-Za-z0-9'’\\-]* followers(?: on the field)?\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\b/gi,
  /\\bgive all (?:other )?allied followers(?: on the field)?\\s+(?:Ward|Bane|Barrier|Rush|Storm)\\b/gi,''',
'''  /\\bgive all (?:other )?allied [A-Za-z][A-Za-z0-9'’\\-]* followers(?: on the field)?\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\b/gi,
  /\\bgive all (?:other )?allied copies of .+? on the field\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\b/gi,
  /\\bgive all (?:other )?allied followers(?: on the field)?\\s+(?:Ward|Bane|Barrier|Rush|Storm)\\b/gi,''')
repl(g,
'''  /\\bgive all (?:other )?allied [A-Za-z][A-Za-z0-9'’\\-]* followers(?: on the field)?\\s+(?:Ward|Bane|Barrier|Rush|Storm)\\b/gi,
  /\\bgive all enemy followers(?: on the field)?\\s+-\\d+\\s*\\/\\s*-\\d+\\b/gi,''',
'''  /\\bgive all (?:other )?allied [A-Za-z][A-Za-z0-9'’\\-]* followers(?: on the field)?\\s+(?:Ward|Bane|Barrier|Rush|Storm)\\b/gi,
  /\\bgive all (?:other )?allied copies of .+? on the field\\s+(?:Ward|Bane|Barrier|Rush|Storm)\\b/gi,
  /\\bgive all enemy followers(?: on the field)?\\s+-\\d+\\s*\\/\\s*-\\d+\\b/gi,''')
repl(g,
'''  collect(value, /\\bgive all (other )?allied followers(?: on the field)?\\s+(Ward|Bane|Barrier|Rush|Storm)\\b/gi, match => ({''',
'''  collect(value, /\\bgive all (other )?allied copies of (.+?) on the field\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)\\b/gi, match => ({
    kind: "allied-buff",
    attack: Number(match[3]) || 0,
    defense: Number(match[4]) || 0,
    excludeSource: Boolean(match[1]),
    requiredName: match[2].trim()
  }), effects);
  collect(value, /\\bgive all (other )?allied followers(?: on the field)?\\s+(Ward|Bane|Barrier|Rush|Storm)\\b/gi, match => ({''')
repl(g,
'''  collect(value, /\\bgive all enemy followers(?: on the field)?\\s+-(\\d+)\\s*\\/\\s*-(\\d+)\\b/gi, match => ({''',
'''  collect(value, /\\bgive all (other )?allied copies of (.+?) on the field\\s+(Ward|Bane|Barrier|Rush|Storm)\\b/gi, match => ({
    kind: "allied-keyword",
    keyword: match[3],
    excludeSource: Boolean(match[1]),
    requiredName: match[2].trim()
  }), effects);
  collect(value, /\\bgive all enemy followers(?: on the field)?\\s+-(\\d+)\\s*\\/\\s*-(\\d+)\\b/gi, match => ({''')
repl(g,
'''    if (effect.requiredClass && cardClass(unit) !== String(effect.requiredClass).trim().toLowerCase()) continue;
    const attack = Math.max(0, Number(effect.attack) || 0);''',
'''    if (effect.requiredClass && cardClass(unit) !== String(effect.requiredClass).trim().toLowerCase()) continue;
    if (effect.requiredName && cardName(unit) !== String(effect.requiredName).trim().toLowerCase()) continue;
    const attack = Math.max(0, Number(effect.attack) || 0);''')
repl(g,
'''    if (effect.requiredClass && cardClass(unit) !== String(effect.requiredClass).trim().toLowerCase()) continue;
    const granted = grantWorldsBeyondKeyword(unit, effect.keyword);''',
'''    if (effect.requiredClass && cardClass(unit) !== String(effect.requiredClass).trim().toLowerCase()) continue;
    if (effect.requiredName && cardName(unit) !== String(effect.requiredName).trim().toLowerCase()) continue;
    const granted = grantWorldsBeyondKeyword(unit, effect.keyword);''')
repl(g,
'''function currentAttack(instance) {''',
'''function cardName(instance) {
  return String(instance?.card?.name ?? instance?.name ?? "").trim().toLowerCase();
}

function currentAttack(instance) {''')

for path in ["package.json", "version.json", "index.html", "api/index.html", "test/index.html", "decks/index.html", "library/index.html"]:
    p = Path(path)
    text = p.read_text()
    if "0.5.35" not in text:
        if "0.5.34" not in text:
            raise SystemExit(f"missing version anchor: {path}")
        p.write_text(text.replace("0.5.34", "0.5.35"))
