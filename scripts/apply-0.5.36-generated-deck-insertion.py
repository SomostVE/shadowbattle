from pathlib import Path


def repl(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing anchor: {path}")
    p.write_text(text.replace(old, new, 1))


generated = "src/core/rulesets/svwb/generated-cards.js"
repl(generated,
'''export function createWorldsBeyondGeneratedInstance(session, playerIndex, card) {''',
'''export function addWorldsBeyondGeneratedCardsToDeck(session, playerIndex, card, { count = 1 } = {}) {
  if (!card || typeof card !== "object") return { added: 0, instances: [] };
  const player = session.getPlayer(playerIndex);
  const total = Math.max(0, Number(count) || 0);
  const instances = [];
  for (let index = 0; index < total; index += 1) {
    const instance = createWorldsBeyondGeneratedInstance(session, playerIndex, card);
    const insertionIndex = Math.floor(session.rng() * (player.deck.length + 1));
    player.deck.splice(insertionIndex, 0, instance);
    instances.push(instance);
  }
  return { added: instances.length, instances };
}

export function createWorldsBeyondGeneratedInstance(session, playerIndex, card) {''')

generic = "src/core/rulesets/svwb/generic-effects.js"
repl(generic,
'''import { addWorldsBeyondGeneratedCard } from "./generated-cards.js";''',
'''import { addWorldsBeyondGeneratedCard, addWorldsBeyondGeneratedCardsToDeck } from "./generated-cards.js";''')
repl(generic,
'''const LIVE_NEUTRAL_HAND_RANDOM_DAMAGE = /\\bdeal damage to (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+) random enemy followers equal to the number of Neutral cards in your hand\\b/gi;''',
'''const LIVE_NEUTRAL_HAND_RANDOM_DAMAGE = /\\bdeal damage to (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+) random enemy followers equal to the number of Neutral cards in your hand\\b/gi;
const ADD_TO_DECK_SINGLE = new RegExp(`\\\\badd\\\\s+(?:a|an|one)\\\\s+${CARD_NAME}\\\\s+to your deck\\\\s*\\\\.?`, "gi");
const ADD_TO_DECK_COPIES = new RegExp(`\\\\badd\\\\s+${NUMBER}\\\\s+copies of\\\\s+${CARD_NAME}\\\\s+to your deck\\\\s*\\\\.?`, "gi");''')
repl(generic,
'''  new RegExp(`\\\\badd\\\\s+${NUMBER}\\\\s+copies of\\\\s+[^.]+?\\\\s+to your hand\\\\s*\\\\.?\\\\s*$`, "gi"),''',
'''  ADD_TO_DECK_COPIES,
  ADD_TO_DECK_SINGLE,
  new RegExp(`\\\\badd\\\\s+${NUMBER}\\\\s+copies of\\\\s+[^.]+?\\\\s+to your hand\\\\s*\\\\.?\\\\s*$`, "gi"),''')
repl(generic,
'''export function stripWorldsBeyondGenericEffectText(text) {
  let inspect = String(text ?? "");''',
'''export function hasWorldsBeyondDrawBeforeGeneratedDeckInsertion(text) {
  const value = String(text ?? "");
  const drawIndex = value.search(/\\bdraw\\b/i);
  if (drawIndex < 0) return false;
  for (const pattern of [ADD_TO_DECK_COPIES, ADD_TO_DECK_SINGLE]) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      if ((match.index ?? -1) > drawIndex) return true;
    }
  }
  return false;
}

export function stripWorldsBeyondGenericEffectText(text) {
  let inspect = String(text ?? "");''')
repl(generic,
'''  collect(value, new RegExp(`[.!?]\\\\s+add\\\\s+(?:a|an|one)\\\\s+${CARD_NAME}\\\\s+to your hand\\\\s*\\\\.?\\\\s*$`, "gi"), match => ({
    kind: "add-to-hand",
    cardName: match[1].trim()
  }), effects);''',
'''  collect(value, ADD_TO_DECK_COPIES, match => ({
    kind: "add-to-deck",
    count: numberWord(match[1]),
    cardName: match[2].trim()
  }), effects);
  collect(value, ADD_TO_DECK_SINGLE, match => ({
    kind: "add-to-deck",
    count: 1,
    cardName: match[1].trim()
  }), effects);
  collect(value, new RegExp(`[.!?]\\\\s+add\\\\s+(?:a|an|one)\\\\s+${CARD_NAME}\\\\s+to your hand\\\\s*\\\\.?\\\\s*$`, "gi"), match => ({
    kind: "add-to-hand",
    cardName: match[1].trim()
  }), effects);''')
repl(generic,
'''    if (effect.kind === "add-to-hand") {
      applied = addGeneratedCardToHand(session, playerIndex, effect.cardName) || applied;
      continue;
    }''',
'''    if (effect.kind === "add-to-deck") {
      applied = addGeneratedCardsToDeck(session, playerIndex, effect.cardName, effect.count) || applied;
      continue;
    }
    if (effect.kind === "add-to-hand") {
      applied = addGeneratedCardToHand(session, playerIndex, effect.cardName) || applied;
      continue;
    }''')
repl(generic,
'''function addGeneratedCardToHand(session, playerIndex, cardName) {''',
'''function addGeneratedCardsToDeck(session, playerIndex, cardName, count) {
  const definition = session.findCardDefinition({ name: cardName });
  if (!definition) return false;
  const result = addWorldsBeyondGeneratedCardsToDeck(session, playerIndex, definition, { count });
  return result.added > 0;
}

function addGeneratedCardToHand(session, playerIndex, cardName) {''')

resolver = "src/core/rulesets/svwb/effect-resolver.js"
repl(resolver,
'''  resolveWorldsBeyondGenericEffects,
  stripWorldsBeyondGenericEffectText''',
'''  hasWorldsBeyondDrawBeforeGeneratedDeckInsertion,
  resolveWorldsBeyondGenericEffects,
  stripWorldsBeyondGenericEffectText''')
repl(resolver,
'''function unsupportedResidualText(text, { targetSpec = null, discardRequired = false, handReturnSelection = false } = {}) {
  let inspect = String(text ?? "");''',
'''function unsupportedResidualText(text, { targetSpec = null, discardRequired = false, handReturnSelection = false } = {}) {
  let inspect = String(text ?? "");
  const orderedDeckInsertionBlocked = hasWorldsBeyondDrawBeforeGeneratedDeckInsertion(inspect);''')
repl(resolver,
'''  inspect = stripWorldsBeyondGenericEffectText(inspect);

  return inspect''',
'''  inspect = stripWorldsBeyondGenericEffectText(inspect);
  if (orderedDeckInsertionBlocked) inspect = `${inspect} ordered deck insertion`;

  return inspect''')

for path in ["package.json", "version.json", "index.html", "api/index.html", "test/index.html", "decks/index.html", "library/index.html"]:
    p = Path(path)
    text = p.read_text()
    if "0.5.36" not in text:
        if "0.5.35" not in text:
            raise SystemExit(f"missing version anchor: {path}")
        p.write_text(text.replace("0.5.35", "0.5.36"))
