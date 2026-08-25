# ShadowBattle

**ShadowBattle** is an interactive Shadowverse training project focused on **Human vs AI** play.

The goal is not to replace the official games. ShadowBattle provides a local, deterministic board where a human can play full matches against an AI opponent, inspect decisions, test decks and train matchups.

## Planned game support

- **Shadowverse: Worlds Beyond**
- **Shadowverse CCG** (original PC / mobile game)
- **Shadowverse: Champion's Battle**

Each game is treated as a separate ruleset and data namespace.

## Core principles

- Human turns are played live, one action at a time.
- AI turns are also resolved action by action instead of simulating the whole match instantly.
- The AI should feel competent but human: intermediate-level search, no hidden-information cheating and no requirement to find the mathematically perfect line every turn.
- Rules must remain exact even when AI decision quality is intentionally limited.
- Card IDs, keywords, mechanics and data from different Shadowverse games must never share one unqualified namespace.

## Data architecture

```text
Shadowverse: Worlds Beyond
        ↓
   Beyond Codex
        ↓
Worlds Beyond provider

Shadowverse CCG
        ↓
Shadowverse Portal / normalized source
        ↓
Classic provider

Champion's Battle
        ↓
Dedicated normalized dataset
        ↓
Champion's Battle provider

             ↓
       ShadowBattle
      normalized model
```

**Beyond Codex remains Worlds Beyond-only.** ShadowBattle consumes it as an external provider rather than expanding Beyond Codex to unrelated Shadowverse games.

## Initial architecture

```text
src/
├─ core/
│  └─ game-catalog.js
├─ data/
│  ├─ provider-registry.js
│  └─ providers/
│     ├─ worlds-beyond.js
│     ├─ shadowverse-ccg.js
│     └─ champions-battle.js
└─ main.js
```

Later layers will add:

```text
src/
├─ engine/       # game session + legal actions + ruleset adapters
├─ ai/           # memory, opponent model, search, evaluator, skill model
├─ ui/           # interactive board
└─ games/        # game-specific rules and mechanics
```

## Status

Early architecture bootstrap. No playable battle board yet.
