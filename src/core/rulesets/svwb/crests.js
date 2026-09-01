import { BATTLE_EVENT } from "../../battle-events.js";

export const WORLDS_BEYOND_CREST_LIMIT = 5;

const CREST_COUNTDOWNS = Object.freeze({
  "sandalphon, primarch successor": 2,
  "lu woh, light personified": 2,
  "krulle, heir to unkilling": 2,
  "gildaria, anathema of attunement": 1,
  "supplicant of repose": 4,
  "lapis, shining seraph": 2,
  "devotee of repose": 4,
  "maddening benison": 2,
  "congregant of repose": 4,
  "zoe, dazzling hope": 1,
  "himeka, heir to repose": 4,
  "majestic conquest": 2,
  "kagemitsu, enduring warrior": 2,
  "octrice, hollowness manifest": 8,
  "unkei, goldbloom": 4,
  "magnified malice": 1,
  "minimized anxiety": 1,
  "starry sky": 1,
  "thestae, anathema of distortion": 3,
  "yuel & societte, dancing duo": 4,
  "great hart of the glacial realm": 3,
  "crescent tube ride": 4,
  "drache & aluzard, burning blood": 2,
  "dragon's vale elder": 2,
  "rigor of the nightblossom": 2,
  "valiant edge": 2,
  "balto, dusk bounty hunter": 4,
  "charon, stygian oarswoman": 2,
  "corruption": 4,
  "illamrita, designated target": 2,
  "eudie, maiden reborn": 3,
  "slaus, revolving wheel of fortune": 3,
  "belial, archangel of cunning": 4,
  "pascale's dance": 1,
  "insomniac witch": 2,
  "crystal gazing": 2,
  "juno, visionary alchemist": 3,
  "lilanthim, anathema of predation": 1
});

export function getWorldsBeyondCrests(player) {
  player.resources ??= {};
  player.resources.crests ??= [];
  return player.resources.crests;
}

export function hasWorldsBeyondCrest(player, name) {
  const wanted = normalize(name);
  return getWorldsBeyondCrests(player).some(crest => normalize(crest.name) === wanted);
}

export function getWorldsBeyondCrestCountdown(name) {
  return CREST_COUNTDOWNS[normalize(name)] ?? null;
}

export function gainWorldsBeyondCrest(session, playerIndex, name, card = null) {
  const player = session.getPlayer(playerIndex);
  const crests = getWorldsBeyondCrests(player);
  const crestName = String(name ?? "").trim();
  if (!crestName) return { gained: false, reason: "invalid-name", crest: null };
  if (hasWorldsBeyondCrest(player, crestName)) return { gained: false, reason: "duplicate", crest: null };
  if (crests.length >= WORLDS_BEYOND_CREST_LIMIT) return { gained: false, reason: "full", crest: null };

  const crest = {
    id: `crest:${playerIndex}:${session.eventSequence}`,
    name: crestName,
    cardId: card?.id ?? card?.cardId ?? null,
    card: card ?? null,
    countdown: getWorldsBeyondCrestCountdown(crestName),
    gainedTurn: Number(player.personalTurn) || 0,
    acquiredOrder: session.eventSequence,
    damageTriggerTurn: -1,
    healTriggerTurn: -1
  };
  crests.push(crest);
  session.emit(BATTLE_EVENT.CREST_GAINED, {
    actor: playerIndex,
    payload: { crest: crestView(crest), activeCount: crests.length }
  });
  return { gained: true, reason: null, crest };
}

export function runWorldsBeyondCrestTurnStart(session, playerIndex, { beforeTick = null, onExpire = null } = {}) {
  const player = session.getPlayer(playerIndex);
  const crests = getWorldsBeyondCrests(player);

  // V5 resolves simultaneous Crest start-of-turn effects in acquisition order,
  // before any Countdown is decremented. This also lets an expiring Crest fire
  // its final start-of-turn effect before it leaves play.
  for (const crest of [...crests]) {
    if (!crests.includes(crest)) continue;
    if (typeof beforeTick === "function") beforeTick(crest);
    if (session.phase === "ended") return;
  }

  const expired = [];
  for (const crest of [...crests]) {
    if (!hasFiniteCountdown(crest)) continue;
    if ((Number(crest.gainedTurn) || 0) >= Number(player.personalTurn || 0)) continue;
    crest.countdown = Math.max(0, Number(crest.countdown) - 1);
    session.emit(BATTLE_EVENT.CREST_TICK, {
      actor: playerIndex,
      payload: { crest: crestView(crest), countdown: crest.countdown }
    });
    if (crest.countdown <= 0) expired.push(crest);
  }

  for (const crest of expired) {
    if (!expireCrest(session, playerIndex, crest, { onExpire })) continue;
    if (session.phase === "ended") return;
  }
}

export function delayWorldsBeyondCrest(session, playerIndex, name, amount = 1) {
  const crest = findCrest(session.getPlayer(playerIndex), name);
  const value = Math.max(0, Number(amount) || 0);
  if (!crest || !value || !hasFiniteCountdown(crest)) return false;
  crest.countdown = Number(crest.countdown) + value;
  session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
    actor: playerIndex,
    payload: { action: "delay", crest: crestView(crest), amount: value, countdown: crest.countdown }
  });
  return true;
}

export function advanceWorldsBeyondCrest(session, playerIndex, name, amount = 1, {
  onExpire = null,
  reason = "ability"
} = {}) {
  const player = session.getPlayer(playerIndex);
  const crest = findCrest(player, name);
  const value = Math.max(0, Number(amount) || 0);
  if (!crest || !value || !hasFiniteCountdown(crest)) return false;
  crest.countdown = Math.max(0, Number(crest.countdown) - value);
  session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
    actor: playerIndex,
    payload: { action: "advance", crest: crestView(crest), amount: value, countdown: crest.countdown }
  });
  if (crest.countdown <= 0) expireCrest(session, playerIndex, crest, { onExpire, reason });
  return true;
}

export function destroyWorldsBeyondCrest(session, playerIndex, name, { reason = "ability" } = {}) {
  const crest = findCrest(session.getPlayer(playerIndex), name);
  return crest ? expireCrest(session, playerIndex, crest, { reason }) : null;
}

export function crestView(crest) {
  return {
    id: crest?.id ?? null,
    name: crest?.name ?? null,
    cardId: crest?.cardId ?? null,
    countdown: hasFiniteCountdown(crest) ? Number(crest.countdown) : null,
    gainedTurn: Number(crest?.gainedTurn ?? 0)
  };
}

function expireCrest(session, playerIndex, crest, { onExpire = null, reason = null } = {}) {
  const crests = getWorldsBeyondCrests(session.getPlayer(playerIndex));
  const index = crests.indexOf(crest);
  if (index < 0) return null;

  crests.splice(index, 1);
  const payload = { crest: crestView(crest), activeCount: crests.length };
  if (reason != null) payload.reason = reason;
  session.emit(BATTLE_EVENT.CREST_EXPIRED, { actor: playerIndex, payload });
  if (typeof onExpire === "function") onExpire(crest);
  return crest;
}

function hasFiniteCountdown(crest) {
  return crest?.countdown != null && Number.isFinite(Number(crest.countdown));
}

function findCrest(player, name) {
  const wanted = normalize(name);
  return getWorldsBeyondCrests(player).find(crest => normalize(crest.name) === wanted) ?? null;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
