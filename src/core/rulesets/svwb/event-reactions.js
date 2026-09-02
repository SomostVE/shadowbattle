import { BATTLE_EVENT } from "../../battle-events.js";
import { grantWorldsBeyondKeyword } from "./combat-readiness.js";
import { crestView, getWorldsBeyondCrests } from "./crests.js";
import { resolveWorldsBeyondDiscardReaction } from "./discard-reactions.js";
import { cardType } from "./runtime-card-state.js";

const COMBAT_KEYWORDS = new Set(["storm", "rush", "ward", "bane", "drain"]);
const MARINE_ENTRY_WARD = /\bWhenever an allied Marine follower enters the field, give it Ward\.?/i;
const MARINE_ENTRY_SELF_KEYWORDS = /\bWhenever an allied Marine follower enters the field, give this follower\s+(Storm|Rush|Ward|Bane|Drain)(?:\s+and\s+(Storm|Rush|Ward|Bane|Drain))?\.?/i;

export function resolveWorldsBeyondEventReaction(session, event) {
  if (!session || !event) return false;
  if (event.type === BATTLE_EVENT.TURN_START) {
    restorePersistentAttackLocks(session, event);
    return true;
  }
  if (event.type === BATTLE_EVENT.CARD_DISCARDED) {
    return resolveWorldsBeyondDiscardReaction(session, event);
  }
  if (event.type === BATTLE_EVENT.FOLLOWER_ENTER) {
    return resolveAlliedFollowerEntryReactions(session, event);
  }
  if (event.type === BATTLE_EVENT.HEAL) {
    resolveHealCrestReactions(session, event);
    return true;
  }
  if (event.type === BATTLE_EVENT.ABILITY_TRIGGER) {
    return resolveSelfCombatKeywordGrant(session, event);
  }
  return false;
}

function resolveAlliedFollowerEntryReactions(session, event) {
  const playerIndex = Number(event.actor);
  const instanceId = event.payload?.card?.instanceId;
  if ((playerIndex !== 0 && playerIndex !== 1) || !instanceId) return false;
  const entered = session.findBoardCard(playerIndex, instanceId);
  if (!entered || cardType(entered) !== "follower" || !hasTrait(entered.card, "Marine")) return false;

  let reacted = false;
  for (const source of [...session.getPlayer(playerIndex).board]) {
    if (cardType(source) !== "follower") continue;
    const text = rulesText(source.card);

    if (MARINE_ENTRY_WARD.test(text) && grantWorldsBeyondKeyword(entered, "Ward")) {
      session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
        actor: playerIndex,
        payload: {
          card: session.cardView(entered),
          attack: 0,
          defense: 0,
          keywords: ["Ward"],
          reason: "allied-marine-entry",
          source: session.cardView(source)
        }
      });
      reacted = true;
    }

    const selfMatch = text.match(MARINE_ENTRY_SELF_KEYWORDS);
    if (!selfMatch) continue;
    const granted = [];
    for (const raw of [selfMatch[1], selfMatch[2]]) {
      if (!raw || !COMBAT_KEYWORDS.has(normalize(raw))) continue;
      if (!grantWorldsBeyondKeyword(source, raw)) continue;
      granted.push(raw);
      applyReadinessForGrantedKeyword(source, raw);
    }
    if (!granted.length) continue;
    session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
      actor: playerIndex,
      payload: {
        card: session.cardView(source),
        attack: 0,
        defense: 0,
        keywords: granted,
        reason: "allied-marine-entry-self",
        source: session.cardView(source),
        triggerCard: session.cardView(entered)
      }
    });
    reacted = true;
  }
  return reacted;
}

function resolveSelfCombatKeywordGrant(session, event) {
  if (event.payload?.resolved !== true || event.payload?.conditionInactive) return false;
  const playerIndex = Number(event.actor);
  const instanceId = event.payload?.card?.instanceId;
  if ((playerIndex !== 0 && playerIndex !== 1) || !instanceId) return false;
  const source = session.findBoardCard(playerIndex, instanceId);
  if (!source) return false;

  const text = String(event.payload?.text ?? "");
  const granted = [];
  for (const match of text.matchAll(/\bgive this follower\s+(Storm|Rush|Ward|Bane|Drain)(?:\s+and\s+(Storm|Rush|Ward|Bane|Drain))?\b/gi)) {
    for (const raw of [match[1], match[2]]) {
      if (!raw || !COMBAT_KEYWORDS.has(normalize(raw))) continue;
      if (!grantWorldsBeyondKeyword(source, raw)) continue;
      granted.push(raw);
      applyReadinessForGrantedKeyword(source, raw);
    }
  }

  if (!granted.length) return false;
  session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
    actor: playerIndex,
    payload: {
      card: session.cardView(source),
      attack: 0,
      defense: 0,
      keywords: granted,
      reason: "ability-keyword"
    }
  });
  return true;
}

function applyReadinessForGrantedKeyword(unit, keyword) {
  if (unit.permanentAttackLock || Number(unit.attacksRemaining ?? 0) <= 0) return;
  const name = normalize(keyword);
  if (name === "storm") {
    unit.canAttackFollowers = true;
    unit.canAttackLeader = true;
  } else if (name === "rush") {
    unit.canAttackFollowers = true;
  }
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

  // Crests with the same activation timing resolve in acquisition order.
  // Flame reacts to a healing action even for 0 restored defense; Ash requires
  // a real restoration, but neither may jump ahead of an earlier Crest.
  for (const crest of [...getWorldsBeyondCrests(player)]) {
    if (session.phase !== "main") return;
    const name = normalize(crest.name);
    if (name === "burnite, anathema of flame") {
      if (!applyBurniteHealReaction(session, playerIndex, crest, turn, "healing-action")) return;
    } else if (name === "burnite, anathema of ash" && healed > 0) {
      if (!applyBurniteHealReaction(session, playerIndex, crest, turn, "healing-restored")) return;
    }
  }
}

function applyBurniteHealReaction(session, playerIndex, crest, turn, trigger) {
  if (Number(crest?.healTriggerTurn) === turn) return true;
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

function hasTrait(card, trait) {
  const wanted = normalize(trait);
  return traitValues(card?.traits ?? card?.trait).some(value => normalize(traitName(value)) === wanted);
}

function traitValues(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/[,|]/).map(item => item.trim()).filter(Boolean);
  return value == null ? [] : [value];
}

function traitName(value) {
  if (!value || typeof value !== "object") return value;
  return value.name ?? value.trait ?? value.label ?? "";
}

function rulesText(card) {
  return String(card?.text ?? card?.rawSkillText ?? "")
    .replace(/<hr\s*\/?\s*>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
