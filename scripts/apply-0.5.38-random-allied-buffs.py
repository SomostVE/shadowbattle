from pathlib import Path


def repl(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing anchor: {path}")
    p.write_text(text.replace(old, new, 1))


generic = "src/core/rulesets/svwb/generic-effects.js"
repl(generic,
'''const LEFTMOST_ALLIED_ATTACK_LIMIT_GRANT = /\\bgive the leftmost allied (?:(Neutral|[A-Za-z]+craft)\\s+)?follower(?: on the field)?\\s+["“]?Can attack\\s+(\\d+)\\s+times per turn\\.?["”]?/gi;''',
'''const LEFTMOST_ALLIED_ATTACK_LIMIT_GRANT = /\\bgive the leftmost allied (?:(Neutral|[A-Za-z]+craft)\\s+)?follower(?: on the field)?\\s+["“]?Can attack\\s+(\\d+)\\s+times per turn\\.?["”]?/gi;
const RANDOM_ALLIED_FOLLOWER_BUFF = /\\bgive a random allied follower(?: on the field)?\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)\\b/gi;
const RANDOM_NAMED_ALLIED_FOLLOWER_BUFF = /\\bgive a random allied ([A-Z][A-Za-z0-9'’&,: \\-]+?) on the field\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)\\b/gi;
const RANDOM_SUPER_EVOLVED_ALLIED_FOLLOWER_BUFF = /\\bgive a random super-evolved allied follower(?: on the field)?\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)\\b/gi;''')
repl(generic,
'''  LIVE_NEUTRAL_HAND_RANDOM_DAMAGE,
  /\\bgive all (?:other )?allied followers''',
'''  LIVE_NEUTRAL_HAND_RANDOM_DAMAGE,
  RANDOM_SUPER_EVOLVED_ALLIED_FOLLOWER_BUFF,
  RANDOM_NAMED_ALLIED_FOLLOWER_BUFF,
  RANDOM_ALLIED_FOLLOWER_BUFF,
  /\\bgive all (?:other )?allied followers''')
repl(generic,
'''  collect(value, LIVE_HAND_SIZE_LEADER_HEAL, () => ({
    kind: "leader-heal-by-live-hand-size"
  }), effects);
  collect(value, /\\bgive all (other )?allied followers''',
'''  collect(value, LIVE_HAND_SIZE_LEADER_HEAL, () => ({
    kind: "leader-heal-by-live-hand-size"
  }), effects);
  collect(value, RANDOM_SUPER_EVOLVED_ALLIED_FOLLOWER_BUFF, match => ({
    kind: "random-allied-buff",
    attack: Number(match[1]) || 0,
    defense: Number(match[2]) || 0,
    requireSuperEvolved: true
  }), effects);
  collect(value, RANDOM_NAMED_ALLIED_FOLLOWER_BUFF, match => ({
    kind: "random-allied-buff",
    attack: Number(match[2]) || 0,
    defense: Number(match[3]) || 0,
    requiredName: match[1].trim()
  }), effects);
  collect(value, RANDOM_ALLIED_FOLLOWER_BUFF, match => ({
    kind: "random-allied-buff",
    attack: Number(match[1]) || 0,
    defense: Number(match[2]) || 0
  }), effects);
  collect(value, /\\bgive all (other )?allied followers''')
repl(generic,
'''    if (effect.kind === "allied-buff") {
      applied = buffAlliedFollowers(session, playerIndex, source, effect) || applied;
      continue;
    }
''',
'''    if (effect.kind === "random-allied-buff") {
      applied = buffRandomAlliedFollower(session, playerIndex, source, effect) || applied;
      continue;
    }
    if (effect.kind === "allied-buff") {
      applied = buffAlliedFollowers(session, playerIndex, source, effect) || applied;
      continue;
    }
''')
repl(generic,
'''function buffAlliedFollowers(session, playerIndex, source, effect) {''',
'''function buffRandomAlliedFollower(session, playerIndex, source, effect) {
  const requiredName = String(effect.requiredName ?? "").trim().toLowerCase();
  const candidates = session.getPlayer(playerIndex).board.filter(unit => {
    if (cardType(unit) !== "follower") return false;
    if (requiredName && cardName(unit) !== requiredName) return false;
    if (effect.requireSuperEvolved && !unit.superEvolved) return false;
    return true;
  });
  if (!candidates.length) return false;

  const roll = Math.max(0, Math.min(0.999999999999, Number(session.rng()) || 0));
  const unit = candidates[Math.min(candidates.length - 1, Math.floor(roll * candidates.length))];
  const attack = Math.max(0, Number(effect.attack) || 0);
  const defense = Math.max(0, Number(effect.defense) || 0);
  unit.attack = currentAttack(unit) + attack;
  unit.maxDefense = currentMaxDefense(unit) + defense;
  unit.defense = currentDefense(unit) + defense;
  session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
    actor: playerIndex,
    payload: {
      card: session.cardView(unit),
      attack,
      defense,
      reason: "ability",
      source: source ? session.cardView(source) : null
    }
  });
  return true;
}

function buffAlliedFollowers(session, playerIndex, source, effect) {''')

for path in ["package.json", "version.json", "index.html", "api/index.html", "test/index.html", "decks/index.html", "library/index.html"]:
    p = Path(path)
    text = p.read_text()
    if "0.5.38" not in text:
        if "0.5.37" not in text:
            raise SystemExit(f"missing version anchor: {path}")
        p.write_text(text.replace("0.5.37", "0.5.38"))
