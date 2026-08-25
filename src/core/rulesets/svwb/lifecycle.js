import { BATTLE_EVENT } from "../../battle-events.js";
import { resolveWorldsBeyondTrigger } from "./effect-resolver.js";

export function runWorldsBeyondTurnStart(session, playerIndex) {
  const player = session.getPlayer(playerIndex);
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
    if (session.phase !== "main") break;
  }
}

function tickCountdownAmulets(session, playerIndex) {
  const player = session.getPlayer(playerIndex);
  for (const amulet of [...player.board]) {
    if (cardType(amulet) !== "amulet" || !Number.isFinite(Number(amulet.countdown))) continue;
    amulet.countdown = Math.max(0, Number(amulet.countdown) - 1);
    session.emit(BATTLE_EVENT.COUNTDOWN_TICK, {
      actor: playerIndex,
      payload: { card: session.cardView(amulet), countdown: amulet.countdown }
    });
    if (amulet.countdown > 0) continue;
    destroyCountdownAmulet(session, playerIndex, amulet);
    if (session.phase !== "main") break;
  }
}

function destroyCountdownAmulet(session, playerIndex, amulet) {
  const player = session.getPlayer(playerIndex);
  const index = player.board.findIndex(item => item.instanceId === amulet.instanceId);
  if (index < 0) return null;
  player.board.splice(index, 1);
  player.cemetery.push(amulet);
  session.emit(BATTLE_EVENT.AMULET_DESTROYED, {
    actor: playerIndex,
    payload: { owner: playerIndex, card: session.cardView(amulet), reason: "countdown" }
  });
  resolveWorldsBeyondTrigger(session, { trigger: "last-words", playerIndex, source: amulet });
  return amulet;
}

function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}
