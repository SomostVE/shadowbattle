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
    r'''  /\bgive all other allied followers(?: on the field)?\s+\+\d+\s*\/\s*\+\d+\b/gi,''',
    r'''  /\bgive all (?:other )?allied followers(?: on the field)?\s+\+\d+\s*\/\s*\+\d+\b/gi,'''
)
replace_once(
    generic,
    r'''  collect(value, /\bgive all other allied followers(?: on the field)?\s+\+(\d+)\s*\/\s*\+(\d+)\b/gi, match => ({
    kind: "allied-buff",
    attack: Number(match[1]) || 0,
    defense: Number(match[2]) || 0,
    excludeSource: true
  }), effects);''',
    r'''  collect(value, /\bgive all (other )?allied followers(?: on the field)?\s+\+(\d+)\s*\/\s*\+(\d+)\b/gi, match => ({
    kind: "allied-buff",
    attack: Number(match[2]) || 0,
    defense: Number(match[3]) || 0,
    excludeSource: Boolean(match[1])
  }), effects);'''
)

tests = "tests/worlds-beyond-generic-effects-v6.test.js"
p = Path(tests)
text = p.read_text()
anchor = '''test("enemy-wide stat reduction clamps attack and destroys followers at zero defense", () => {'''
insert = '''test("allied-wide buffs include the source follower", () => {
  const game = readyGame();
  const ally = follower("allied-wide-ally", 0, { attack: 2, defense: 3 });
  game.players[0].board.push(ally);
  const card = replaceHandCard(game, {
    id: "allied-wide-buffer",
    name: "Allied Wide Buffer",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Give all allied followers on the field +2/+3."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const source = game.players[0].board.find(unit => unit.cardId === "allied-wide-buffer");
  assert.equal(ally.attack, 4);
  assert.equal(ally.defense, 6);
  assert.equal(ally.maxDefense, 6);
  assert.equal(source.attack, 3);
  assert.equal(source.defense, 4);
  assert.equal(source.maxDefense, 4);
  assert.equal(resolvedPlayTrigger(game)?.payload.resolved, true);
});

test("Ironcrown-style mode can buff all allied followers", () => {
  const game = readyGame();
  const ally = follower("iron-ally", 0, { attack: 2, defense: 2 });
  game.players[0].board.push(ally);
  const spell = replaceHandCard(game, {
    id: "iron-mode",
    name: "Ironcrown Majesty",
    class: "Swordcraft",
    type: "Spell",
    cost: 0,
    keywords: ["Mode"],
    text: "Select a Mode to activate.\\n1. Summon a Steelclad Knight and Knight.\\n2. Give all allied followers on the field +1/+1."
  });

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId && item.playMode?.modeIndex === 2);
  assert.ok(action, "global allied-buff mode should be legal");
  game.dispatch(action);

  assert.equal(ally.attack, 3);
  assert.equal(ally.defense, 3);
  assert.equal(ally.maxDefense, 3);
});

'''
if insert not in text:
    if anchor not in text:
        raise SystemExit("missing test insertion anchor")
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
    if "0.5.31" in text:
        continue
    if "0.5.30" not in text:
        raise SystemExit(f"missing 0.5.30 version anchor in {path}")
    p.write_text(text.replace("0.5.30", "0.5.31"))
