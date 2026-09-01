from pathlib import Path

path = Path("src/core/rulesets/svwb/generic-effects.js")
text = path.read_text(encoding="utf-8")
old_advance = 'const ADVANCE_SPECIFIC_CREST = new RegExp(`\\badvance the count of your Crest\\s+${CARD_NAME}\\s+by\\s+${NUMBER}\\b`, "gi");'
new_advance = 'const ADVANCE_SPECIFIC_CREST = new RegExp(`\\badvance the count of your Crest\\s*:?\\s*${CARD_NAME}\\s+by\\s+${NUMBER}\\b`, "gi");'
old_delay = 'const DELAY_SPECIFIC_CREST = new RegExp(`\\bdelay the count of your Crest\\s+${CARD_NAME}\\s+by\\s+${NUMBER}\\b`, "gi");'
new_delay = 'const DELAY_SPECIFIC_CREST = new RegExp(`\\bdelay the count of your Crest\\s*:?\\s*${CARD_NAME}\\s+by\\s+${NUMBER}\\b`, "gi");'
if old_advance not in text or old_delay not in text:
    raise SystemExit("missing Crest adjustment regex anchor")
text = text.replace(old_advance, new_advance, 1).replace(old_delay, new_delay, 1)
path.write_text(text, encoding="utf-8")
