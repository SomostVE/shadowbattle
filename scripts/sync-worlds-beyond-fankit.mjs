import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const SOURCE_PAGE = "https://shadowverse-wb.com/en/special/fankit/";
const API_ENDPOINT = "https://shadowverse-wb.com/web/Fankit/index";
const ASSET_BASE = "https://shadowverse-wb.com/web/Fankit/";
const ROOT = path.join("assets", "fankits", "worlds-beyond");
const BACKGROUND_DIR = path.join(ROOT, "backgrounds");

const BACKGROUNDS = [
  "background_Abysscraft.png",
  "background_Dragoncraft.png",
  "background_FeastofWolves.png",
  "background_Forestcraft.png",
  "background_Havencraft.png",
  "background_LibraryofLambs.png",
  "background_Portalcraft.png",
  "background_Runecraft.png",
  "background_Swordcraft.png"
];
const LOGO = "logo_ShadowverseWB.png";

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function fetchWithRetry(url, kind = "bytes", attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; ShadowBattle-FanKitArchive/1.0)",
          accept: kind === "json" ? "application/json,*/*;q=0.8" : "image/png,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9"
        },
        signal: AbortSignal.timeout(90_000)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return kind === "json" ? await response.json() : Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1400));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError?.message ?? lastError}`);
}

function collectStrings(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
  } else if (typeof value === "string") {
    out.push(value);
  }
  return out;
}

function assertOfficialCatalog(payload) {
  const strings = collectStrings(payload);
  const missing = [...BACKGROUNDS, LOGO].filter(name => !strings.some(value => value.includes(name)));
  if (missing.length) {
    throw new Error(`Official Fan Kit API no longer exposes expected assets: ${missing.join(", ")}`);
  }
}

await fs.mkdir(BACKGROUND_DIR, { recursive: true });
await fs.rm(path.join(ROOT, "discovery.json"), { force: true });

console.log(`Checking official Worlds Beyond Fan Kit catalog: ${API_ENDPOINT}`);
const catalog = await fetchWithRetry(API_ENDPOINT, "json");
assertOfficialCatalog(catalog);

const files = [];
for (const name of BACKGROUNDS) {
  const sourceUrl = new URL(name, ASSET_BASE).href;
  const bytes = await fetchWithRetry(sourceUrl);
  const file = `./backgrounds/${name}`;
  await fs.writeFile(path.join(BACKGROUND_DIR, name), bytes);
  files.push({ file, sourceUrl, bytes: bytes.length, sha256: sha256(bytes), kind: "background" });
  console.log(`Archived ${name} (${bytes.length} bytes)`);
}

{
  const sourceUrl = new URL(LOGO, ASSET_BASE).href;
  const bytes = await fetchWithRetry(sourceUrl);
  const file = `./${LOGO}`;
  await fs.writeFile(path.join(ROOT, LOGO), bytes);
  files.push({ file, sourceUrl, bytes: bytes.length, sha256: sha256(bytes), kind: "logo" });
  console.log(`Archived ${LOGO} (${bytes.length} bytes)`);
}

const manifest = {
  schemaVersion: 2,
  gameId: "worlds-beyond",
  source: "official-cygames-fankit",
  sourcePage: SOURCE_PAGE,
  apiEndpoint: API_ENDPOINT,
  fetchedAt: new Date().toISOString(),
  status: "archived",
  fileCount: files.length,
  logo: `./${LOGO}`,
  backgrounds: BACKGROUNDS.map(name => `./backgrounds/${name}`),
  files
};

await fs.writeFile(path.join(ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Worlds Beyond Fan Kit ready: ${BACKGROUNDS.length} backgrounds + 1 logo.`);
