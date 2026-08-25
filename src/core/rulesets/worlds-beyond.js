import { GAME_IDS } from "../game-catalog.js";

export const WORLDS_BEYOND_RULESET = Object.freeze({
  id: "svwb-v5",
  gameId: GAME_IDS.WORLDS_BEYOND,
  sourceEngine: "Beyond Decks Battle Engine V5",
  sourceRuntime: "js/battle-engine-v5-runtime.js",
  battleRulesVersion: 5,
  leaderHealth: 20,
  openingHandSize: 4,
  maxHandSize: 9,
  maxBoardSize: 5,
  maxPp: 10,
  startingEvolutionPoints: Object.freeze({ first: 2, second: 2 }),
  startingSuperEvolutionPoints: Object.freeze({ first: 2, second: 2 }),
  evolutionUnlockTurn: Object.freeze({ first: 5, second: 4 }),
  superEvolutionUnlockTurn: Object.freeze({ first: 7, second: 6 }),
  createPlayerResources({ goingFirst }) {
    return {
      pp: 0,
      maxPp: 0,
      evolutionPoints: 2,
      superEvolutionPoints: 2,
      evolutionAvailable: false,
      superEvolutionAvailable: false,
      bonusPpAvailable: !goingFirst,
      bonusPpUses: 0,
      shadows: 0,
      rally: 0,
      earthSigils: 0,
      crests: []
    };
  },
  beginTurn(player) {
    player.resources.maxPp = Math.min(this.maxPp, player.resources.maxPp + 1);
    player.resources.pp = player.resources.maxPp;
    player.resources.evolutionAvailable = player.personalTurn >= (player.goingFirst ? this.evolutionUnlockTurn.first : this.evolutionUnlockTurn.second);
    player.resources.superEvolutionAvailable = player.personalTurn >= (player.goingFirst ? this.superEvolutionUnlockTurn.first : this.superEvolutionUnlockTurn.second);
    if (!player.goingFirst && player.personalTurn === 6 && player.resources.bonusPpUses < 2) {
      player.resources.bonusPpAvailable = true;
    }
  }
});
