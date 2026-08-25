# ShadowBattle

**ShadowBattle** is an interactive Shadowverse training project focused on **Human vs AI** play.

The goal is not to replace the official games. ShadowBattle provides a deterministic battle board where a human can play full matches against an AI opponent, inspect decisions, test decks and train matchups.

## Project surfaces

- `/` — project landing page.
- `/decks/` — local deckbuilder and deck library.
- `/api/` — ShadowBattle's namespaced API surface.
- `/test/` — AI logic laboratory for deterministic scenarios and behavior tests.

## Game support

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

## Deck library

ShadowBattle 0.4.5 provides a browser-local deck library under `/decks/` whose entire working surface follows the Beyond Decks layout rather than the former dashboard-style editor.

The deckbuilder uses the same card-first interaction model: a dense full-art grid, two-tier toolbar, compact craft/rarity/cost/type controls, a slide-out filter drawer, card-size controls, and a persistent deck panel on the right with Deck / Saved / Import tabs. Deck rows include card thumbnails, cost-curve counts and compact quantity controls.

The card grid now follows the same adaptive sizing model as Beyond Decks. `Fit` targets roughly 156 px cards, recalculates from the available content width, uses the same S/M/L presets (90/118/154), and keeps a 300 px deck panel. On first use ShadowBattle can inherit the existing Beyond Decks card-size preference from the same browser origin, then stores its own setting independently.

Class switching now follows the same state-first rendering pattern used by Beyond Decks instead of rebuilding the whole deckbuilder surface. ShadowBattle pre-indexes each class pool in memory, keeps the class buttons mounted, preserves scroll position per class, delegates grid interactions, paints the visible card batch immediately and appends the remaining cards during idle time. Adding or removing a card updates only that tile and the deck panel instead of rebuilding hundreds of card nodes.

The browser displays the real Shadowverse card art as the primary catalog view. Followers can switch between their normal `C_<id>.png` art and evolved `E_<id>.png` art from the grid or inspection dialog without changing the underlying deck entry. Card identity remains qualified by its game namespace.

The class selector uses the official Shadowverse Portal class-selection images instead of placeholder glyphs. Card-art loading is staged around the visible catalog viewport so hundreds of remote PNGs are not requested at once; same-origin app files and local catalog JSON are cached by a versioned service worker.

ShadowBattle publishes a root `version.json`. Every main page checks that version with cache bypassing, refreshes itself when a newer release is detected, and rotates the service-worker cache automatically, avoiding manual `Ctrl+F5` refreshes after GitHub Pages deployments.

### Original Shadowverse CCG

The deckbuilder reads a compact local catalog generated from the frozen Shadowverse Portal archive. Decks use the normal 40-card / 3-copy rules and are stored under the `shadowverse-ccg` / `sv1` namespace.

### Champion's Battle

The Switch deckbuilder is isolated under `champions-battle` / `svcb`.

Its current local base pool contains:

- Basic;
- Classic;
- Darkness Evolved;
- Rise of Bahamut;
- no Portalcraft.

Champion's Battle-exclusive cards are intentionally not inferred from CCG IDs. They will be added later as a dedicated `svcb`-only layer after the exclusive dataset is audited.

### Beyond Decks bridge

Worlds Beyond decks remain owned by Beyond Decks/Beyond Codex, but ShadowBattle can import them into its local deck library for future Human vs AI sessions.

Supported import paths:

1. **Direct browser workspace import** from Beyond Decks' existing `shadowverse-deck-assistant:v2` localStorage key when both apps are running on the same origin.
2. **JSON/file import** using the deck payload already produced by Beyond Decks' Export button.

ShadowBattle imports the current Beyond Decks deck and its saved variants without changing or deleting the Beyond Decks workspace.

## API architecture

```text
/api/v1/
├─ manifest.json
├─ games.json
├─ worlds-beyond/
│  └─ manifest.json                    # namespace svwb
├─ shadowverse-ccg/
│  ├─ manifest.json                    # namespace sv1
│  ├─ cards.json                       # frozen English snapshot
│  ├─ catalog.json                     # compact deckbuilding catalog
│  ├─ data-headers.json
│  ├─ image-index.json
│  └─ locales/
│     └─ cards.<lang>.json             # 8 official Portal languages
└─ champions-battle/
   ├─ manifest.json                    # namespace svcb
   ├─ cards.json                       # local Switch base pool
   └─ catalog.json                     # compact Switch deckbuilding catalog
```

A normalized card UID is always qualified with the game namespace, such as `svwb:...`, `sv1:...` or `svcb:...`.

### Original Shadowverse CCG archive

ShadowBattle contains a **complete frozen copy of the Shadowverse Portal card API** captured on 2026-08-25:

- **5,933 cards**;
- identical card-ID coverage across all archived locales;
- **8 officially supported languages**: English, Japanese, Korean, Traditional Chinese, French, Italian, German and Spanish;
- the original raw API response for every language under `archive/shadowverse-ccg/raw/`;
- a runtime-ready local API under `api/v1/shadowverse-ccg/`;
- SHA-256 hashes and population checks in the manifest.

The Shadowverse CCG provider reads this local snapshot. **Normal ShadowBattle runtime does not call `shadowverse-portal.com` for card data.** The original endpoint is retained only as provenance and for an explicit archival refresh while it remains online.

Card-art URL patterns are indexed separately. Mirroring every card image would be a multi-gigabyte asset archive and is intentionally not mixed into the code/data snapshot yet. The deckbuilder can currently resolve the remote normal/evolved art while the full local image mirror remains a separate archival task.

## Data architecture

```text
Shadowverse: Worlds Beyond
        ↓
   Beyond Codex
        ↓
Worlds Beyond provider
        ↓
Beyond Decks exports / local workspace
        ↓
ShadowBattle deck library

Shadowverse CCG
        ↓ archival capture only
Shadowverse Portal
        ↓
local frozen sv1 API
        ↓
local compact deck catalog

Champion's Battle
        ↓
local launch-era svcb base pool
        +
future audited exclusive layer

             ↓
       ShadowBattle API
```

**Beyond Codex remains Worlds Beyond-only.** ShadowBattle consumes it as a validated upstream provider rather than expanding Beyond Codex to unrelated Shadowverse games.

## AI direction

The first locked skill profile is `Intermediate`.

It deliberately limits search depth and breadth, then selects among near-best legal lines rather than always forcing the numerically highest-scoring move. Clearly bad or illegal moves are still excluded. This keeps mistakes plausible without implementing artificial random stupidity.

The `/test/` page is the development surface for this behavior before it is connected to a real `GameSession`.

## Visual archive

Official Fan Kit material is isolated by game under `assets/fankits/`.

The original Shadowverse CCG Fan Kit has been archived locally from Cygames: **36 official downloads**, including the `Characters`, `RankIcons` and `Backgrounds` ZIP packs. Those ZIPs are also extracted under `assets/fankits/shadowverse-ccg/extracted/` so the UI can use individual files directly.

Worlds Beyond has its own official Fan Kit namespace. Its current download controls are dynamically generated, so its source page is recorded separately until those direct asset URLs are resolved. Champion's Battle remains source-audited before any game files are copied into its namespace.

See `assets/fankits/README.md` and `docs/visual-assets.md` for asset provenance and usage rules.

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
├─ decks/
│  ├─ card-grid.js
│  ├─ catalog.js
│  ├─ deck-rules.js
│  ├─ deckbuilder-page.js
│  ├─ import-beyond-decks.js
│  └─ storage.js
├─ test/
│  └─ test-page.js
└─ ui/
   ├─ deckbuilder.css
   ├─ deck-enhancements.css
   ├─ deck-ui-enhancements.js
   ├─ version-guard.js
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

ShadowBattle 0.4.5 has a namespaced API, permanent original-CCG data archive, official CCG Fan Kit archive, OG/Switch deckbuilding, a Beyond Decks import bridge, a Beyond Decks-style full card-grid deckbuilder with adaptive sizing, seamless class switching, normal/evolved follower art, official Portal class selector imagery, automatic release refresh/versioned cache handling, staged card-art loading, and the AI test surface. The board visible in `/test/` is still a development mock; there is no full playable `GameSession` yet.