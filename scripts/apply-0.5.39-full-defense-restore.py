from pathlib import Path


def repl(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing anchor: {path}")
    p.write_text(text.replace(old, new, 1))


resolver = "src/core/rulesets/svwb/effect-resolver.js"
repl(resolver,
'''  compileWorldsBeyondPostTargetCommands,
  compileWorldsBeyondPreTargetCommands,
  compileWorldsBeyondTrailingFilteredDrawCommands
} from "./v6/effect-commands.js";''',
'''  compileWorldsBeyondPostTargetCommands,
  compileWorldsBeyondPreTargetCommands,
  compileWorldsBeyondTrailingFilteredDrawCommands,
  createWorldsBeyondLeaderHealCommand
} from "./v6/effect-commands.js";''')

repl(resolver,
'''    /\\b(?:restore|recover)\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+defense to your leader\\b/gi,''',
'''    /^\\s*fully restore the defense of this follower and restore the same amount to your leader\\b/gi,
    /^\\s*fully restore the defense of this follower\\b/gi,
    /\\b(?:restore|recover)\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+defense to your leader\\b/gi,''')

repl(resolver,
'''  let applied = false;

  if (returnToDeck) {''',
'''  let applied = false;

  const leadingRestore = resolveLeadingFullDefenseRestore(session, {
    text,
    playerIndex,
    source
  });
  applied = leadingRestore.applied || applied;

  if (returnToDeck) {''')

repl(resolver,
'''function resolveFollowerAreaDamage(session, targets, amount, { actor, source } = {}) {''',
'''function resolveLeadingFullDefenseRestore(session, { text, playerIndex, source } = {}) {
  const value = String(text ?? "");
  const compound = /^\\s*fully restore the defense of this follower and restore the same amount to your leader\\b/i.test(value);
  const standalone = /^\\s*fully restore the defense of this follower\\b/i.test(value);
  if (!compound && !standalone) return { applied: false, restored: 0, leaderHealed: 0 };

  const follower = source?.instanceId ? session.findBoardCard(playerIndex, source.instanceId) : null;
  if (!follower || cardType(follower) !== "follower") return { applied: false, restored: 0, leaderHealed: 0 };

  const before = Math.max(0, Number(follower.defense ?? follower.card?.defense ?? 0));
  const maximum = Math.max(before, Number(follower.maxDefense ?? follower.card?.defense ?? before));
  follower.defense = maximum;
  const restored = Math.max(0, maximum - before);
  let leaderHealed = 0;

  if (compound && restored > 0) {
    const [result] = resolveEffectCommands(session, [
      createWorldsBeyondLeaderHealCommand(playerIndex, restored, {
        reason: "ability",
        sourceCardId: source?.cardId ?? source?.card?.id ?? null,
        sourceCardName: source?.card?.name ?? null,
        metadata: {
          source: "card-text",
          stage: "leading-full-defense-restore",
          sourceInstanceId: source?.instanceId ?? null
        }
      })
    ]);
    leaderHealed = Math.max(0, Number(result?.healed ?? 0));
  }

  return {
    applied: restored > 0 || leaderHealed > 0,
    restored,
    leaderHealed
  };
}

function resolveFollowerAreaDamage(session, targets, amount, { actor, source } = {}) {''')

for path in ["package.json", "version.json", "index.html", "api/index.html", "test/index.html", "decks/index.html", "library/index.html"]:
    p = Path(path)
    text = p.read_text()
    if "0.5.39" not in text:
        if "0.5.38" not in text:
            raise SystemExit(f"missing version anchor: {path}")
        p.write_text(text.replace("0.5.38", "0.5.39"))
