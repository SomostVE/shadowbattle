import { BATTLE_EVENT } from "../../battle-events.js";

const ATTACK_ACTION = "attack";
const KEYWORD_PATTERNS = new Map();

export function normalizeWorldsBeyondCombatEvent(session, event) {
  if (event?.type !== BATTLE_EVENT.FOLLOWER_ENTER) return null;
  const owner = event.actor;
  const instanceId = event.payload?.card?.instanceId;
  if ((owner !== 0 && owner !== 1) || !instanceId) return null;
  const unit = session.findBoardCard(owner, instanceId);
  if (!unit || cardType(unit) !== "follower") return null;

  if (unit.playedTurn == null) unit.playedTurn = session.turn;
  if (hasWorldsBeyondPrintedAttackLock(unit)) unit.permanentAttackLock = true;
  unit.attackLimit = getWorldsBeyondAttackLimit(unit);
  unit.attacksRemaining = unit.attackLimit;
  if (unit.hasAttacked == null) unit.hasAttacked = false;
  if (unit.barrierActive == null && hasWorldsBeyondKeyword(unit, "Barrier")) unit.barrierActive = true;
  return refreshWorldsBeyondAttackReadiness(session, owner, unit);
}

export function normalizeWorldsBeyondTurnCombatReadiness(player) {
  for (const unit of player?.board ?? []) {
    if (cardType(unit) !== "follower") continue;
    unit.attackLimit = getWorldsBeyondAttackLimit(unit);
    unit.attacksRemaining = unit.attackLimit;
    unit.hasAttacked = false;
    if (unit.permanentAttackLock) {
      lockAttacks(unit);
      continue;
    }
    unit.canAttackFollowers = true;
    unit.canAttackLeader = true;
  }
}

export function refreshWorldsBeyondAttackReadiness(session, playerIndex, unit) {
  if (!unit || cardType(unit) !== "follower") return unit ?? null;
  if (unit.permanentAttackLock || Number(unit.attacksRemaining ?? 0) <= 0) {
    lockAttacks(unit);
    return unit;
  }

  if (Number(unit.playedTurn) !== Number(session?.turn)) {
    unit.canAttackFollowers = true;
    unit.canAttackLeader = true;
    return unit;
  }

  const storm = hasWorldsBeyondKeyword(unit, "Storm");
  unit.canAttackFollowers = storm || hasWorldsBeyondKeyword(unit, "Rush") || Boolean(unit.evolved);
  unit.canAttackLeader = storm;
  return unit;
}

export function getWorldsBeyondAttackLimit(instance) {
  const match = cleanRulesText(instance?.card).match(/\bCan attack\s+(\d+)\s+times per turn\b/i);
  const amount = Number(match?.[1] ?? 1) || 1;
  return Math.max(1, Math.min(10, amount));
}

export function hasWorldsBeyondPrintedAttackLock(instance) {
  return /(?:^|[\r\n])\s*Can['’]?t attack followers or leaders\s*\.?\s*(?=$|[\r\n])/im.test(cleanRulesText(instance?.card));
}

export function getWorldsBeyondWardFollowers(player) {
  return (player?.board ?? []).filter(unit => cardType(unit) === "follower" && hasWorldsBeyondKeyword(unit, "Ward"));
}

export function getWorldsBeyondAttackCapabilities(session, playerIndex, unit) {
  if (!session || (playerIndex !== 0 && playerIndex !== 1)) return { followers: false, leader: false };
  if (session.phase !== "main" || session.activePlayer !== playerIndex || session.winner != null) return { followers: false, leader: false };
  if (!unit || cardType(unit) !== "follower" || unit.permanentAttackLock || Number(unit.attacksRemaining ?? 0) <= 0) {
    return { followers: false, leader: false };
  }

  if (Number(unit.playedTurn) !== Number(session.turn)) {
    return {
      followers: Boolean(unit.canAttackFollowers),
      leader: Boolean(unit.canAttackLeader)
    };
  }

  const storm = hasWorldsBeyondKeyword(unit, "Storm");
  return {
    followers: Boolean(unit.canAttackFollowers) && (storm || hasWorldsBeyondKeyword(unit, "Rush") || Boolean(unit.evolved)),
    leader: Boolean(unit.canAttackLeader) && storm
  };
}

export function filterWorldsBeyondCombatActions(session, actions = []) {
  return actions.filter(action => action?.type !== ATTACK_ACTION || isWorldsBeyondAttackActionLegal(session, action));
}

export function assertWorldsBeyondCombatAction(session, action) {
  if (action?.type !== ATTACK_ACTION || isWorldsBeyondAttackActionLegal(session, action)) return;

  const playerIndex = action?.player;
  const targetLeader = action?.target === "leader" || !action?.targetInstanceId;
  if ((playerIndex === 0 || playerIndex === 1) && session?.phase === "main") {
    const enemy = session.getPlayer(1 - playerIndex);
    const wards = getWorldsBeyondWardFollowers(enemy);
    if (targetLeader && wards.length) throw new Error("An enemy Ward follower must be attacked first");
    if (!targetLeader && wards.length) {
      const target = enemy.board.find(unit => unit.instanceId === action.targetInstanceId) ?? null;
      if (target && !hasWorldsBeyondKeyword(target, "Ward")) throw new Error("An enemy Ward follower must be attacked first");
    }
  }

  throw new Error(targetLeader ? "Follower cannot attack the enemy leader yet" : "Follower cannot attack enemy followers yet");
}

export function isWorldsBeyondAttackActionLegal(session, action) {
  if (!session || action?.type !== ATTACK_ACTION) return false;
  const playerIndex = action.player;
  if (playerIndex !== 0 && playerIndex !== 1) return false;

  const player = session.getPlayer(playerIndex);
  const enemy = session.getPlayer(1 - playerIndex);
  const unit = player.board.find(item => item.instanceId === action.attackerInstanceId);
  const capabilities = getWorldsBeyondAttackCapabilities(session, playerIndex, unit);
  const targetLeader = action.target === "leader" || !action.targetInstanceId;

  if (targetLeader) {
    return capabilities.leader && getWorldsBeyondWardFollowers(enemy).length === 0;
  }
  if (!capabilities.followers) return false;

  const target = enemy.board.find(item => item.instanceId === action.targetInstanceId);
  if (!target || cardType(target) !== "follower") return false;
  const wards = getWorldsBeyondWardFollowers(enemy);
  return !wards.length || hasWorldsBeyondKeyword(target, "Ward");
}

export function grantWorldsBeyondKeyword(instance, keyword) {
  if (!instance || !keyword) return false;
  const wanted = normalize(keyword);
  const granted = keywordValues(instance.grantedKeywords);
  const suppressed = keywordValues(instance.suppressedKeywords);
  const remainingSuppressed = suppressed.filter(value => normalize(keywordName(value)) !== wanted);
  const unsuppressed = remainingSuppressed.length !== suppressed.length;
  if (unsuppressed) instance.suppressedKeywords = remainingSuppressed;
  const alreadyGranted = granted.some(value => normalize(keywordName(value)) === wanted);
  let reactivated = false;
  if (wanted === "barrier" && !instance.barrierActive) {
    instance.barrierActive = true;
    reactivated = true;
  }
  if (alreadyGranted) return reactivated || unsuppressed;
  instance.grantedKeywords = [...granted, String(keyword).trim()];
  return true;
}

export function removeWorldsBeyondKeyword(instance, keyword) {
  if (!instance || !keyword) return false;
  const wanted = normalize(keyword);
  if (!wanted) return false;
  const hadKeyword = hasWorldsBeyondKeyword(instance, keyword);
  const granted = keywordValues(instance.grantedKeywords);
  instance.grantedKeywords = granted.filter(value => normalize(keywordName(value)) !== wanted);
  const suppressed = keywordValues(instance.suppressedKeywords);
  if (!suppressed.some(value => normalize(keywordName(value)) === wanted)) {
    instance.suppressedKeywords = [...suppressed, String(keyword).trim()];
  }
  if (wanted === "barrier") instance.barrierActive = false;
  return hadKeyword;
}

export function hasWorldsBeyondKeyword(instance, keyword) {
  const wanted = normalize(keyword);
  if (!wanted) return false;
  const suppressed = keywordValues(instance?.suppressedKeywords);
  if (suppressed.some(value => normalize(keywordName(value)) === wanted)) return false;
  if (wanted === "barrier" && Object.prototype.hasOwnProperty.call(instance ?? {}, "barrierActive")) {
    return Boolean(instance.barrierActive);
  }

  const granted = keywordValues(instance?.grantedKeywords);
  if (granted.some(value => normalize(keywordName(value)) === wanted)) return true;

  const explicit = [
    ...keywordValues(instance?.card?.keywords),
    ...keywordValues(instance?.card?.keyword)
  ];
  const explicitlyIndexed = explicit.some(value => normalize(keywordName(value)) === wanted);
  const text = cleanRulesText(instance?.card);
  if (!text.trim()) return explicitlyIndexed;

  const patterns = keywordPatterns(wanted);
  if (patterns.standalone.test(text)) return true;

  // Beyond Codex indexes every keyword mentioned in a card, including
  // conditional grants. A mention in rules prose is not an active keyword.
  if (patterns.mentioned.test(text)) return false;

  // Synthetic/generated definitions may expose keyword metadata while omitting
  // that keyword from abbreviated rules text.
  return explicitlyIndexed;
}

export function modifyWorldsBeyondFollowerDamage(instance, amount) {
  const damage = Math.max(0, Number(amount) || 0);
  if (!instance?.barrierActive) return damage;
  instance.barrierActive = false;
  return 0;
}

function lockAttacks(unit) {
  unit.attacksRemaining = 0;
  unit.canAttackFollowers = false;
  unit.canAttackLeader = false;
}

function keywordPatterns(keyword) {
  let patterns = KEYWORD_PATTERNS.get(keyword);
  if (patterns) return patterns;
  const escaped = escapeRegex(keyword);
  patterns = {
    standalone: new RegExp(`(?:^|[\\r\\n])\\s*${escaped}\\s*\\.?\\s*(?=$|[\\r\\n])`, "im"),
    mentioned: new RegExp(`\\b${escaped}\\b`, "i")
  };
  KEYWORD_PATTERNS.set(keyword, patterns);
  return patterns;
}

function cleanRulesText(card) {
  return String(card?.text ?? card?.rawSkillText ?? "")
    .replace(/<hr\s*\/?\s*>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

function keywordValues(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/[,|]/).map(item => item.trim()).filter(Boolean);
  return value == null ? [] : [value];
}

function keywordName(value) {
  if (!value || typeof value !== "object") return value;
  return value.name ?? value.keyword ?? value.label ?? "";
}

function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
