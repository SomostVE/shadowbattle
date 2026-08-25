export const CYGAMES_FAN_KIT_NOTICE = "This web site/application is not affiliated with, endorsed, sponsored, or specifically approved by Cygames. Cygames is not responsible for the operation or content of this site/application. Use of the trademarks and other intellectual property of Cygames is subject to Cygames’s Fan Kit Agreement. For more information about Cygames, please visit their website at www.cygames.co.jp.";

export const GAME_VISUALS = Object.freeze({
  "worlds-beyond": Object.freeze({
    gameId: "worlds-beyond",
    theme: "worlds-beyond",
    assetPolicy: "provider-owned",
    cardArtProvider: "Beyond Codex",
    officialSources: [
      "https://somostve.github.io/beyond_codex/api/v1/",
      "https://shadowverse-wb.com/"
    ],
    notes: "Use Beyond Codex for card images/data. Keep Worlds Beyond assets isolated from legacy Shadowverse assets."
  }),
  "shadowverse-ccg": Object.freeze({
    gameId: "shadowverse-ccg",
    theme: "shadowverse-classic",
    assetPolicy: "cygames-fan-kit",
    cardArtProvider: "Shadowverse Portal",
    officialSources: [
      "https://shadowverse.com/special/fankit/",
      "https://shadowverse-portal.com/cards"
    ],
    notes: "The official fan kit currently exposes Shadowverse logos, characters, rank icons and background packs. Fan-kit material must be displayed unmodified except for proportional resizing and with the required notice."
  }),
  "champions-battle": Object.freeze({
    gameId: "champions-battle",
    theme: "champions-battle",
    assetPolicy: "official-public-material-only",
    cardArtProvider: "planned",
    officialSources: [
      "https://shadowversecb.com/"
    ],
    notes: "Keep Champion's Battle-specific artwork and UI references in their own asset namespace. Do not silently substitute CCG assets for Switch-exclusive material."
  })
});

export function getGameVisuals(gameId) {
  const visuals = GAME_VISUALS[gameId];
  if (!visuals) throw new Error(`Unknown ShadowBattle visual profile: ${gameId}`);
  return visuals;
}
