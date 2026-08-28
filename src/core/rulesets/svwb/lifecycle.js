import { banishBoardCard } from "../../zone-actions.js";
import { advanceWorldsBeyondAmuletCountdown } from "./amulets.js";
import {
  resolveWorldsBeyondCrestLastWords,
  resolveWorldsBeyondCrestTurnEnd,
  resolveWorldsBeyondCrestTurnStart
} from "./crest-effects.js";
import { getWorldsBeyondCrests, runWorldsBeyondCrestTurnStart } from "./crests.js";
import { destroyWorldsBeyondFollower, resolveWorldsBeyondTrigger } from "./effect-resolver.js";
import {
  resolveWorldsBeyondForestCrestTurnEnd,
  resolveWorldsBeyondForestCrestTurnStart
} from "./forest-crest-effects.js";
import { resolveWorldsBeyondPortalCrestTurnEnd } from "./portal-crest-effects.js";
import { resolveWorldsBeyondSwordCrestTurnEnd } from "./sword-crest-effects.js";

export function runWorldsBeyondTurnStart(session, playerIndex) {
  const player = session.getPlayer(playerIndex);

  // V5 resolves Crest start-of-turn effects before Crest Countdown, then
  // resolves Last Words for the Crests that expire on that tick.
  runWorldsBeyondCrestTurnStart(session, playerIndex, {
    beforeTick: crest => {
      resolveWorldsBeyondCrestTurnStart(session, playerIndex, crest);
      if (session.phase === "main") resolveWorldsBeyondForestCrestTurnStart(session, playerIndex, crest);
    },
    onExpire: crest => resolveWorldsBeyondCrestLastWords(session, playerIndex, crest)
  });
  if (session.phase !== "main") return;

  tickCountdownAmulets(session, playerIndex);
  if (session.phase !== "main") return;

  for (const source of [...player.board]) {
    if (!session.findBoardCard(playerIndex, source.instanceId)) continue;
    resolveWorldsBeyondTrigger(session, { trigger: "turn-start", playerIndex, source });
    if (session.phase !== "main") break;
  }
}

export function runWorldsBeyondTurnEnd(session, playerIndex) {
  const player = session.getPlayer(playerIndex);
  for (const source of [...player.board]) {
    if (!session.findBoardCard(playerIndex, source.instanceId)) continue;
    resolveWorldsBeyondTrigger(session, { trigger: "turn-end", playerIndex, source });
    if (session.phase !== "main") return;
  }

  // Battle Engine V5 resolves simultaneous Crest turn-end effects after board
  // follower/amulet turn-end effects and in Crest acquisition order.
  for (const crest of [...getWorldsBeyondCrests(player)]) {
    if (!getWorldsBeyondCrests(player).includes(crest)) continue;
    resolveWorldsBeyondForestCrestTurnEnd(session, playerIndex, crest);
    if (session.phase !== "main") return;
    resolveWorldsBeyondSwordCrestTurnEnd(session, playerIndex, crest);
    if (session.phase !== "main") return;
    resolveWorldsBeyondPortalCrestTurnEnd(session, playerIndex, crest);
    if (session.phase !== "main") return;
    resolveWorldsBeyondCrestTurnEnd(session, playerIndex, crest);
    if (session.phase !== "main") return;
  }

  // Himeka's delayed banish resolves after the marked follower's own turn-end
  // abilities and Crests, matching the V5 marked-end-turn cleanup ordering.
  banishHimekaMarkedFollowers(session, playerIndex);
  if (session.phase !== "main") return;

  // Granted "At the end of your opponent's turn" destruction belongs to the
  // inactive player's followers, so it resolves after the active player's own
  // turn-end work has completed.
  destroyOpponentTurnEndFollowers(session, playerIndex);
}

function banishHimekaMarkedFollowers(session, playerIndex) {
  const player = session.getPlayer(playerIndex);
  for (const unit of [...player.board]) {
    if (!unit.himekaBanishAtOwnTurnEnd) continue;
    const actor = unit.himekaBanishActor === 0 || unit.himekaBanishActor === 1 ? unit.himekaBanishActor : null;
    banishBoardCard(session, playerIndex, unit.instanceId, { actor, reason: "himeka-crest" });
  }
}

function destroyOpponentTurnEndFollowers(session, activePlayerIndex) {
  const ownerIndex = 1 - activePlayerIndex;
  const owner = session.getPlayer(ownerIndex);
  for (const unit of [...owner.board]) {
    if (!unit.destroyAtOpponentTurnEnd) continue;
    destroyWorldsBeyondFollower(session, ownerIndex, unit.instanceId, {
      actor: ownerIndex,
      source: unit,
      reason: "granted-opponent-turn-end",
      byAbility: true
    });
    if (session.phase !== "main") break;
  }
}

function tickCountdownAmulets(session, playerIndex) {
  const player = session.getPlayer(playerIndex);
  for (const amulet of [...player.board]) {
    if (cardType(amulet) !== "amulet" || amulet.countdown == null || !Number.isFinite(Number(amulet.countdown))) continue;
    advanceWorldsBeyondAmuletCountdown(session, playerIndex, amulet.instanceId, 1, {
      actor: playerIndex,
      reason: "turn-start"
    });
    if (session.phase !== "main") break;
  }
}

function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}
