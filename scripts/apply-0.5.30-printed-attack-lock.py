from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


readiness = "src/core/rulesets/svwb/combat-readiness.js"
replace_once(
    readiness,
    '''  if (unit.playedTurn == null) unit.playedTurn = session.turn;
  unit.attackLimit = getWorldsBeyondAttackLimit(unit);''',
    '''  if (unit.playedTurn == null) unit.playedTurn = session.turn;
  if (hasWorldsBeyondPrintedAttackLock(unit)) unit.permanentAttackLock = true;
  unit.attackLimit = getWorldsBeyondAttackLimit(unit);'''
)

replace_once(
    readiness,
    '''export function getWorldsBeyondAttackLimit(instance) {
  const match = cleanRulesText(instance?.card).match(/\\bCan attack\\s+(\\d+)\\s+times per turn\\b/i);
  const amount = Number(match?.[1] ?? 1) || 1;
  return Math.max(1, Math.min(10, amount));
}

export function getWorldsBeyondWardFollowers''',
    '''export function getWorldsBeyondAttackLimit(instance) {
  const match = cleanRulesText(instance?.card).match(/\\bCan attack\\s+(\\d+)\\s+times per turn\\b/i);
  const amount = Number(match?.[1] ?? 1) || 1;
  return Math.max(1, Math.min(10, amount));
}

export function hasWorldsBeyondPrintedAttackLock(instance) {
  return /(?:^|[\\r\\n])\\s*Can['’]?t attack followers or leaders\\s*\\.?\\s*(?=$|[\\r\\n])/im.test(cleanRulesText(instance?.card));
}

export function getWorldsBeyondWardFollowers'''
)

text_file = "src/core/rulesets/svwb/v5/battle-engine-v5-text.js"
replace_once(
    text_file,
    '''|Can attack\\s+\\d+\\s+times per turn\\s*\\.?|Can['’]?t be destroyed by abilities\\s*\\.?|Can['’]?t be played\\s*\\.?)''',
    '''|Can attack\\s+\\d+\\s+times per turn\\s*\\.?|Can['’]?t attack followers or leaders\\s*\\.?|Can['’]?t be destroyed by abilities\\s*\\.?|Can['’]?t be played\\s*\\.?)'''
)

test_path = Path("tests/worlds-beyond-printed-attack-lock-v6.test.js")
if not test_path.exists():
    test_path.write_text('''import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  hasWorldsBeyondPrintedAttackLock
} from "../src/core/rulesets/svwb/combat-readiness.js";
import { getWorldsBeyondTriggerSupport } from "../src/core/rulesets/svwb/effect-resolver.js";

function card(id, extra = {}) {
  return {
    id,
    name: id,
    class: "Swordcraft",
    type: "Follower",
    cost: 0,
    attack: 3,
    defense: 3,
    keywords: [],
    traits: [],
    text: "",
    ...extra
  };
}

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`, { cost: 9 }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "printed-attack-lock",
    firstPlayer: 0,
    players: [
      { name: "Sword", className: "Swordcraft", deck: fillerDeck("A") },
      { name: "Enemy", className: "Swordcraft", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, definition) {
  const instance = game.players[0].hand[0];
  assert.ok(instance);
  instance.card = definition;
  instance.cardId = definition.id;
  game.registerCardDefinitions([definition]);
  return instance;
}

function attacksFor(game, instanceId) {
  return game.listLegalActions(0).filter(action => action.type === "attack" && action.attackerInstanceId === instanceId);
}

const UNMOVING = card(10523110, {
  name: "Unmoving Tactician",
  cost: 3,
  attack: 3,
  defense: 4,
  keywords: ["Super-Evolve", "Steelclad Knight"],
  text: "Can't attack followers or leaders.\\nAt the end of your turn, summon a Steelclad Knight.\\n\\nSuper-Evolve: Give all other allied followers on the field +3/+3."
});

test("standalone printed attack restriction is passive support metadata", () => {
  const source = { instanceId: "unmoving-source", owner: 0, cardId: UNMOVING.id, card: UNMOVING };
  const support = getWorldsBeyondTriggerSupport(source, "play", null, {
    index: 0,
    className: "Swordcraft",
    board: [],
    hand: [],
    resources: { pp: 10, maxPp: 10, rally: 0, evolutionPoints: 2, superEvolutionPoints: 2 }
  });
  assert.equal(support.supported, true);
  assert.equal(support.residual, "");
  assert.equal(support.text, "");
});

test("Unmoving Tactician initializes a permanent attack lock from printed text", () => {
  const game = readyGame();
  const handCard = replaceHandCard(game, { ...UNMOVING, cost: 0 });
  game.dispatch({ type: "play-card", player: 0, cardInstanceId: handCard.instanceId });
  const unit = game.findBoardCard(0, handCard.instanceId);
  assert.ok(unit);
  assert.equal(unit.permanentAttackLock, true);
  assert.equal(unit.canAttackFollowers, false);
  assert.equal(unit.canAttackLeader, false);
  assert.deepEqual(attacksFor(game, unit.instanceId), []);

  game.endTurn(0);
  game.endTurn(1);

  assert.equal(unit.permanentAttackLock, true);
  assert.equal(unit.attacksRemaining, 0);
  assert.equal(unit.canAttackFollowers, false);
  assert.equal(unit.canAttackLeader, false);
  assert.deepEqual(attacksFor(game, unit.instanceId), []);
});

test("quoted temporary attack-lock grants are not mistaken for a printed self restriction", () => {
  const temporaryGrant = card("temporary-lock-grant", {
    text: "Evolve: Select an enemy follower on the field and give it \\\"Can't attack followers or leaders\\\" until the end of your opponent's turn."
  });
  assert.equal(hasWorldsBeyondPrintedAttackLock({ card: UNMOVING }), true);
  assert.equal(hasWorldsBeyondPrintedAttackLock({ card: temporaryGrant }), false);
});
''')

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
    if "0.5.30" in text:
        continue
    if "0.5.29" not in text:
        raise SystemExit(f"missing 0.5.29 version anchor in {path}")
    p.write_text(text.replace("0.5.29", "0.5.30"))
