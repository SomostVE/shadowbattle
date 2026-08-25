export const GAME_IDS = Object.freeze({
  WORLDS_BEYOND: "worlds-beyond",
  SHADOWVERSE_CCG: "shadowverse-ccg",
  CHAMPIONS_BATTLE: "champions-battle"
});

export const GAME_CATALOG = Object.freeze({
  [GAME_IDS.WORLDS_BEYOND]: Object.freeze({
    id: GAME_IDS.WORLDS_BEYOND,
    name: "Shadowverse: Worlds Beyond",
    shortName: "Worlds Beyond",
    dataNamespace: "svwb",
    status: "supported-data"
  }),
  [GAME_IDS.SHADOWVERSE_CCG]: Object.freeze({
    id: GAME_IDS.SHADOWVERSE_CCG,
    name: "Shadowverse",
    shortName: "Shadowverse CCG",
    dataNamespace: "sv1",
    status: "planned"
  }),
  [GAME_IDS.CHAMPIONS_BATTLE]: Object.freeze({
    id: GAME_IDS.CHAMPIONS_BATTLE,
    name: "Shadowverse: Champion's Battle",
    shortName: "Champion's Battle",
    dataNamespace: "svcb",
    status: "planned"
  })
});

export function getGame(gameId) {
  const game = GAME_CATALOG[gameId];
  if (!game) throw new Error(`Unknown ShadowBattle game: ${gameId}`);
  return game;
}
