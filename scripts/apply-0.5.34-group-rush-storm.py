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
    '''import { grantWorldsBeyondKeyword } from "./combat-readiness.js";''',
    '''import { grantWorldsBeyondKeyword, refreshWorldsBeyondAttackReadiness } from "./combat-readiness.js";'''
)
replace_once(
    generic,
    r'''  /\bgive all (?:other )?allied followers(?: on the field)?\s+(?:Ward|Bane|Barrier)\b/gi,
  /\bgive all (?:other )?allied [A-Za-z][A-Za-z0-9'’\-]* followers(?: on the field)?\s+(?:Ward|Bane|Barrier)\b/gi,''',
    r'''  /\bgive all (?:other )?allied followers(?: on the field)?\s+(?:Ward|Bane|Barrier|Rush|Storm)\b/gi,
  /\bgive all (?:other )?allied [A-Za-z][A-Za-z0-9'’\-]* followers(?: on the field)?\s+(?:Ward|Bane|Barrier|Rush|Storm)\b/gi,'''
)
replace_once(
    generic,
    r'''  collect(value, /\bgive all (other )?allied followers(?: on the field)?\s+(Ward|Bane|Barrier)\b/gi, match => ({''',
    r'''  collect(value, /\bgive all (other )?allied followers(?: on the field)?\s+(Ward|Bane|Barrier|Rush|Storm)\b/gi, match => ({'''
)
replace_once(
    generic,
    r'''  collect(value, /\bgive all (other )?allied ([A-Za-z][A-Za-z0-9'’\-]*) followers(?: on the field)?\s+(Ward|Bane|Barrier)\b/gi, match => ({''',
    r'''  collect(value, /\bgive all (other )?allied ([A-Za-z][A-Za-z0-9'’\-]*) followers(?: on the field)?\s+(Ward|Bane|Barrier|Rush|Storm)\b/gi, match => ({'''
)
replace_once(
    generic,
    '''    applied = grantWorldsBeyondKeyword(unit, effect.keyword) || applied;
  }
  return applied;
}''',
    '''    const granted = grantWorldsBeyondKeyword(unit, effect.keyword);
    if (!granted) continue;
    if (/^(?:Rush|Storm)$/i.test(String(effect.keyword ?? ""))) {
      refreshWorldsBeyondAttackReadiness(session, playerIndex, unit);
    }
    applied = true;
  }
  return applied;
}'''
)

tests = "tests/worlds-beyond-generic-effects-v6.test.js"
replace_once(
    tests,
    '''test("enemy-wide stat reduction clamps attack and destroys followers at zero defense", () => {''',
    '''test("group Rush grant refreshes same-turn followers for follower attacks only", () => {
  const game = readyGame();
  const ally = follower("rush-refresh-ally", 0, { attack: 2, defense: 3 });
  ally.playedTurn = game.turn;
  ally.attacksRemaining = 1;
  ally.hasAttacked = false;
  ally.canAttackFollowers = false;
  ally.canAttackLeader = false;
  const enemy = follower("rush-refresh-enemy", 1, { attack: 1, defense: 3 });
  game.players[0].board.push(ally);
  game.players[1].board.push(enemy);
  const spell = replaceHandCard(game, {
    id: "group-rush",
    name: "Group Rush",
    type: "Spell",
    cost: 0,
    keywords: [],
    text: "Give all allied followers on the field Rush."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

  const attacks = game.listLegalActions(0).filter(action => action.type === "attack" && action.attackerInstanceId === ally.instanceId);
  assert.equal(attacks.some(action => action.targetInstanceId === enemy.instanceId), true);
  assert.equal(attacks.some(action => action.target === "leader" || !action.targetInstanceId), false);
  assert.equal(ally.attacksRemaining, 1);
});

test("group Storm grant refreshes same-turn followers for leader attacks", () => {
  const game = readyGame();
  const ally = follower("storm-refresh-ally", 0, { attack: 2, defense: 3 });
  ally.playedTurn = game.turn;
  ally.attacksRemaining = 1;
  ally.hasAttacked = false;
  ally.canAttackFollowers = false;
  ally.canAttackLeader = false;
  game.players[0].board.push(ally);
  const spell = replaceHandCard(game, {
    id: "group-storm",
    name: "Group Storm",
    type: "Spell",
    cost: 0,
    keywords: [],
    text: "Give all allied followers on the field Storm."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

  const attacks = game.listLegalActions(0).filter(action => action.type === "attack" && action.attackerInstanceId === ally.instanceId);
  assert.equal(attacks.some(action => action.target === "leader" || !action.targetInstanceId), true);
  assert.equal(ally.attacksRemaining, 1);
});

test("group Rush or Storm never restores an already spent attack", () => {
  for (const keyword of ["Rush", "Storm"]) {
    const game = readyGame();
    const ally = follower(`spent-${keyword.toLowerCase()}-ally`, 0, { attack: 2, defense: 3 });
    ally.playedTurn = game.turn;
    ally.attacksRemaining = 0;
    ally.hasAttacked = true;
    ally.canAttackFollowers = false;
    ally.canAttackLeader = false;
    game.players[0].board.push(ally);
    const spell = replaceHandCard(game, {
      id: `spent-${keyword.toLowerCase()}-grant`,
      name: `Spent ${keyword} Grant`,
      type: "Spell",
      cost: 0,
      keywords: [],
      text: `Give all allied followers on the field ${keyword}.`
    });

    game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

    assert.equal(ally.attacksRemaining, 0);
    assert.equal(game.listLegalActions(0).some(action => action.type === "attack" && action.attackerInstanceId === ally.instanceId), false);
  }
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
    if "0.5.34" in text:
        continue
    if "0.5.33" not in text:
        raise SystemExit(f"missing 0.5.33 version anchor in {path}")
    p.write_text(text.replace("0.5.33", "0.5.34"))
