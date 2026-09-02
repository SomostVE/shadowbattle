const APP_VERSION = new URL(self.location.href).searchParams.get("v") || "0.0.0";
const CACHE_PREFIX = "shadowbattle-app-";
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const mutableApiJson = url.pathname.includes("/api/") && url.pathname.endsWith(".json");
  const alwaysFresh = request.mode === "navigate"
    || request.cache === "no-store"
    || url.pathname.endsWith("/version.json")
    || mutableApiJson;
  event.respondWith(alwaysFresh ? networkFirst(request, url) : cacheFirst(request));
});

async function networkFirst(request, url) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok && !url.pathname.endsWith("/version.json")) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request) || await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request, { cache: "no-store" });
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}
