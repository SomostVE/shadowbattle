import { BATTLE_EVENT } from "../../battle-events.js";

const ATTACK_ACTION = "attack";

export function normalizeWorldsBeyondCombatEvent(session, event) {
  if (event?.type !== BATTLE_EVENT.FOLLOWER_ENTER) return null;
  const owner = event.actor;
  const instanceId = event.payload?.card?.instanceId;
  if ((owner !== 0 && owner !== 1) || !instanceId) return null;
  const unit = session.findBoardCard(owner, instanceId);
  if (!unit || cardType(unit) !== "follower") return null;

  if (unit.playedTurn == null) unit.playedTurn = session.turn;
  if (unit.attacksRemaining == null) unit.attacksRemaining = 1;
  if (unit.hasAttacked == null) unit.hasAttacked = false;

  if (unit.permanentAttackLock) {
    unit.attacksRemaining = 0;
    unit.canAttackFollowers = false;
    unit.canAttackLeader = false;
    return unit;
  }

  const storm = hasWorldsBeyondKeyword(unit, "Storm");
  const rush = hasWorldsBeyondKeyword(unit, "Rush");
  unit.canAttackFollowers = storm || rush || Boolean(unit.evolved);
  unit.canAttackLeader = storm;
  return unit;
}

export function normalizeWorldsBeyondTurnCombatReadiness(player) {
  for (const unit of player?.board ?? []) {
    if (cardType(unit) !== "follower") continue;
    if (unit.permanentAttackLock) {
      unit.attacksRemaining = 0;
      unit.canAttackFollowers = false;
      unit.canAttackLeader = false;
      continue;
    }
    unit.attacksRemaining = Math.max(1, Number(unit.attacksRemaining ?? 1));
    unit.hasAttacked = false;
    unit.canAttackFollowers = true;
    unit.canAttackLeader = true;
  }
}

export function filterWorldsBeyondCombatActions(session, actions = []) {
  return actions.filter(action => action?.type !== ATTACK_ACTION || isWorldsBeyondAttackActionLegal(session, action));
}

export function assertWorldsBeyondCombatAction(session, action) {
  if (action?.type !== ATTACK_ACTION || isWorldsBeyondAttackActionLegal(session, action)) return;
  const targetLeader = action.target === "leader" || !action.targetInstanceId;
  throw new Error(targetLeader ? "Follower cannot attack the enemy leader yet" : "Follower cannot attack enemy followers yet");
}

export function isWorldsBeyondAttackActionLegal(session, action) {
  if (!session || action?.type !== ATTACK_ACTION) return false;
  const playerIndex = action.player;
  if (playerIndex !== 0 && playerIndex !== 1) return false;
  if (session.phase !== "main" || session.activePlayer !== playerIndex || session.winner != null) return false;

  const player = session.getPlayer(playerIndex);
  const enemy = session.getPlayer(1 - playerIndex);
  const unit = player.board.find(item => item.instanceId === action.attackerInstanceId);
  if (!unit || cardType(unit) !== "follower" || unit.permanentAttackLock) return false;
  if (Number(unit.attacksRemaining ?? 0) <= 0) return false;

  const wards = enemy.board.filter(item => cardType(item) === "follower" && hasWorldsBeyondKeyword(item, "Ward"));
  const targetLeader = action.target === "leader" || !action.targetInstanceId;
  if (targetLeader && wards.length) return false;
  if (!targetLeader) {
    const target = enemy.board.find(item => item.instanceId === action.targetInstanceId);
    if (!target || cardType(target) !== "follower") return false;
    if (wards.length && !hasWorldsBeyondKeyword(target, "Ward")) return false;
  }

  const enteredThisTurn = Number(unit.playedTurn) === Number(session.turn);
  if (!enteredThisTurn) return targetLeader ? Boolean(unit.canAttackLeader) : Boolean(unit.canAttackFollowers);

  const storm = hasWorldsBeyondKeyword(unit, "Storm");
  if (targetLeader) return Boolean(unit.canAttackLeader) && storm;
  const rush = hasWorldsBeyondKeyword(unit, "Rush");
  return Boolean(unit.canAttackFollowers) && (storm || rush || Boolean(unit.evolved));
}

export function grantWorldsBeyondKeyword(instance, keyword) {
  if (!instance || !keyword) return false;
  const wanted = normalize(keyword);
  const granted = keywordValues(instance.grantedKeywords);
  if (granted.some(value => normalize(keywordName(value)) === wanted)) return false;
  instance.grantedKeywords = [...granted, String(keyword).trim()];
  return true;
}

export function hasWorldsBeyondKeyword(instance, keyword) {
  const wanted = normalize(keyword);
  if (!wanted) return false;

  const granted = keywordValues(instance?.grantedKeywords);
  if (granted.some(value => normalize(keywordName(value)) === wanted)) return true;

  // Beyond Codex's `keywords` array is an index of every keyword mentioned by a
  // card, including conditional text such as "Combo (3) - Give this follower
  // Storm". It is therefore not authoritative for active combat abilities.
  // Printed combat keywords are represented as standalone rules-text lines.
  const text = cleanRulesText(instance?.card);
  if (text.trim()) {
    const escaped = escapeRegex(keyword);
    return new RegExp(`(?:^|[\\r\\n])\\s*${escaped}\\s*\\.?\\s*(?=$|[\\r\\n])`, "im").test(text);
  }

  // Synthetic/test/generated definitions may omit rules text entirely. Only in
  // that case is the keyword metadata safe as a fallback.
  const explicit = [
    ...keywordValues(instance?.card?.keywords),
    ...keywordValues(instance?.card?.keyword)
  ];
  return explicit.some(value => normalize(keywordName(value)) === wanted);
}

function cleanRulesText(card) {
  const text = String(card?.text ?? card?.rawSkillText ?? "");
  return text
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
