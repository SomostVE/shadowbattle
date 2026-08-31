from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


resolver = "src/core/rulesets/svwb/effect-resolver.js"
replace_once(
    resolver,
    'import { banishBoardCard, destroyBoardAmulet, restoreOriginalCardForm, returnBoardCardToHand } from "../../zone-actions.js";\n',
    'import { banishBoardCard, destroyBoardAmulet, restoreOriginalCardForm, returnBoardCardToHand } from "../../zone-actions.js";\nimport { createWorldsBeyondExactCopyInstance } from "./generated-cards.js";\n'
)
replace_once(
    resolver,
    'const SUPPORTED_TARGET_KINDS = new Set(["damage", "destroy", "banish", "return", "set-defense", "stat-debuff", "stat-buff", "grant-keyword", "remove-keyword", "evolve-and-buff"]);',
    'const SUPPORTED_TARGET_KINDS = new Set(["damage", "destroy", "banish", "banish-exact-copy", "return", "set-defense", "stat-debuff", "stat-buff", "grant-keyword", "remove-keyword", "evolve-and-buff"]);'
)
anchor = r'''  match = value.match(/select an enemy follower(?: on the field)? with\s+(\d+)\s+defense or less and banish it/i);
  if (match) return { kind: "banish", selectedGrammar: true, targetSide: "enemy", maxDefense: Number(match[1]) || 0 };
'''
replace_once(
    resolver,
    anchor,
    r'''  match = value.match(/select an enemy follower(?: on the field)? with\s+(\d+)\s+attack or less,?\s*banish it,?\s*and summon an exact copy of it/i);
  if (match) return { kind: "banish-exact-copy", selectedGrammar: true, targetSide: "enemy", maxAttack: Number(match[1]) || 0 };

''' + anchor
)
replace_once(
    resolver,
    '    if (targetSpec?.maxDefense != null && Number(unit.defense ?? unit.card?.defense ?? 0) > Number(targetSpec.maxDefense)) return false;\n',
    '    if (targetSpec?.maxAttack != null && Number(unit.attack ?? unit.card?.attack ?? 0) > Number(targetSpec.maxAttack)) return false;\n    if (targetSpec?.maxDefense != null && Number(unit.defense ?? unit.card?.defense ?? 0) > Number(targetSpec.maxDefense)) return false;\n'
)
replace_once(
    resolver,
    '    /\\bselect an enemy follower(?: on the field)? with\\s+\\d+\\s+defense or less and banish it\\b/gi,\n',
    '    /\\bselect an enemy follower(?: on the field)? with\\s+\\d+\\s+attack or less,?\\s*banish it,?\\s*and summon an exact copy of it\\b/gi,\n    /\\bselect an enemy follower(?: on the field)? with\\s+\\d+\\s+defense or less and banish it\\b/gi,\n'
)
replace_once(
    resolver,
    '''    } else if (targetSpec.kind === "banish") {
      const banished = Boolean(banishBoardCard(session, targetPlayer, target.instanceId, { actor: playerIndex, source, reason: "ability" }));
      applied = banished || applied;
''',
    '''    } else if (targetSpec.kind === "banish-exact-copy") {
      const exactCopy = createWorldsBeyondExactCopyInstance(session, playerIndex, target, { preserveBoardState: true });
      const banished = Boolean(banishBoardCard(session, targetPlayer, target.instanceId, { actor: playerIndex, source, reason: "ability" }));
      if (banished && exactCopy) {
        const player = session.getPlayer(playerIndex);
        if (player.board.length < Number(session.ruleset.maxBoardSize ?? 5)) {
          exactCopy.playedTurn = session.turn;
          exactCopy.hasAttacked = false;
          player.board.push(exactCopy);
          session.emit(BATTLE_EVENT.FOLLOWER_ENTER, {
            actor: playerIndex,
            payload: {
              card: session.cardView(exactCopy),
              position: player.board.length - 1,
              reason: "exact-copy"
            }
          });
        }
      }
      applied = banished || applied;
    } else if (targetSpec.kind === "banish") {
      const banished = Boolean(banishBoardCard(session, targetPlayer, target.instanceId, { actor: playerIndex, source, reason: "ability" }));
      applied = banished || applied;
'''
)

generated = "src/core/rulesets/svwb/generated-cards.js"
replace_once(
    generated,
    '''export function createWorldsBeyondExactCopyInstance(session, playerIndex, source) {
  if (!source?.card) return null;
  const copy = createWorldsBeyondGeneratedInstance(session, playerIndex, source.card);
  copy.cardId = source.cardId ?? source.card?.id ?? copy.cardId;
  copy.costDelta = Number(source.costDelta ?? 0);
  copy.attackBonus = Number(source.attackBonus ?? 0);
  copy.defenseBonus = Number(source.defenseBonus ?? 0);
  copy.spellboost = Number(source.spellboost ?? 0);
  if (Number.isFinite(Number(source.x))) copy.x = Number(source.x);
  if (Array.isArray(source.grantedKeywords)) copy.grantedKeywords = [...source.grantedKeywords];
  if (Array.isArray(source.fusedCards)) copy.fusedCards = source.fusedCards.map(item => ({ ...item }));
  if (Array.isArray(source.fusedNames)) copy.fusedNames = [...source.fusedNames];
  return copy;
}
''',
    '''export function createWorldsBeyondExactCopyInstance(session, playerIndex, source, { preserveBoardState = false } = {}) {
  if (!source?.card) return null;
  const copy = createWorldsBeyondGeneratedInstance(session, playerIndex, source.card);
  copy.cardId = source.cardId ?? source.card?.id ?? copy.cardId;
  copy.costDelta = Number(source.costDelta ?? 0);
  copy.attackBonus = Number(source.attackBonus ?? 0);
  copy.defenseBonus = Number(source.defenseBonus ?? 0);
  copy.spellboost = Number(source.spellboost ?? 0);
  if (Number.isFinite(Number(source.x))) copy.x = Number(source.x);
  if (Array.isArray(source.grantedKeywords)) copy.grantedKeywords = [...source.grantedKeywords];
  if (Array.isArray(source.fusedCards)) copy.fusedCards = source.fusedCards.map(item => ({ ...item }));
  if (Array.isArray(source.fusedNames)) copy.fusedNames = [...source.fusedNames];
  if (preserveBoardState) copyWorldsBeyondBoardState(copy, source);
  return copy;
}

function copyWorldsBeyondBoardState(copy, source) {
  const scalarFields = [
    "attack",
    "defense",
    "maxDefense",
    "evolved",
    "superEvolved",
    "imageOverride",
    "barrierActive",
    "permanentAttackLock",
    "destroyAtOpponentTurnEnd",
    "attackLimit",
    "typeOverride"
  ];
  for (const field of scalarFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) copy[field] = source[field];
  }
  if (Array.isArray(source.suppressedKeywords)) copy.suppressedKeywords = [...source.suppressedKeywords];
}
'''
)

Path("tests/worlds-beyond-enemy-exact-copy-v6.test.js").write_text('''import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { hasWorldsBeyondKeyword } from "../src/core/rulesets/svwb/combat-readiness.js";

function card(id, extra = {}) {
  return {
    id,
    name: id,
    class: "Portalcraft",
    type: "Follower",
    cost: 1,
    attack: 2,
    defense: 2,
    text: "",
    keywords: [],
    traits: [],
    ...extra
  };
}

function deck(prefix, special = null) {
  const rows = Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
  if (special) rows[0] = special;
  return rows;
}

function begin(achimCard) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "enemy-exact-copy-v6",
    firstPlayer: 0,
    players: [
      { name: "Human", className: "Portalcraft", deck: deck("A", achimCard) },
      { name: "CPU", className: "Portalcraft", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  game.players[0].resources.evolutionAvailable = true;
  game.players[0].resources.evolutionPoints = 2;
  return game;
}

function forceBoardFollower(game, playerIndex, definition, options = {}) {
  const player = game.players[playerIndex];
  const instance = player.hand.shift() ?? player.deck.shift();
  assert.ok(instance);
  instance.card = definition;
  instance.cardId = definition.id;
  instance.type = definition.type;
  instance.attack = Number(options.attack ?? definition.attack ?? 0);
  instance.defense = Number(options.defense ?? definition.defense ?? 0);
  instance.maxDefense = Number(options.maxDefense ?? definition.defense ?? instance.defense);
  instance.playedTurn = game.turn - 1;
  instance.evolved = Boolean(options.evolved || options.superEvolved);
  instance.superEvolved = Boolean(options.superEvolved);
  instance.attacksRemaining = 1;
  instance.hasAttacked = false;
  instance.canAttackFollowers = true;
  instance.canAttackLeader = true;
  if (options.grantedKeywords) instance.grantedKeywords = [...options.grantedKeywords];
  if (options.suppressedKeywords) instance.suppressedKeywords = [...options.suppressedKeywords];
  player.board.push(instance);
  return instance;
}

const ACHIM_TEXT = "Evolve: Select an enemy follower on the field with 4 attack or less, banish it, and summon an exact copy of it.";

test("Achim only offers legal 4-attack-or-less targets and preserves an evolved target's live state", () => {
  const achimCard = card("achim", { name: "Achim, Lord of Despair", attack: 3, defense: 3, text: ACHIM_TEXT });
  const game = begin(achimCard);
  const achim = forceBoardFollower(game, 0, achimCard);
  const legal = forceBoardFollower(game, 1, card("legal", { attack: 4, defense: 6, keywords: ["Rush"] }), {
    attack: 4,
    defense: 3,
    maxDefense: 8,
    evolved: true,
    grantedKeywords: ["Ward"],
    suppressedKeywords: ["Rush"]
  });
  const illegal = forceBoardFollower(game, 1, card("illegal", { attack: 5, defense: 5 }), { attack: 5 });

  const actions = game.listLegalActions(0).filter(action =>
    action.type === "evolve" && action.followerInstanceId === achim.instanceId
  );
  assert.deepEqual(actions.map(action => action.targetInstanceId), [legal.instanceId]);

  game.dispatch(actions[0]);

  assert.ok(game.players[1].banished.some(item => item.instanceId === legal.instanceId));
  assert.ok(game.players[1].board.some(item => item.instanceId === illegal.instanceId));
  const copy = game.players[0].board.find(item => item.instanceId !== achim.instanceId);
  assert.ok(copy);
  assert.equal(copy.cardId, legal.cardId);
  assert.equal(copy.evolved, true);
  assert.equal(copy.superEvolved, false);
  assert.equal(copy.attack, 4);
  assert.equal(copy.defense, 3);
  assert.equal(copy.maxDefense, 8);
  assert.equal(hasWorldsBeyondKeyword(copy, "Ward"), true);
  assert.equal(hasWorldsBeyondKeyword(copy, "Rush"), false);
  assert.equal(copy.canAttackFollowers, true);
  assert.equal(copy.canAttackLeader, false);
});

test("Achim preserves Super Evo state and its same-turn protections on the exact copy", () => {
  const achimCard = card("achim-super", { name: "Achim, Lord of Despair", attack: 3, defense: 3, text: ACHIM_TEXT });
  const game = begin(achimCard);
  const achim = forceBoardFollower(game, 0, achimCard);
  const target = forceBoardFollower(game, 1, card("super-target", { attack: 4, defense: 7 }), {
    attack: 4,
    defense: 6,
    maxDefense: 9,
    superEvolved: true
  });

  const action = game.listLegalActions(0).find(item =>
    item.type === "evolve"
    && item.followerInstanceId === achim.instanceId
    && item.targetInstanceId === target.instanceId
  );
  assert.ok(action);
  game.dispatch(action);

  const copy = game.players[0].board.find(item => item.instanceId !== achim.instanceId);
  assert.ok(copy);
  assert.equal(copy.evolved, true);
  assert.equal(copy.superEvolved, true);
  assert.equal(copy.attack, 4);
  assert.equal(copy.defense, 6);
  assert.equal(copy.maxDefense, 9);
  assert.equal(copy.canAttackFollowers, true);
  assert.equal(copy.canAttackLeader, false);

  const beforeDefense = copy.defense;
  assert.equal(game.damageFollower(0, copy.instanceId, 99, { actor: 1, reason: "test" }), 0);
  assert.equal(copy.defense, beforeDefense);
  assert.equal(game.destroyFollower(0, copy.instanceId, { actor: 1, reason: "test", byAbility: true }), null);
  assert.ok(game.findBoardCard(0, copy.instanceId));
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
    if "0.5.26" in text:
        p.write_text(text.replace("0.5.26", "0.5.27"))

if '"version": "0.5.27"' not in Path("package.json").read_text():
    raise SystemExit("package version did not update")
if '"version": "0.5.27"' not in Path("version.json").read_text():
    raise SystemExit("public version did not update")
