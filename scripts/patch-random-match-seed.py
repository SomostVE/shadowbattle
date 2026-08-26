from pathlib import Path

controller_path = Path("src/test/battle-action-lab.js")
controller = controller_path.read_text()

replacements = [
    (
        'import { GAME_IDS } from "../core/game-catalog.js";\n',
        'import { GAME_IDS } from "../core/game-catalog.js";\nimport { resolveMatchSeed } from "../core/match-seed.js";\n'
    ),
    (
        '  if (!humanDeck || !cpuDeck) return;\n\n  cpuController = createIntermediateController({\n    seed: `${ui.seed.value || "shadowbattle-action-lab"}:cpu:1`,\n',
        '  if (!humanDeck || !cpuDeck) return;\n\n  const matchSeed = resolveMatchSeed(ui.seed.value);\n  cpuController = createIntermediateController({\n    seed: `${matchSeed}:cpu:1`,\n'
    ),
    (
        '    seed: ui.seed.value || "shadowbattle-action-lab",\n',
        '    seed: matchSeed,\n'
    )
]
for old, new in replacements:
    if old not in controller:
        raise SystemExit(f"Expected Battle Lab seed block not found: {old[:140]!r}")
    controller = controller.replace(old, new, 1)
controller_path.write_text(controller)

html_path = Path("test/index.html")
html = html_path.read_text()
old_seed = '<input id="test-seed" class="sb-control" value="shadowbattle-demo" autocomplete="off">'
new_seed = '<input id="test-seed" class="sb-control" placeholder="Random each match · enter a seed to replay" autocomplete="off">'
if old_seed not in html:
    raise SystemExit("Expected fixed Battle Lab seed input not found")
html = html.replace(old_seed, new_seed, 1)
html = html.replace(
    'Select two reference decks and start a deterministic GameSession.',
    'Select two reference decks. Leave Seed blank for a fresh shuffle or enter one to replay a match.',
    1
)
html = html.replace("0.4.82", "0.4.83")
html_path.write_text(html)

package_path = Path("package.json")
package = package_path.read_text()
if '"version": "0.4.82"' not in package:
    raise SystemExit("Expected package version 0.4.82 not found")
package_path.write_text(package.replace('"version": "0.4.82"', '"version": "0.4.83"', 1))

version_path = Path("version.json")
version = version_path.read_text()
if '"version": "0.4.82"' not in version:
    raise SystemExit("Expected public version 0.4.82 not found")
version_path.write_text(version.replace('"version": "0.4.82"', '"version": "0.4.83"', 1))
