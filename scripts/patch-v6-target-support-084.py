from pathlib import Path

path = Path("src/core/rulesets/svwb/effect-resolver.js")
text = path.read_text()
old = '''  if (targetSpec) {
    inspect = inspect
      .replace(/\\bselect (?:an )?(?:enemy|allied) follower(?: on the field)? and\\s*/gi, "")
      .replace(/\\bdeal(?: it)?\\s+\\d+\\s+damage(?: to (?:an|a|the) enemy follower)?\\b/gi, "")
      .replace(/\\bdestroy (?:an|a|the) enemy follower\\b/gi, "")
      .replace(/\\bbanish (?:an|a|the) enemy follower\\b/gi, "")
      .replace(/\\breturn (?:an|a|the) enemy follower to (?:its owner'?s|their) hand\\b/gi, "")
      .replace(/\\bset (?:an|a|the) enemy follower(?:'s|’s) defense to\\s+\\d+\\b/gi, "")
      .replace(/\\bset its defense to\\s+\\d+\\b/gi, "");
  }
'''
new = '''  if (targetSpec) inspect = stripSupportedTargetText(inspect);
'''
if old not in text:
    raise SystemExit("Target support stripping block not found")
path.write_text(text.replace(old, new, 1))
