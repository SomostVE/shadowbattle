const providers = new Map();

export function registerDataProvider(provider) {
  if (!provider?.gameId) throw new Error("A ShadowBattle data provider must declare gameId");
  if (typeof provider.loadCards !== "function") throw new Error(`Provider ${provider.gameId} must implement loadCards()`);
  if (providers.has(provider.gameId)) throw new Error(`Data provider already registered for ${provider.gameId}`);
  providers.set(provider.gameId, provider);
  return provider;
}

export function getDataProvider(gameId) {
  const provider = providers.get(gameId);
  if (!provider) throw new Error(`No data provider registered for ${gameId}`);
  return provider;
}

export function listDataProviders() {
  return [...providers.values()];
}
