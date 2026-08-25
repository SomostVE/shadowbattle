# Visual assets and game atmosphere

ShadowBattle must keep the visual identity of each supported game isolated in the same way as card data and rules.

## Shadowverse CCG

Preferred source: the official Cygames Shadowverse Fan Kit.

Official source:
- https://shadowverse.com/special/fankit/

The currently published fan kit includes, among other material:
- Shadowverse and card-set logos;
- a character asset archive;
- rank icons;
- a large background archive.

ShadowBattle should prefer these public fan-kit files over extracting proprietary resources from an installed game client. Fan-kit files must stay in an explicit `shadowverse-ccg` asset namespace and be used according to the Fan Kit Agreement.

Planned local layout:

```text
assets/
  shadowverse-ccg/
    official/
      logos/
      backgrounds/
      characters/
      rank-icons/
    effects/
  champions-battle/
    official/
    effects/
  worlds-beyond/
    official/
    effects/
```

The `effects/` directories are for ShadowBattle-created web effects (glow, particles, board feedback, target highlights, evolution presentation). They should reproduce the feel and pacing of the relevant game without pretending to be extracted original effect files.

## Shadowverse: Champion's Battle

Official public material should be sourced independently from the original CCG. The Switch game has overlapping cards but a distinct presentation and exclusive content, so its visual profile must never silently fall back to CCG assets for game-exclusive material.

Primary research source:
- https://shadowversecb.com/

## Shadowverse: Worlds Beyond

Card imagery and card data continue to come through Beyond Codex where available. ShadowBattle may add its own battle-board presentation layer, but the Worlds Beyond asset namespace stays separate from both legacy games.

Primary sources:
- https://somostve.github.io/beyond_codex/api/v1/
- https://shadowverse-wb.com/

## Runtime rule

Every session selects one `gameId`. That selection controls:

1. card-data provider;
2. rules package;
3. AI game model;
4. visual theme;
5. official asset namespace;
6. audio/effect namespace when those are added.

No runtime code should infer a visual asset from a raw numeric card ID without the game namespace.
