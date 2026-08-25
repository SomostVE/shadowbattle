import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const SOURCE_PAGE = "https://shadowverse-wb.com/en/special/fankit/";
const API_ENDPOINT = "https://shadowverse-wb.com/web/Fankit/index";
const SITE_ORIGIN = "https://shadowverse-wb.com/";
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
          "user-agent": "Mozilla/5.0 (compatible; ShadowBattle-FanKitArchive/1.1)",
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

function collectFanKitFiles(value, out = new Map()) {
  if (Array.isArray(value)) {
    for (const item of value) collectFanKitFiles(item, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;

  if (typeof value.file_name === "string" && typeof value.file_url === "string") {
    out.set(value.file_name, value.file_url.replaceAll("\\/", "/"));
  }
  for (const item of Object.values(value)) collectFanKitFiles(item, out);
  return out;
}

function assertPng(bytes, name) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 1024 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error(`${name} did not download as a valid PNG (${bytes.length} bytes)`);
  }
}

await fs.mkdir(BACKGROUND_DIR, { recursive: true });
await fs.rm(path.join(ROOT, "discovery.json"), { force: true });

console.log(`Reading official Worlds Beyond Fan Kit catalog: ${API_ENDPOINT}`);
const catalog = await fetchWithRetry(API_ENDPOINT, "json");
const officialFiles = collectFanKitFiles(catalog);
const wanted = [...BACKGROUNDS, LOGO];
const missing = wanted.filter(name => !officialFiles.has(name));
if (missing.length) throw new Error(`Official Fan Kit API is missing: ${missing.join(", ")}`);

const files = [];
for (const name of BACKGROUNDS) {
  const sourceUrl = new URL(`/${officialFiles.get(name).replace(/^\/+/, "")}`, SITE_ORIGIN).href;
  const bytes = await fetchWithRetry(sourceUrl);
  assertPng(bytes, name);
  const file = `./backgrounds/${name}`;
  await fs.writeFile(path.join(BACKGROUND_DIR, name), bytes);
  files.push({ file, sourceUrl, bytes: bytes.length, sha256: sha256(bytes), kind: "background" });
  console.log(`Archived ${name} (${bytes.length} bytes)`);
}

{
  const sourceUrl = new URL(`/${officialFiles.get(LOGO).replace(/^\/+/, "")}`, SITE_ORIGIN).href;
  const bytes = await fetchWithRetry(sourceUrl);
  assertPng(bytes, LOGO);
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
