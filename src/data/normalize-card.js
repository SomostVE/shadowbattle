export function normalizeShadowBattleCard({ gameId, dataNamespace, sourceCard }) {
  if (!gameId || !dataNamespace) throw new Error("Card normalization requires a gameId and dataNamespace");
  if (!sourceCard || sourceCard.id == null) throw new Error(`Card from ${gameId} is missing its source id`);

  const sourceCardId = String(sourceCard.id);
  return Object.freeze({
    ...sourceCard,
    gameId,
    dataNamespace,
    sourceCardId,
    uid: `${dataNamespace}:${sourceCardId}`
  });
}
