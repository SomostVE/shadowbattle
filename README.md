# ShadowBattle

**ShadowBattle** is an interactive Shadowverse training project focused on **Human vs AI** play.

The goal is not to replace the official games. ShadowBattle provides a deterministic battle board where a human can play full matches against an AI opponent, inspect decisions, test decks and train matchups.

## Project surfaces

- `/` — project landing page.
- `/api/` — ShadowBattle's own namespaced API surface.
- `/test/` — AI logic laboratory for deterministic scenarios and behavior tests.

## Planned game support

- **Shadowverse: Worlds Beyond**
- **Shadowverse CCG** (original PC / mobile game)
- **Shadowverse: Champion's Battle**

Each game is treated as a separate ruleset, data namespace and visual profile.

## Core principles

- Human turns are played live, one action at a time.
- AI turns are also resolved action by action instead of simulating the whole match instantly.
- The AI should feel competent but human: intermediate-level search, no hidden-information cheating and no requirement to find the mathematically perfect line every turn.
- Rules must remain exact even when AI decision quality is intentionally limited.
- Card IDs, keywords, mechanics and data from different Shadowverse games must never share one unqualified namespace.

## API architecture

```text
/api/v1/
├─ manifest.json
├─ games.json
├─ worlds-beyond/
│  └─ manifest.json       # namespace svwb
├─ shadowverse-ccg/
│  └─ manifest.json       # namespace sv1
└─ champions-battle/
   └─ manifest.json       # namespace svcb
```

Future materialized card endpoints will live inside those same game folders.

A normalized card UID is always qualified with the game namespace, such as `svwb:...`, `sv1:...` or `svcb:...`.

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
       ShadowBattle API
```

**Beyond Codex remains Worlds Beyond-only.** ShadowBattle consumes it as a validated upstream provider rather than expanding Beyond Codex to unrelated Shadowverse games.

## AI direction

The first locked skill profile is `Intermediate`.

It deliberately limits search depth and breadth, then selects among near-best legal lines rather than always forcing the numerically highest-scoring move. Clearly bad or illegal moves are still excluded. This keeps mistakes plausible without implementing artificial random stupidity.

The `/test/` page is the development surface for this behavior before it is connected to a real `GameSession`.

## Visual direction

ShadowBattle has game-specific visual themes and an asset registry. For the original Shadowverse CCG, the preferred source is the **official Cygames Shadowverse Fan Kit**, which still publishes logos, character material, rank icons and background packs.

See `docs/visual-assets.md` for the asset policy and planned directory structure.

## Current architecture

```text
src/
├─ ai/
│  └─ skill-profile.js
├─ assets/
│  └─ game-visuals.js
├─ core/
│  └─ game-catalog.js
├─ data/
│  ├─ provider-registry.js
│  └─ providers/
│     ├─ worlds-beyond.js
│     ├─ shadowverse-ccg.js
│     └─ champions-battle.js
├─ test/
│  └─ test-page.js
└─ ui/
   └─ shadowbattle.css
```

Later layers will add:

```text
src/
├─ engine/       # GameSession + legal actions + ruleset adapters
├─ ai/           # memory, opponent model, search, evaluator
├─ ui/           # production interactive board
└─ games/        # game-specific rules and mechanics
```

## Status

Architecture + API/Test surfaces bootstrapped. The board visible in `/test/` is currently a development mock; there is no full playable `GameSession` yet.
