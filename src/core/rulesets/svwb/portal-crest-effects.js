import { BATTLE_EVENT } from "../../battle-events.js";
import { crestView } from "./crests.js";
import { normalizeLookupValue } from "./lookup-normalization.js";

export function resolveWorldsBeyondPortalCrestTurnEnd(session, playerIndex, crest) {
  if (!crest || session.phase !== "main" || normalizeLookupValue(crest.name) !== "eudie, maiden reborn") return false;
  const player = session.getPlayer(playerIndex);

  if (player.hand.length <= 5) {
    const before = player.hand.length;
    session.draw(playerIndex, 1, { reason: "crest" });
    const drawn = player.hand.length > before;
    session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
      actor: playerIndex,
      payload: { action: "turn-end", crest: crestView(crest), drewCard: drawn }
    });
    return true;
  }

  const before = Number(player.hp ?? 0);
  player.hp = Math.min(Number(player.maxHp ?? before), before + 1);
  const healed = player.hp - before;
  session.emit(BATTLE_EVENT.HEAL, {
    actor: playerIndex,
    payload: { targetPlayer: playerIndex, amount: healed, hp: player.hp, source: null, reason: "eudie-crest", crest: crestView(crest) }
  });
  if (session.phase === "main") {
    session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
      actor: playerIndex,
      payload: { action: "turn-end", crest: crestView(crest), leaderHealing: healed }
    });
  }
  return true;
}
