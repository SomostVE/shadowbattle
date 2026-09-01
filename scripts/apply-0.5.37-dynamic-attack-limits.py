from pathlib import Path


def repl(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing anchor: {path}")
    p.write_text(text.replace(old, new, 1))


combat = "src/core/rulesets/svwb/combat-readiness.js"
repl(combat,
'''export function getWorldsBeyondAttackLimit(instance) {
  const match = cleanRulesText(instance?.card).match(/\\bCan attack\\s+(\\d+)\\s+times per turn\\b/i);
  const amount = Number(match?.[1] ?? 1) || 1;
  return Math.max(1, Math.min(10, amount));
}
''',
'''export function getWorldsBeyondAttackLimit(instance) {
  const override = Number(instance?.attackLimitOverride);
  if (Number.isFinite(override) && override > 0) return Math.max(1, Math.min(10, override));
  const match = cleanRulesText(instance?.card).match(/\\bCan attack\\s+(\\d+)\\s+times per turn\\b/i);
  const amount = Number(match?.[1] ?? 1) || 1;
  return Math.max(1, Math.min(10, amount));
}

export function grantWorldsBeyondAttackLimit(session, playerIndex, unit, amount) {
  if (!unit || cardType(unit) !== "follower") return false;
  const nextLimit = Math.max(1, Math.min(10, Number(amount) || 1));
  const previousLimit = Math.max(1, Number(unit.attackLimit ?? getWorldsBeyondAttackLimit(unit)) || 1);
  const rawRemaining = Number(unit.attacksRemaining);
  const previousRemaining = Number.isFinite(rawRemaining)
    ? Math.max(0, Math.min(previousLimit, rawRemaining))
    : previousLimit;
  const attacksSpent = Math.max(0, previousLimit - previousRemaining);
  const changed = Number(unit.attackLimitOverride) !== nextLimit || previousLimit !== nextLimit;

  unit.attackLimitOverride = nextLimit;
  unit.attackLimit = nextLimit;
  unit.attacksRemaining = Math.max(0, nextLimit - attacksSpent);
  refreshWorldsBeyondAttackReadiness(session, playerIndex, unit);
  return changed;
}
''')

generic = "src/core/rulesets/svwb/generic-effects.js"
repl(generic,
'''import { grantWorldsBeyondKeyword, refreshWorldsBeyondAttackReadiness } from "./combat-readiness.js";''',
'''import {
  grantWorldsBeyondAttackLimit,
  grantWorldsBeyondKeyword,
  refreshWorldsBeyondAttackReadiness
} from "./combat-readiness.js";''')
repl(generic,
'''const ADD_TO_DECK_COPIES = new RegExp(`\\\\badd\\\\s+${NUMBER}\\\\s+copies of\\\\s+${CARD_NAME}\\\\s+to your deck\\\\s*\\\\.?`, "gi");''',
'''const ADD_TO_DECK_COPIES = new RegExp(`\\\\badd\\\\s+${NUMBER}\\\\s+copies of\\\\s+${CARD_NAME}\\\\s+to your deck\\\\s*\\\\.?`, "gi");
const SELF_ATTACK_LIMIT_GRANT = /\\bgive (?:this follower|it)\\s+["“]?Can attack\\s+(\\d+)\\s+times per turn\\.?["”]?/gi;
const LEFTMOST_ALLIED_ATTACK_LIMIT_GRANT = /\\bgive the leftmost allied (?:(Neutral|[A-Za-z]+craft)\\s+)?follower(?: on the field)?\\s+["“]?Can attack\\s+(\\d+)\\s+times per turn\\.?["”]?/gi;''')
repl(generic,
'''  /\\bgive (?:this follower|it)\\s+Barrier\\b/gi
]);''',
'''  /\\bgive (?:this follower|it)\\s+Barrier\\b/gi,
  LEFTMOST_ALLIED_ATTACK_LIMIT_GRANT,
  SELF_ATTACK_LIMIT_GRANT
]);''')
repl(generic,
'''  collect(value, /\\bgive (?:this follower|it)\\s+Barrier\\b/gi, () => ({
    kind: "self-barrier"
  }), effects);
''',
'''  collect(value, LEFTMOST_ALLIED_ATTACK_LIMIT_GRANT, match => ({
    kind: "leftmost-allied-attack-limit",
    requiredClass: match[1] ?? null,
    amount: Number(match[2]) || 1
  }), effects);
  collect(value, SELF_ATTACK_LIMIT_GRANT, match => ({
    kind: "self-attack-limit",
    amount: Number(match[1]) || 1
  }), effects);
  collect(value, /\\bgive (?:this follower|it)\\s+Barrier\\b/gi, () => ({
    kind: "self-barrier"
  }), effects);
''')
repl(generic,
'''    if (effect.kind === "self-barrier") {
      applied = grantSelfBarrier(session, playerIndex, source) || applied;
    }
''',
'''    if (effect.kind === "leftmost-allied-attack-limit") {
      applied = grantLeftmostAlliedAttackLimit(session, playerIndex, effect) || applied;
      continue;
    }
    if (effect.kind === "self-attack-limit") {
      applied = grantSelfAttackLimit(session, playerIndex, source, effect.amount) || applied;
      continue;
    }
    if (effect.kind === "self-barrier") {
      applied = grantSelfBarrier(session, playerIndex, source) || applied;
    }
''')
repl(generic,
'''function grantSelfBarrier(session, playerIndex, source) {''',
'''function grantSelfAttackLimit(session, playerIndex, source, amount) {
  const follower = source?.instanceId ? session.findBoardCard(playerIndex, source.instanceId) : null;
  if (!follower || cardType(follower) !== "follower") return false;
  return grantWorldsBeyondAttackLimit(session, playerIndex, follower, amount);
}

function grantLeftmostAlliedAttackLimit(session, playerIndex, effect) {
  const wantedClass = String(effect.requiredClass ?? "").trim().toLowerCase();
  const follower = session.getPlayer(playerIndex).board.find(unit =>
    cardType(unit) === "follower" && (!wantedClass || cardClass(unit) === wantedClass)
  );
  if (!follower) return false;
  return grantWorldsBeyondAttackLimit(session, playerIndex, follower, effect.amount);
}

function grantSelfBarrier(session, playerIndex, source) {''')

zone = "src/core/zone-actions.js"
repl(zone,
'''  delete card.maxDefense;
  delete card.evolved;''',
'''  delete card.maxDefense;
  delete card.attackLimit;
  delete card.attackLimitOverride;
  delete card.evolved;''')

generated = "src/core/rulesets/svwb/generated-cards.js"
repl(generated,
'''    "attackLimit",
    "typeOverride"''',
'''    "attackLimit",
    "attackLimitOverride",
    "typeOverride"''')

for path in ["package.json", "version.json", "index.html", "api/index.html", "test/index.html", "decks/index.html", "library/index.html"]:
    p = Path(path)
    text = p.read_text()
    if "0.5.37" not in text:
        if "0.5.36" not in text:
            raise SystemExit(f"missing version anchor: {path}")
        p.write_text(text.replace("0.5.36", "0.5.37"))
