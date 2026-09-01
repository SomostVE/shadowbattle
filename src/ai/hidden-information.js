const PUBLIC_ZONE_BY_EVENT = Object.freeze({
  "card-play": "played",
  "card-discarded": "cemetery",
  "follower-enter": "board",
  "amulet-enter": "board",
  "spell-cast": "cemetery",
  "follower-destroyed": "cemetery",
  "amulet-destroyed": "cemetery",
  "card-banished": "banished",
  "card-returned": "returned"
});

export function buildOpponentBelief(session, playerIndex) {
  if (!session || (playerIndex !== 0 && playerIndex !== 1)) return emptyBelief(playerIndex);
  const enemyIndex = 1 - playerIndex;
  const view = session.getSnapshot(playerIndex);
  const enemy = view.players?.[enemyIndex] ?? {};
  const manifest = typeof session.getDeckManifest === "function" ? session.getDeckManifest(enemyIndex) : [];
  const manifestById = new Map(manifest.map(row => [String(row.cardId), { ...row }]));
  const revealedByInstance = new Map();
  const zoneByInstance = new Map();

  for (const card of enemy.board ?? []) recordPublicCard(card, enemyIndex, manifestById, revealedByInstance, zoneByInstance, "board");

  const events = typeof session.getEvents === "function" ? session.getEvents({ since: 0, viewer: playerIndex }) : [];
  for (const event of events) {
    recordEventCards(event, enemyIndex, manifestById, revealedByInstance, zoneByInstance);
  }

  const revealedCounts = new Map();
  for (const cardId of revealedByInstance.values()) revealedCounts.set(cardId, (revealedCounts.get(cardId) ?? 0) + 1);

  const remaining = manifest.map(row => {
    const cardId = String(row.cardId);
    const revealed = Math.min(Number(row.qty ?? 0), revealedCounts.get(cardId) ?? 0);
    return {
      ...row,
      revealed,
      qtyRemaining: Math.max(0, Number(row.qty ?? 0) - revealed)
    };
  });
  const remainingTotal = remaining.reduce((sum, row) => sum + row.qtyRemaining, 0);
  const knownPublicHand = [...revealedByInstance.entries()]
    .filter(([instanceId]) => zoneByInstance.get(instanceId) === "hand")
    .map(([instanceId, cardId]) => ({ instanceId, ...(manifestById.get(cardId) ?? { cardId }) }));
  const hiddenHandCount = Math.max(0, Number(enemy.handCount ?? 0));
  const unknownHandSlots = Math.min(remainingTotal, Math.max(0, hiddenHandCount - knownPublicHand.length));
  const nextTurnPp = projectedNextTurnPp(enemy, session.ruleset?.maxPp ?? 10);
  const playableRemaining = remaining.reduce((sum, row) => sum + (Number(row.cost ?? 0) <= nextTurnPp ? row.qtyRemaining : 0), 0);
  const playableProbability = probabilityAtLeastOne(remainingTotal, playableRemaining, unknownHandSlots);
  const expectedPlayableCopies = remainingTotal > 0 ? unknownHandSlots * playableRemaining / remainingTotal : 0;
  const pressure = clamp01(playableProbability * Math.min(1, 0.35 + unknownHandSlots / 7));

  return Object.freeze({
    viewer: playerIndex,
    opponent: enemyIndex,
    deckCount: Math.max(0, Number(enemy.deckCount ?? 0)),
    handCount: hiddenHandCount,
    knownPublicHand: Object.freeze(knownPublicHand.map(row => Object.freeze({ ...row }))),
    unknownHandSlots,
    revealedInitialCards: revealedByInstance.size,
    remainingInitialCards: remainingTotal,
    nextTurnPp,
    playableRemaining,
    playableProbability,
    expectedPlayableCopies,
    pressure,
    remaining: Object.freeze(remaining.map(row => Object.freeze({
      ...row,
      probabilityInUnknownHand: probabilityAtLeastOne(remainingTotal, row.qtyRemaining, unknownHandSlots)
    })))
  });
}

export function sampleOpponentHands(belief, { samples = 6, rng = Math.random } = {}) {
  const count = Math.max(0, Math.floor(Number(samples) || 0));
  if (!count || !belief || belief.unknownHandSlots <= 0) return [];
  const pool = [];
  for (const row of belief.remaining ?? []) {
    for (let index = 0; index < Number(row.qtyRemaining ?? 0); index += 1) pool.push(row);
  }
  if (!pool.length) return [];

  const handSize = Math.min(pool.length, Math.max(0, Number(belief.unknownHandSlots) || 0));
  const out = [];
  for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
    const copy = [...pool];
    for (let index = 0; index < handSize; index += 1) {
      const remaining = copy.length - index;
      const offset = Math.min(remaining - 1, Math.floor(unitIntervalExclusive(rng()) * remaining));
      const swap = index + offset;
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    out.push(Object.freeze(copy.slice(0, handSize).map(row => Object.freeze({ ...row }))));
  }
  return Object.freeze(out);
}

export function summarizeOpponentSamples(belief, samples = []) {
  if (!samples.length) return summarizeOpponentBelief(belief);
  const nextTurnPp = Math.max(0, Number(belief?.nextTurnPp ?? 0));
  let samplesWithPlayable = 0;
  let playableCopies = 0;
  let expensiveCopies = 0;

  for (const sample of samples) {
    const playable = sample.filter(card => Number(card.cost ?? 0) <= nextTurnPp);
    if (playable.length) samplesWithPlayable += 1;
    playableCopies += playable.length;
    expensiveCopies += sample.filter(card => Number(card.cost ?? 0) >= Math.max(4, nextTurnPp - 1)).length;
  }

  const denominator = samples.length;
  const hiddenSlots = Math.max(1, Number(belief?.unknownHandSlots ?? 0));
  const playableProbability = samplesWithPlayable / denominator;
  const averagePlayableCopies = playableCopies / denominator;
  const expensiveShare = expensiveCopies / (denominator * hiddenSlots);
  return Object.freeze({
    pressure: clamp01(playableProbability * 0.7 + Math.min(1, averagePlayableCopies / 3) * 0.2 + expensiveShare * 0.1),
    playableProbability,
    averagePlayableCopies,
    expensiveShare,
    samples: denominator
  });
}

export function summarizeOpponentBelief(belief) {
  return Object.freeze({
    pressure: clamp01(Number(belief?.pressure ?? 0)),
    playableProbability: clamp01(Number(belief?.playableProbability ?? 0)),
    averagePlayableCopies: Math.max(0, Number(belief?.expectedPlayableCopies ?? 0)),
    expensiveShare: 0,
    samples: 0
  });
}

function recordEventCards(event, enemyIndex, manifestById, revealedByInstance, zoneByInstance) {
  if (!event || typeof event !== "object") return;
  const payload = event.payload ?? {};
  const defaultZone = PUBLIC_ZONE_BY_EVENT[event.type] ?? null;
  collectCardViews(payload, card => recordPublicCard(card, enemyIndex, manifestById, revealedByInstance, zoneByInstance, null));

  if (event.type === "card-returned") {
    markZone(payload.card, enemyIndex, zoneByInstance, payload.destination === "hand" ? "hand" : (payload.destination ?? defaultZone));
  } else if (defaultZone) {
    markZone(payload.card, enemyIndex, zoneByInstance, defaultZone);
  } else if (event.type === "fuse") {
    markZone(payload.target, enemyIndex, zoneByInstance, "hand");
    for (const material of payload.materials ?? []) markZone(material, enemyIndex, zoneByInstance, "fused");
  } else if (event.type === "card-transform") {
    const instanceId = payload.after?.instanceId ?? payload.before?.instanceId;
    if (isOriginalInstance(instanceId, enemyIndex) && zoneByInstance.get(instanceId) === "hand") zoneByInstance.set(instanceId, "hand");
  }
}

function recordPublicCard(card, enemyIndex, manifestById, revealedByInstance, zoneByInstance, zone) {
  if (!isCardView(card) || !isOriginalInstance(card.instanceId, enemyIndex)) return;
  const cardId = String(card.cardId ?? "");
  if (!manifestById.has(cardId)) return;
  if (!revealedByInstance.has(card.instanceId)) revealedByInstance.set(card.instanceId, cardId);
  if (zone) zoneByInstance.set(card.instanceId, zone);
}

function markZone(card, enemyIndex, zoneByInstance, zone) {
  if (!zone || !isCardView(card) || !isOriginalInstance(card.instanceId, enemyIndex)) return;
  zoneByInstance.set(card.instanceId, zone);
}

function collectCardViews(value, visit, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (isCardView(value)) visit(value);
  if (Array.isArray(value)) {
    for (const item of value) collectCardViews(item, visit, seen);
    return;
  }
  for (const nested of Object.values(value)) collectCardViews(nested, visit, seen);
}

function isCardView(value) {
  return Boolean(value && typeof value === "object" && typeof value.instanceId === "string" && value.cardId != null);
}

function isOriginalInstance(instanceId, owner) {
  return typeof instanceId === "string" && instanceId.startsWith(`${owner}:`);
}

function projectedNextTurnPp(enemy, maxPp) {
  const cap = Math.max(1, Number(maxPp) || 10);
  const current = Math.max(0, Number(enemy?.resources?.maxPp ?? 0));
  return Math.min(cap, current + 1);
}

function probabilityAtLeastOne(total, successes, draws) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  const k = Math.min(n, Math.max(0, Math.floor(Number(successes) || 0)));
  const h = Math.min(n, Math.max(0, Math.floor(Number(draws) || 0)));
  if (!n || !k || !h) return 0;
  if (k >= n || h > n - k) return 1;
  let none = 1;
  for (let index = 0; index < h; index += 1) {
    none *= (n - k - index) / (n - index);
  }
  return clamp01(1 - none);
}

function emptyBelief(playerIndex) {
  return Object.freeze({
    viewer: playerIndex,
    opponent: playerIndex === 0 ? 1 : 0,
    deckCount: 0,
    handCount: 0,
    knownPublicHand: Object.freeze([]),
    unknownHandSlots: 0,
    revealedInitialCards: 0,
    remainingInitialCards: 0,
    nextTurnPp: 0,
    playableRemaining: 0,
    playableProbability: 0,
    expectedPlayableCopies: 0,
    pressure: 0,
    remaining: Object.freeze([])
  });
}

function unitIntervalExclusive(value) {
  const normalized = Math.max(0, Number(value) || 0);
  return Math.min(1 - Number.EPSILON, normalized);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}
