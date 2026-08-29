const FOLLOWER_COUNT_X = /\bX is the number of followers on the field\s*\.?/i;
const AREA_DAMAGE_X = /\bdeal X damage to all followers\b/i;

export const LIVE_ALL_FOLLOWER_COUNT_DAMAGE = /\bdeal damage to all followers equal to the number of followers on the field\b/gi;

export function resolveWorldsBeyondAllFollowersCountX(textValue) {
  const text = String(textValue ?? "");
  if (!FOLLOWER_COUNT_X.test(text) || !AREA_DAMAGE_X.test(text)) return text;

  const withoutDefinition = text.replace(FOLLOWER_COUNT_X, " ");
  return withoutDefinition
    .replace(AREA_DAMAGE_X, "Deal damage to all followers equal to the number of followers on the field")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

export function resolveWorldsBeyondAllFollowersCountDamage(session, {
  playerIndex,
  source = null,
  destroyFollower
} = {}) {
  const targets = session.players.flatMap((player, owner) => player.board
    .filter(unit => cardType(unit) === "follower")
    .map(unit => ({ owner, instanceId: unit.instanceId })));
  const amount = targets.length;
  if (!amount) return false;

  for (const { owner, instanceId } of targets) {
    if (!session.findBoardCard(owner, instanceId)) continue;
    session.damageFollower(owner, instanceId, amount, {
      actor: playerIndex,
      source,
      reason: "ability",
      resolveDeath: false
    });
  }

  for (const { owner, instanceId } of targets) {
    const live = session.findBoardCard(owner, instanceId);
    if (!live || Number(live.defense ?? 0) > 0) continue;
    destroyFollower?.(session, owner, instanceId, {
      actor: playerIndex,
      source,
      reason: "ability",
      byAbility: true
    });
  }
  return true;
}

function cardType(instance) {
  return String(instance?.typeOverride ?? instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}
