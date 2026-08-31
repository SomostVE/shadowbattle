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
    r'''  /\bgive all allied followers(?: on the field)?\s+Barrier\b/gi,''',
    r'''  /\bgive all (?:other )?allied followers(?: on the field)?\s+(?:Ward|Bane|Barrier)\b/gi,
  /\bgive all (?:other )?allied [A-Za-z][A-Za-z0-9'’\-]* followers(?: on the field)?\s+(?:Ward|Bane|Barrier)\b/gi,'''
)
replace_once(
    generic,
    r'''  collect(value, /\bgive all allied followers(?: on the field)?\s+Barrier\b/gi, () => ({
    kind: "allied-barrier"
  }), effects);''',
    r'''  collect(value, /\bgive all (other )?allied followers(?: on the field)?\s+(Ward|Bane|Barrier)\b/gi, match => ({
    kind: "allied-keyword",
    keyword: match[2],
    excludeSource: Boolean(match[1])
  }), effects);
  collect(value, /\bgive all (other )?allied ([A-Za-z][A-Za-z0-9'’\-]*) followers(?: on the field)?\s+(Ward|Bane|Barrier)\b/gi, match => ({
    kind: "allied-keyword",
    keyword: match[3],
    excludeSource: Boolean(match[1]),
    requiredClass: /craft$/i.test(match[2]) ? match[2] : null,
    requiredTrait: /craft$/i.test(match[2]) ? null : match[2]
  }), effects);'''
)
replace_once(
    generic,
    '''    if (effect.kind === "allied-barrier") {
      applied = grantAlliedBarrier(session, playerIndex) || applied;
      continue;
    }''',
    '''    if (effect.kind === "allied-keyword") {
      applied = grantAlliedKeyword(session, playerIndex, source, effect) || applied;
      continue;
    }'''
)
replace_once(
    generic,
    '''function grantAlliedBarrier(session, playerIndex) {
  let applied = false;
  for (const unit of session.getPlayer(playerIndex).board.filter(card => cardType(card) === "follower")) {
    applied = grantWorldsBeyondKeyword(unit, "Barrier") || applied;
  }
  return applied;
}''',
    '''function grantAlliedKeyword(session, playerIndex, source, effect) {
  let applied = false;
  for (const unit of session.getPlayer(playerIndex).board.filter(card => cardType(card) === "follower")) {
    if (effect.excludeSource && unit.instanceId === source?.instanceId) continue;
    if (effect.requiredTrait && !hasCardTrait(unit, effect.requiredTrait)) continue;
    if (effect.requiredClass && cardClass(unit) !== String(effect.requiredClass).trim().toLowerCase()) continue;
    applied = grantWorldsBeyondKeyword(unit, effect.keyword) || applied;
  }
  return applied;
}'''
)

tests = "tests/worlds-beyond-generic-effects-v6.test.js"
replace_once(
    tests,
    '''  assert.equal(source.maxDefense, 2);
});

test("enemy-wide stat reduction clamps attack and destroys followers at zero defense", () => {''',
    '''  assert.equal(source.maxDefense, 2);
});

test("trait-filtered allied keyword grants affect only matching followers", () => {
  const game = readyGame();
  const pixie = follower("keyword-pixie", 0, { traits: ["Pixie"] });
  const plain = follower("keyword-plain", 0);
  game.players[0].board.push(pixie, plain);
  const spell = replaceHandCard(game, {
    id: "pixie-bane-wide",
    name: "Pixie Bane Wide",
    class: "Forestcraft",
    type: "Spell",
    cost: 0,
    keywords: [],
    text: "Give all allied Pixie followers on the field Bane."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

  assert.equal((pixie.grantedKeywords ?? []).includes("Bane"), true);
  assert.equal((plain.grantedKeywords ?? []).includes("Bane"), false);
  assert.equal(resolvedPlayTrigger(game)?.payload.resolved, true);
});

test("trait-filtered Ward grants include matching source and allies", () => {
  const game = readyGame();
  const ally = follower("puppetry-ally", 0, { traits: ["Puppetry"] });
  const plain = follower("non-puppetry-ally", 0);
  game.players[0].board.push(ally, plain);
  const card = replaceHandCard(game, {
    id: "puppetry-ward-source",
    name: "Puppetry Ward Source",
    class: "Portalcraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    traits: ["Puppetry"],
    keywords: ["Fanfare"],
    text: "Fanfare: Give all allied Puppetry followers on the field Ward."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const source = game.players[0].board.find(unit => unit.cardId === "puppetry-ward-source");
  assert.equal((ally.grantedKeywords ?? []).includes("Ward"), true);
  assert.equal((source.grantedKeywords ?? []).includes("Ward"), true);
  assert.equal((plain.grantedKeywords ?? []).includes("Ward"), false);
});

test("all-other allied keyword grants exclude the source follower", () => {
  const game = readyGame();
  const ally = follower("barrier-other-ally", 0);
  game.players[0].board.push(ally);
  const card = replaceHandCard(game, {
    id: "barrier-other-source",
    name: "Barrier Other Source",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Give all other allied followers on the field Barrier."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const source = game.players[0].board.find(unit => unit.cardId === "barrier-other-source");
  assert.equal(ally.barrierActive, true);
  assert.equal(Boolean(source.barrierActive), false);
});

test("enemy-wide stat reduction clamps attack and destroys followers at zero defense", () => {'''
)

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
    if "0.5.33" in text:
        continue
    if "0.5.32" not in text:
        raise SystemExit(f"missing 0.5.32 version anchor in {path}")
    p.write_text(text.replace("0.5.32", "0.5.33"))
