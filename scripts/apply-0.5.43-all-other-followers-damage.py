from pathlib import Path


def repl(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing anchor: {path}")
    p.write_text(text.replace(old, new, 1))


def repl_all(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        if new in text:
            return
        raise SystemExit(f"missing repeated anchor: {path}")
    p.write_text(text.replace(old, new))


generic = "src/core/rulesets/svwb/generic-effects.js"
repl(generic,
'''const RANDOM_ENEMY_FOLLOWER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to\\\\s+" + NUMBER + "\\\\s+random enemy followers\\\\b", "gi");''',
'''const RANDOM_ENEMY_FOLLOWER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to\\\\s+" + NUMBER + "\\\\s+random enemy followers\\\\b", "gi");\nconst ALL_OTHER_FOLLOWER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to all other followers\\\\b", "gi");''')
repl(generic,
'''  RANDOM_ENEMY_FOLLOWER_DAMAGE,\n  LIVE_NEUTRAL_HAND_RANDOM_DAMAGE,''',
'''  RANDOM_ENEMY_FOLLOWER_DAMAGE,\n  ALL_OTHER_FOLLOWER_DAMAGE,\n  LIVE_NEUTRAL_HAND_RANDOM_DAMAGE,''')
repl(generic,
'''  collect(value, new RegExp(`\\\\bdeal\\\\s+${NUMBER}\\\\s+damage to both leaders\\\\b`, "gi"), match => ({\n    kind: "both-leaders-damage",\n    amount: numberWord(match[1])\n  }), effects);''',
'''  collect(value, new RegExp(`\\\\bdeal\\\\s+${NUMBER}\\\\s+damage to both leaders\\\\b`, "gi"), match => ({\n    kind: "both-leaders-damage",\n    amount: numberWord(match[1])\n  }), effects);\n  collect(value, ALL_OTHER_FOLLOWER_DAMAGE, match => ({\n    kind: "all-other-follower-damage",\n    amount: numberWord(match[1])\n  }), effects);''')
repl(generic,
'''    if (effect.kind === "leader-heal-by-live-hand-size") {\n      applied = healLeaderByLiveHandSize(session, playerIndex, source) || applied;\n      continue;\n    }''',
'''    if (effect.kind === "leader-heal-by-live-hand-size") {\n      applied = healLeaderByLiveHandSize(session, playerIndex, source) || applied;\n      continue;\n    }\n    if (effect.kind === "all-other-follower-damage") {\n      applied = damageAllOtherFollowers(session, playerIndex, source, effect.amount, destroyFollower) || applied;\n      continue;\n    }''')
repl(generic,
'''function damageEnemyFollowersByAlliedGolemCount(session, playerIndex, source, destroyFollower) {''',
'''function damageAllOtherFollowers(session, playerIndex, source, amount, destroyFollower) {\n  const damage = Math.max(0, Number(amount) || 0);\n  if (!damage) return false;\n  const sourceInstanceId = source?.instanceId ?? null;\n  const targets = [];\n  for (const owner of [0, 1]) {\n    for (const unit of session.getPlayer(owner).board) {\n      if (cardType(unit) !== "follower" || unit.instanceId === sourceInstanceId) continue;\n      targets.push({ owner, instanceId: unit.instanceId });\n    }\n  }\n\n  let applied = false;\n  for (const target of targets) {\n    const live = session.findBoardCard(target.owner, target.instanceId);\n    if (!live) continue;\n    session.damageFollower(target.owner, live.instanceId, damage, {\n      actor: playerIndex,\n      source,\n      reason: "ability",\n      resolveDeath: false\n    });\n    applied = true;\n  }\n\n  for (const target of targets) {\n    const damaged = session.findBoardCard(target.owner, target.instanceId);\n    if (!damaged || currentDefense(damaged) > 0) continue;\n    destroyFollower?.(session, target.owner, damaged.instanceId, {\n      actor: playerIndex,\n      source,\n      reason: "ability",\n      byAbility: true\n    });\n  }\n  return applied;\n}\n\nfunction damageEnemyFollowersByAlliedGolemCount(session, playerIndex, source, destroyFollower) {''')

resolver = "src/core/rulesets/svwb/effect-resolver.js"
repl(resolver,
'''import { baseText, section } from "./v5/battle-engine-v5-text.js";''',
'''import { costOf } from "./v5/battle-engine-v5-state.js";\nimport { baseText, section } from "./v5/battle-engine-v5-text.js";''')
repl_all(resolver,
'''const originalText = preprocessWorldsBeyondFuseText(source, triggerText(source, trigger, mode));''',
'''const originalText = resolveWorldsBeyondSourceCostCondition(preprocessWorldsBeyondFuseText(source, triggerText(source, trigger, mode)), source);''')
repl(resolver,
'''function resolveWorldsBeyondVariables(textValue, source, { session = null, playerIndex = null } = {}) {''',
'''function resolveWorldsBeyondSourceCostCondition(textValue, source) {\n  const currentCost = costOf(source);\n  return String(textValue ?? "").replace(\n    /\\bIf this card['’]?s cost (is|isn['’]?t) (\\d+),\\s*(draw\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+cards?)\\s*\\.?/gi,\n    (full, operator, threshold, effect) => {\n      const equal = currentCost === Number(threshold);\n      const active = /^is$/i.test(operator) ? equal : !equal;\n      return active ? `${effect}.` : " ";\n    }\n  );\n}\n\nfunction resolveWorldsBeyondVariables(textValue, source, { session = null, playerIndex = null } = {}) {''')


test = Path("tests/worlds-beyond-all-other-followers-damage-v6.test.js")
test.write_text('''import test from "node:test";\nimport assert from "node:assert/strict";\nimport { BATTLE_EVENT } from "../src/core/battle-events.js";\nimport { GAME_IDS } from "../src/core/game-catalog.js";\nimport { GameSession } from "../src/core/game-session.js";\nimport {\n  destroyWorldsBeyondFollower,\n  getWorldsBeyondTriggerSupport,\n  resolveWorldsBeyondTrigger\n} from "../src/core/rulesets/svwb/effect-resolver.js";\n\nfunction fillerDeck(prefix) {\n  return Array.from({ length: 40 }, (_, index) => ({\n    id: `${prefix}-${index}`,\n    name: `${prefix} ${index}`,\n    class: "Neutral",\n    type: "Follower",\n    cost: 9,\n    attack: 1,\n    defense: 1,\n    keywords: []\n  }));\n}\n\nfunction readyGame(seed = "all-other-followers-damage-v6") {\n  const game = new GameSession({\n    gameId: GAME_IDS.WORLDS_BEYOND,\n    seed,\n    firstPlayer: 0,\n    players: [\n      { name: "A", deck: fillerDeck("A") },\n      { name: "B", deck: fillerDeck("B") }\n    ]\n  });\n  game.start();\n  game.submitMulligan(0, []);\n  game.submitMulligan(1, []);\n  return game;\n}\n\nfunction definition(id, { cost = 1, attack = 1, defense = 1, text = "", keywords = [] } = {}) {\n  return { id, name: id, class: "Neutral", type: "Follower", cost, attack, defense, text, keywords, traits: [] };\n}\n\nfunction boardFollower(card, owner, suffix) {\n  return {\n    instanceId: `${card.id}-${owner}-${suffix}`,\n    owner,\n    cardId: card.id,\n    card,\n    attack: card.attack,\n    defense: card.defense,\n    maxDefense: card.defense,\n    attacksRemaining: 1,\n    hasAttacked: false,\n    canAttackFollowers: true,\n    canAttackLeader: true,\n    evolved: false,\n    superEvolved: false\n  };\n}\n\ntest("Lifestealer-style Evolve damages every other follower but never the source", () => {\n  const game = readyGame("lifestealer-area");\n  const sourceCard = definition("lifestealer-style", { attack: 3, defense: 5, text: "Evolve: Deal 1 damage to all other followers." });\n  const alliedCard = definition("allied", { defense: 3 });\n  const enemyCard = definition("enemy", { defense: 2 });\n  const source = boardFollower(sourceCard, 0, "source");\n  const allied = boardFollower(alliedCard, 0, "ally");\n  const enemy = boardFollower(enemyCard, 1, "enemy");\n  game.registerCardDefinitions([sourceCard, alliedCard, enemyCard]);\n  game.players[0].board.push(source, allied);\n  game.players[1].board.push(enemy);\n\n  const support = getWorldsBeyondTriggerSupport(source, "evolve", null, game.players[0]);\n  const result = resolveWorldsBeyondTrigger(game, { trigger: "evolve", playerIndex: 0, source });\n\n  assert.equal(support.supported, true, support.residual || "support blocked");\n  assert.equal(result.unresolved, false);\n  assert.equal(source.defense, 5);\n  assert.equal(allied.defense, 2);\n  assert.equal(enemy.defense, 1);\n});\n\ntest("all-other follower damage applies every hit before resolving lethal destruction", () => {\n  const game = readyGame("all-other-atomic");\n  const sourceCard = definition("area-source", { text: "Evolve: Deal 2 damage to all other followers." });\n  const firstCard = definition("first", { defense: 1 });\n  const secondCard = definition("second", { defense: 1 });\n  const source = boardFollower(sourceCard, 0, "source");\n  const first = boardFollower(firstCard, 0, "first");\n  const second = boardFollower(secondCard, 1, "second");\n  game.registerCardDefinitions([sourceCard, firstCard, secondCard]);\n  game.players[0].board.push(source, first);\n  game.players[1].board.push(second);\n  const before = game.events.length;\n\n  resolveWorldsBeyondTrigger(game, { trigger: "evolve", playerIndex: 0, source });\n\n  const events = game.events.slice(before);\n  const damageIndices = events.map((event, index) => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE ? index : -1).filter(index => index >= 0);\n  const destroyIndices = events.map((event, index) => event.type === BATTLE_EVENT.FOLLOWER_DESTROYED ? index : -1).filter(index => index >= 0);\n  assert.equal(damageIndices.length, 2);\n  assert.equal(destroyIndices.length, 2);\n  assert.ok(Math.max(...damageIndices) < Math.min(...destroyIndices), "all area hits must land before the first lethal destruction");\n  assert.equal(game.players[0].cemetery.some(item => item.instanceId === first.instanceId), true);\n  assert.equal(game.players[1].cemetery.some(item => item.instanceId === second.instanceId), true);\n});\n\ntest("Supplicant-style current-cost condition omits Draw at printed cost 5", () => {\n  const game = readyGame("supplicant-base-cost");\n  const card = definition("supplicant-style", {\n    cost: 5,\n    defense: 2,\n    text: "Fanfare: Deal 3 damage to all other followers. If this card's cost isn't 5, draw 2 cards."\n  });\n  const source = boardFollower(card, 0, "source");\n  game.registerCardDefinitions([card]);\n  game.players[0].board.push(source);\n  const handBefore = game.players[0].hand.length;\n\n  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);\n  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source });\n\n  assert.equal(support.supported, true, support.residual || "support blocked");\n  assert.equal(result.unresolved, false);\n  assert.equal(game.players[0].hand.length, handBefore);\n});\n\ntest("Supplicant-style current-cost condition draws when the live cost differs from 5", () => {\n  const game = readyGame("supplicant-reduced-cost");\n  const card = definition("supplicant-reduced", {\n    cost: 5,\n    defense: 2,\n    text: "Fanfare: Deal 3 damage to all other followers. If this card's cost isn't 5, draw 2 cards."\n  });\n  const source = boardFollower(card, 0, "source");\n  source.costDelta = -1;\n  const enemyCard = definition("enemy-target", { defense: 5 });\n  const enemy = boardFollower(enemyCard, 1, "enemy");\n  game.registerCardDefinitions([card, enemyCard]);\n  game.players[0].board.push(source);\n  game.players[1].board.push(enemy);\n  const handBefore = game.players[0].hand.length;\n\n  const support = getWorldsBeyondTriggerSupport(source, "play", null, game.players[0]);\n  const result = resolveWorldsBeyondTrigger(game, { trigger: "play", playerIndex: 0, source });\n\n  assert.equal(support.supported, true, support.residual || "support blocked");\n  assert.equal(result.unresolved, false);\n  assert.equal(enemy.defense, 2);\n  assert.equal(game.players[0].hand.length, handBefore + 2);\n});\n''')

for path in [
    "package.json", "version.json", "index.html", "api/index.html",
    "test/index.html", "decks/index.html", "library/index.html"
]:
    p = Path(path)
    text = p.read_text()
    if "0.5.43" not in text:
        if "0.5.42" not in text:
            raise SystemExit(f"missing version anchor: {path}")
        p.write_text(text.replace("0.5.42", "0.5.43"))
