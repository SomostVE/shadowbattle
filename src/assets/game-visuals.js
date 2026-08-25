export const CYGAMES_FAN_KIT_NOTICE = "This web site/application is not affiliated with, endorsed, sponsored, or specifically approved by Cygames. Cygames is not responsible for the operation or content of this site/application. Use of the trademarks and other intellectual property of Cygames is subject to Cygames’s Fan Kit Agreement. For more information about Cygames, please visit their website at www.cygames.co.jp.";

export const GAME_VISUALS = Object.freeze({
  "worlds-beyond": Object.freeze({
    gameId: "worlds-beyond",
    theme: "worlds-beyond",
    assetPolicy: "provider-owned",
    cardArtProvider: "Beyond Codex",
    fanKitRoot: "../../assets/fankits/worlds-beyond/",
    fanKitManifest: "../../assets/fankits/worlds-beyond/manifest.json",
    officialSources: [
      "https://somostve.github.io/beyond_codex/api/v1/",
      "https://shadowverse-wb.com/ja/special/fankit/"
    ],
    notes: "Use Beyond Codex for card images/data. The Worlds Beyond Fan Kit source is registered separately because its current download controls are dynamic."
  }),
  "shadowverse-ccg": Object.freeze({
    gameId: "shadowverse-ccg",
    theme: "shadowverse-classic",
    assetPolicy: "archived-cygames-fan-kit",
    cardDataProvider: "ShadowBattle local sv1 archive",
    cardArtIndex: "../../api/v1/shadowverse-ccg/image-index.json",
    fanKitRoot: "../../assets/fankits/shadowverse-ccg/",
    fanKitManifest: "../../assets/fankits/shadowverse-ccg/manifest.json",
    backgroundsRoot: "../../assets/fankits/shadowverse-ccg/extracted/Backgrounds/",
    charactersRoot: "../../assets/fankits/shadowverse-ccg/extracted/Characters-1/",
    rankIconsRoot: "../../assets/fankits/shadowverse-ccg/extracted/RankIcons-1/",
    downloadedAssetsRoot: "../../assets/fankits/shadowverse-ccg/downloads/",
    officialSources: [
      "https://shadowverse.com/special/fankit/",
      "https://shadowverse-portal.com/cards"
    ],
    notes: "36 official Fan Kit downloads are archived locally. Characters, rank icons and backgrounds are extracted for direct UI use. Card metadata is local; card-art URLs are preserved separately as an archive index."
  }),
  "champions-battle": Object.freeze({
    gameId: "champions-battle",
    theme: "champions-battle",
    assetPolicy: "official-public-material-only",
    fanKitRoot: "../../assets/fankits/champions-battle/",
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
