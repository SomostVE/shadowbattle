import fs from "node:fs/promises";
import path from "node:path";

const PAGE = "https://shadowverse-wb.com/en/special/fankit/";
const ORIGIN = new URL(PAGE).origin;
const OUT = path.join("assets", "fankits", "worlds-beyond", "discovery.json");

async function get(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ShadowBattle-FanKitSync/1.0)",
      accept: "text/html,application/xhtml+xml,application/javascript,text/css,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(90_000)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return await response.text();
}

function clean(value) {
  return String(value ?? "")
    .replaceAll("\\/", "/")
    .replaceAll("\\u002F", "/")
    .replaceAll("&amp;", "&");
}

function resolveMaybe(value, base) {
  const raw = clean(value).trim();
  if (!raw || raw.startsWith("data:")) return null;
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function collectResourceUrls(text, base) {
  const out = new Set();
  for (const match of text.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const resolved = resolveMaybe(match[1], base);
    if (resolved && resolved.startsWith(ORIGIN)) out.add(resolved);
  }
  return [...out];
}

function collectCandidates(text, base) {
  const candidates = new Set();
  const patterns = [
    /https?:\\?\/\\?\/[^"'`\s<>]+/gi,
    /["'`]([^"'`]+\.(?:zip|png|jpe?g|webp)(?:\?[^"'`]*)?)["'`]/gi,
    /["'`]([^"'`]*(?:fankit|fan-kit|background|back_ground|download)[^"'`]*)["'`]/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = clean(match[1] ?? match[0]);
      const resolved = resolveMaybe(value, base);
      if (resolved) candidates.add(resolved);
    }
  }
  return [...candidates];
}

const html = await get(PAGE);
const resourceUrls = collectResourceUrls(html, PAGE);
console.log(`Fan Kit HTML: ${html.length} chars; ${resourceUrls.length} same-origin script/style resources.`);

const corpus = [{ url: PAGE, text: html }];
for (const url of resourceUrls.slice(0, 80)) {
  try {
    const text = await get(url);
    if (text.length <= 8_000_000) corpus.push({ url, text });
    console.log(`Fetched resource ${url} (${text.length} chars)`);
  } catch (error) {
    console.warn(`Skipped ${url}: ${error.message}`);
  }
}

const all = new Map();
for (const entry of corpus) {
  for (const candidate of collectCandidates(entry.text, entry.url)) {
    if (!all.has(candidate)) all.set(candidate, new Set());
    all.get(candidate).add(entry.url);
  }
}

const interesting = [...all.entries()]
  .map(([url, sources]) => ({ url, sources: [...sources] }))
  .filter(entry => /(?:fankit|fan-kit|background|back_ground|download|\.zip(?:$|\?))/i.test(entry.url))
  .sort((a, b) => a.url.localeCompare(b.url));

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify({
  schemaVersion: 1,
  sourcePage: PAGE,
  discoveredAt: new Date().toISOString(),
  resourcesScanned: corpus.length,
  candidates: interesting
}, null, 2)}\n`, "utf8");

console.log(`Interesting candidates: ${interesting.length}`);
for (const entry of interesting.slice(0, 120)) console.log(entry.url);
if (interesting.length === 0) {
  console.log("No direct Fan Kit candidates yet. Resource list:");
  for (const url of resourceUrls.slice(0, 120)) console.log(url);
}
