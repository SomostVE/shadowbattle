import { BATTLE_EVENT } from "../../battle-events.js";
import { crestView, getWorldsBeyondCrests } from "./crests.js";

export function resolveWorldsBeyondEventReaction(session, event) {
  if (!session || !event) return false;
  if (event.type === BATTLE_EVENT.TURN_START) {
    restorePersistentAttackLocks(session, event);
    return true;
  }
  if (event.type === BATTLE_EVENT.HEAL) {
    resolveHealCrestReactions(session, event);
    return true;
  }
  return false;
}

function restorePersistentAttackLocks(session, event) {
  const playerIndex = Number(event.actor);
  if ((playerIndex !== 0 && playerIndex !== 1) || session.phase !== "main") return;
  for (const unit of session.getPlayer(playerIndex).board ?? []) {
    if (!unit.permanentAttackLock) continue;
    unit.canAttackFollowers = false;
    unit.canAttackLeader = false;
  }
}

function resolveHealCrestReactions(session, event) {
  const playerIndex = Number(event.payload?.targetPlayer);
  if ((playerIndex !== 0 && playerIndex !== 1) || session.phase !== "main" || session.activePlayer !== playerIndex) return;
  const player = session.getPlayer(playerIndex);
  const turn = Number(player.personalTurn) || 0;
  const healed = Math.max(0, Number(event.payload?.amount) || 0);
  const crests = getWorldsBeyondCrests(player);

  // V5 behavior retained during the V6 migration: Flame reacts to the first
  // healing action even for 0 restored defense; Ash requires a real heal.
  if (!applyBurniteHealReaction(session, playerIndex, crests, "burnite, anathema of flame", turn, "healing-action")) return;
  if (session.phase !== "main" || healed <= 0) return;
  applyBurniteHealReaction(session, playerIndex, crests, "burnite, anathema of ash", turn, "healing-restored");
}

function applyBurniteHealReaction(session, playerIndex, crests, name, turn, trigger) {
  const crest = crests.find(item => normalize(item.name) === name) ?? null;
  if (!crest || Number(crest.healTriggerTurn) === turn) return true;
  crest.healTriggerTurn = turn;
  session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
    actor: playerIndex,
    payload: {
      action: "after-heal",
      trigger,
      crest: crestView(crest),
      selfDamage: 1
    }
  });
  session.damageLeader(playerIndex, 1, { actor: playerIndex, reason: "crest-heal-reaction" });
  return session.phase === "main";
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
