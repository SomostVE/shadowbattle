const VERSION_KEY = "shadowbattle:app-version";
const RELOAD_KEY = "shadowbattle:version-reload";
const MODULE_URL = import.meta.url;
const CHECK_INTERVAL_MS = 60_000;

let checking = false;

checkVersion();

window.addEventListener("pageshow", () => checkVersion());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkVersion();
});
window.setInterval(() => {
  if (!document.hidden) checkVersion();
}, CHECK_INTERVAL_MS);

async function checkVersion() {
  if (checking) return;
  checking = true;

  try {
    const version = await readRemoteVersion();
    if (!version) return;

    console.info(`[ShadowBattle] Version ${version}`);

    const registration = await registerWorker(version);
    const localVersion = localStorage.getItem(VERSION_KEY);

    if (localVersion === version) {
      sessionStorage.removeItem(RELOAD_KEY);
      removeVersionQuery(version);
      return;
    }

    // Application code/cache version only. Decks and other user data are untouched.
    localStorage.setItem(VERSION_KEY, version);

    const reloadToken = `${version}:${location.pathname}`;
    if (sessionStorage.getItem(RELOAD_KEY) === reloadToken) return;
    sessionStorage.setItem(RELOAD_KEY, reloadToken);

    await waitForWorkerControl(registration);

    const next = new URL(location.href);
    next.searchParams.set("appv", version);
    location.replace(next.href);
  } catch (error) {
    console.warn("Unable to check ShadowBattle version", error);
  } finally {
    checking = false;
  }
}

async function readRemoteVersion() {
  const url = new URL("../../version.json", MODULE_URL);
  url.searchParams.set("_", String(Date.now()));

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const payload = await response.json();
  const version = String(payload?.version ?? "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.warn("Invalid ShadowBattle version", version);
    return null;
  }
  return version;
}

async function registerWorker(version) {
  if (!("serviceWorker" in navigator)) return null;

  try {
    const workerUrl = new URL("../../sw.js", MODULE_URL);
    workerUrl.searchParams.set("v", version);
    const scopeUrl = new URL("../../", MODULE_URL);
    const registration = await navigator.serviceWorker.register(workerUrl, {
      scope: scopeUrl.href,
      updateViaCache: "none"
    });
    await registration.update().catch(() => {});
    return registration;
  } catch (error) {
    console.warn("Unable to register ShadowBattle cache worker", error);
    return null;
  }
}

async function waitForWorkerControl(registration) {
  if (!registration || !("serviceWorker" in navigator)) return;

  const candidate = registration.waiting || registration.installing;
  if (!candidate && navigator.serviceWorker.controller) return;

  await new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, 2000);
    navigator.serviceWorker.addEventListener("controllerchange", finish, { once: true });
  });
}

function removeVersionQuery(version) {
  const current = new URL(location.href);
  if (current.searchParams.get("appv") !== version) return;
  current.searchParams.delete("appv");
  history.replaceState(null, "", `${current.pathname}${current.search}${current.hash}`);
}
