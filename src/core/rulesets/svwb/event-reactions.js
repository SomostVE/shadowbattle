import { BATTLE_EVENT } from "../../battle-events.js";
import { crestView, getWorldsBeyondCrests } from "./crests.js";

const PATCH_KEY = Symbol.for("shadowbattle.svwb.event-reactions");

export function installWorldsBeyondEventReactions(session) {
  if (!session || session[PATCH_KEY]) return session;
  const emit = session.emit.bind(session);
  Object.defineProperty(session, PATCH_KEY, { value: true, configurable: false });

  session.emit = function emitWithWorldsBeyondReactions(type, options = {}) {
    const event = emit(type, options);
    if (type === BATTLE_EVENT.HEAL) resolveHealCrestReactions(session, event);
    return event;
  };
  return session;
}

function resolveHealCrestReactions(session, event) {
  const playerIndex = Number(event.payload?.targetPlayer);
  if ((playerIndex !== 0 && playerIndex !== 1) || session.phase !== "main" || session.activePlayer !== playerIndex) return;
  const player = session.getPlayer(playerIndex);
  const turn = Number(player.personalTurn) || 0;
  const healed = Math.max(0, Number(event.payload?.amount) || 0);
  const crests = getWorldsBeyondCrests(player);

  // V5 Burnite Flame reacts to the first healing action of the turn even when
  // that action restores 0 defense. Ash requires defense to actually be restored.
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
