import { BATTLE_EVENT } from "../battle-events.js";
import { GAME_IDS } from "../game-catalog.js";
import { applyWorldsBeyondAction, listWorldsBeyondActions, prepareWorldsBeyondTurn } from "./svwb/action-resolver.js";
import {
  evolveWorldsBeyondFollowerByAbility,
  superEvolveWorldsBeyondFollowerByAbility
} from "./svwb/ability-evolution.js";
import { applyWorldsBeyondCombatAction, listWorldsBeyondCombatActions } from "./svwb/combat-actions.js";
import {
  modifyWorldsBeyondFollowerDamage,
  normalizeWorldsBeyondCombatEvent,
  normalizeWorldsBeyondTurnCombatReadiness
} from "./svwb/combat-readiness.js";
import { resolveWorldsBeyondEventReaction } from "./svwb/event-reactions.js";
import { destroyWorldsBeyondFollower, gainWorldsBeyondShadows } from "./svwb/effect-resolver.js";
import { applyWorldsBeyondEvolutionAction, listWorldsBeyondEvolutionActions } from "./svwb/evolution-actions.js";
import {
  resolveWorldsBeyondSplitAllEnemiesDamage,
  resolveWorldsBeyondSplitEnemyFollowerDamage
} from "./svwb/generic-effects.js";
import { runWorldsBeyondTurnEnd, runWorldsBeyondTurnStart } from "./svwb/lifecycle.js";
import { accountWorldsBeyondFollowerEntryHistory } from "./svwb/match-history.js";
import { gainWorldsBeyondRally } from "./svwb/rally.js";
import { spellboostWorldsBeyondHand } from "./svwb/spellboost.js";
import { resolveWorldsBeyondEffectCommand } from "./svwb/v6/effect-commands.js";
import { SHADOWBATTLE_V6_ENGINE_PROFILE } from "./svwb/v6/engine-profile.js";
import {
  isWorldsBeyondReanimateCommand,
  resolveWorldsBeyondReanimateCommand
} from "./svwb/v6/reanimate-command.js";

const EVOLUTION_ACTIONS = new Set(["evolve", "super-evolve"]);

export const WORLDS_BEYOND_RULESET = Object.freeze({
  id: "svwb-v6-alpha",
  gameId: GAME_IDS.WORLDS_BEYOND,
  engineVersion: 6,
  engineStage: "alpha",
  engineProfile: SHADOWBATTLE_V6_ENGINE_PROFILE,
  sourceEngine: SHADOWBATTLE_V6_ENGINE_PROFILE.name,
  sourceRuntime: "src/core/game-session.js",
  battleRulesVersion: 6,
  compatibilityBattleRulesVersion: SHADOWBATTLE_V6_ENGINE_PROFILE.compatibility.inheritedBattleRulesVersion,
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
      crests: [],
      artifactFollowerNamesEntered: []
    };
  },
  beginTurn(player) {
    player.attackedLeaderLastTurn = Boolean(player.attackedLeaderThisTurn);
    player.attackedLeaderThisTurn = false;
    player.resources.maxPp = Math.min(this.maxPp, player.resources.maxPp + 1);
    player.resources.pp = player.resources.maxPp;
    player.resources.evolutionAvailable = player.personalTurn >= (player.goingFirst ? this.evolutionUnlockTurn.first : this.evolutionUnlockTurn.second);
    player.resources.superEvolutionAvailable = player.personalTurn >= (player.goingFirst ? this.superEvolutionUnlockTurn.first : this.superEvolutionUnlockTurn.second);
    if (!player.goingFirst && player.personalTurn === 6 && player.resources.bonusPpUses < 2) player.resources.bonusPpAvailable = true;
    prepareWorldsBeyondTurn(player);
    normalizeWorldsBeyondTurnCombatReadiness(player);
  },
  modifyFollowerDamage(session, { unit, amount }) {
    return modifyWorldsBeyondFollowerDamage(unit, amount);
  },
  evolveFollowerByAbility(session, playerIndex, source) {
    return evolveWorldsBeyondFollowerByAbility(session, playerIndex, source);
  },
  superEvolveFollowerByAbility(session, playerIndex, source) {
    return superEvolveWorldsBeyondFollowerByAbility(session, playerIndex, source);
  },
  resolveSplitEnemyFollowerDamage(session, { playerIndex, source, amount }) {
    return resolveWorldsBeyondSplitEnemyFollowerDamage(session, {
      playerIndex,
      source,
      amount,
      destroyFollower: destroyWorldsBeyondFollower
    });
  },
  resolveSplitAllEnemiesDamage(session, { playerIndex, source, amount, reason = "ability" }) {
    return resolveWorldsBeyondSplitAllEnemiesDamage(session, {
      playerIndex,
      source,
      amount,
      reason,
      destroyFollower: destroyWorldsBeyondFollower
    });
  },
  afterEvent(session, event) {
    accountCemeteryOverflowShadow(session, event);
    if (event.type === BATTLE_EVENT.FOLLOWER_ENTER) {
      if (!event.payload?.deferRally) accountFollowerEnterRally(session, event);
      accountWorldsBeyondFollowerEntryHistory(session, event);
      normalizeWorldsBeyondCombatEvent(session, event);
    }
    if (event.type === BATTLE_EVENT.SPELL_CAST) {
      spellboostWorldsBeyondHand(session, event.actor, 1, {
        source: event.payload?.card ?? null,
        reason: "spell-cast"
      });
    }
    resolveWorldsBeyondEventReaction(session, event);
  },
  afterTurnStart(player, session) {
    runWorldsBeyondTurnStart(session, player.index);
  },
  beforeTurnEnd(player, session) {
    runWorldsBeyondTurnEnd(session, player.index);
  },
  resolveEffectCommand(session, command) {
    if (isWorldsBeyondReanimateCommand(command)) return resolveWorldsBeyondReanimateCommand(session, command);
    return resolveWorldsBeyondEffectCommand(session, command);
  },
  applyAction(session, action) {
    if (action?.type === "attack") return applyWorldsBeyondCombatAction(session, action);
    if (EVOLUTION_ACTIONS.has(action?.type)) return applyWorldsBeyondEvolutionAction(session, action);
    return applyWorldsBeyondAction(session, action);
  },
  listLegalActions(session, playerIndex) {
    const utility = listWorldsBeyondActions(session, playerIndex).filter(action => !EVOLUTION_ACTIONS.has(action.type));
    return [
      ...utility,
      ...listWorldsBeyondEvolutionActions(session, playerIndex),
      ...listWorldsBeyondCombatActions(session, playerIndex)
    ];
  }
});

function accountFollowerEnterRally(session, event) {
  const owner = event.actor;
  if (owner !== 0 && owner !== 1) return;
  gainWorldsBeyondRally(session.getPlayer(owner), 1);
}

function accountCemeteryOverflowShadow(session, event) {
  let owner = null;
  if (event.type === BATTLE_EVENT.CARD_BURNED) owner = event.actor;
  if (event.type === BATTLE_EVENT.CARD_RETURNED && event.payload?.destination === "cemetery") owner = event.payload?.owner;
  if (owner !== 0 && owner !== 1) return;
  gainWorldsBeyondShadows(session, owner, 1);
}
