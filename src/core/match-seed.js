export function resolveMatchSeed(requestedSeed, {
  cryptoObject = globalThis.crypto,
  now = Date.now,
  random = Math.random
} = {}) {
  const requested = String(requestedSeed ?? "").trim();
  if (requested) return requested;

  if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
    const values = new Uint32Array(4);
    cryptoObject.getRandomValues(values);
    return `shadowbattle-${[...values].map(value => value.toString(36).padStart(7, "0")).join("-")}`;
  }

  const timestamp = Math.max(0, Number(now()) || 0).toString(36);
  const entropy = Math.floor(Math.max(0, Math.min(0.999999999999, Number(random()) || 0)) * 0x100000000)
    .toString(36)
    .padStart(7, "0");
  return `shadowbattle-${timestamp}-${entropy}`;
}
