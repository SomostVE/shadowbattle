export function gainWorldsBeyondRally(player, amount = 1) {
  if (!player?.resources) return 0;
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return Math.max(0, Number(player.resources.rally ?? 0));
  player.resources.rally = Math.max(0, Number(player.resources.rally ?? 0)) + value;
  return player.resources.rally;
}
