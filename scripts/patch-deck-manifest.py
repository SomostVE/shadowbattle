from pathlib import Path

path = Path("src/core/game-session.js")
text = path.read_text()

old = '    this.players = players.map((player, index) => makePlayerShell(player, index));\n'
new = '    this.players = players.map((player, index) => makePlayerShell(player, index));\n    this.deckManifests = players.map(player => createDeckManifest(player?.deck));\n'
if old not in text:
    raise SystemExit("GameSession player initialization block not found")
text = text.replace(old, new, 1)

old = '''  listLegalActions(playerIndex = this.activePlayer) {
    if (typeof this.ruleset.listLegalActions !== "function") return [];
    return this.ruleset.listLegalActions(this, playerIndex);
  }

'''
new = '''  listLegalActions(playerIndex = this.activePlayer) {
    if (typeof this.ruleset.listLegalActions !== "function") return [];
    return this.ruleset.listLegalActions(this, playerIndex);
  }

  getDeckManifest(playerIndex) {
    this.getPlayer(playerIndex);
    return this.deckManifests[playerIndex].map(row => ({ ...row }));
  }

'''
if old not in text:
    raise SystemExit("GameSession listLegalActions block not found")
text = text.replace(old, new, 1)

marker = 'function makePlayerShell(input, index) {\n'
helper = '''function createDeckManifest(deck) {
  const rows = new Map();
  for (const value of Array.isArray(deck) ? deck : []) {
    const card = typeof value === "object" && value !== null ? value : { id: value };
    const cardId = card.id ?? card.cardId ?? value;
    const key = String(cardId);
    const existing = rows.get(key);
    if (existing) {
      existing.qty += 1;
      continue;
    }
    rows.set(key, {
      cardId,
      name: card.name ?? null,
      className: card.class ?? card.className ?? null,
      type: card.type ?? null,
      cost: Math.max(0, Number(card.cost ?? 0) || 0),
      qty: 1
    });
  }
  return Object.freeze([...rows.values()].map(row => Object.freeze({ ...row })));
}

'''
if marker not in text:
    raise SystemExit("GameSession helper insertion point not found")
text = text.replace(marker, helper + marker, 1)

path.write_text(text)
