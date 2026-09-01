from pathlib import Path

path = Path("src/core/rulesets/svwb/generic-effects.js")
text = path.read_text(encoding="utf-8")
needle = r"your Crest\\s+"
replacement = r"your Crest\\s*:?\\s*"
if text.count(needle) < 2:
    raise SystemExit(f"expected at least 2 specific Crest regex anchors, found {text.count(needle)}")
text = text.replace(needle, replacement, 2)
path.write_text(text, encoding="utf-8")
