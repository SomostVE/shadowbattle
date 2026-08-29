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
