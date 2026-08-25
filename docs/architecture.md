# ShadowBattle architecture

## Product boundary

ShadowBattle is the interactive **Human vs AI** layer.

It should not become another card-data monolith and it should not replace Beyond Decks.

- **Beyond Codex** owns official Worlds Beyond card acquisition and normalization.
- **Beyond Decks** owns deck building, collection, analysis, batch simulation and benchmark tooling for Worlds Beyond.
- **ShadowBattle** owns interactive matches, human input, AI turns, board presentation and game-specific adapters.

## Multi-game isolation

Every supported game has two stable identifiers:

- `gameId`: product-level identifier used by ShadowBattle.
- `dataNamespace`: prefix used for card/entity identity.

Initial allocation:

| Game | gameId | namespace |
| --- | --- | --- |
| Shadowverse: Worlds Beyond | `worlds-beyond` | `svwb` |
| Shadowverse CCG | `shadowverse-ccg` | `sv1` |
| Shadowverse: Champion's Battle | `champions-battle` | `svcb` |

A source card ID is never sufficient by itself. ShadowBattle creates a qualified UID:

```text
svwb:10114110
sv1:10114110
svcb:10114110
```

Those are three different entities even when the source happens to reuse the same numeric ID.

## Data providers

A provider is responsible only for loading and normalizing the data for one game.

```text
provider
├─ gameId
├─ dataNamespace
├─ source
└─ loadCards()
```

Providers must not merge datasets together. Cross-game UI can concatenate already-qualified entities only after normalization.

### Worlds Beyond

Source: **Beyond Codex API v1**.

ShadowBattle consumes Beyond Codex; it does not copy or extend Beyond Codex with CCG/Champion's Battle records.

### Shadowverse CCG

Planned source: Shadowverse Portal or an audited derivative source.

The provider stays disabled until the current endpoint/schema and image strategy are verified.

### Champion's Battle

Planned source: dedicated normalized dataset.

The game shares a large amount of card content with early Shadowverse CCG but must still have its own dataset/ruleset because card availability, exclusive cards and potentially game-specific behavior differ.

## Interactive engine direction

The interactive engine should keep one persistent `GameSession` rather than simulate a whole match in one call.

```text
GameSession
├─ public state
├─ hidden zones
├─ active player
├─ legal action generator
├─ action resolver
├─ event/replay log
└─ RNG state
```

Human flow:

```text
render state
→ request legal actions
→ human chooses one action
→ resolve exactly one action
→ render resulting state
```

AI flow:

```text
read AI-visible state
→ build candidate actions
→ limited search / evaluation
→ choose one action
→ resolve exactly one action
→ repeat until end turn
```

## AI skill target

ShadowBattle does **not** target perfect play by default.

Rules and legality remain exact, while decision quality is intentionally bounded through a skill model:

- finite search depth;
- finite branch budget;
- no access to hidden opponent information;
- probabilistic opponent-card memory;
- weighted choice between near-equivalent lines;
- complex lethal lines can be missed even when simple lethal should normally be found.

The AI should feel like a competent intermediate player, not a solver that produces a perfect sequence every turn.

## Deck knowledge

Opponent modeling should use the actual reference deck quantities when available.

For example:

```text
Card A ×3 → after two observed copies, at most one remains.
Card B ×1 → after one observed copy, zero remain.
```

No special hard-coded singleton mode is required: singleton/reference decks naturally work from their actual card counts.
