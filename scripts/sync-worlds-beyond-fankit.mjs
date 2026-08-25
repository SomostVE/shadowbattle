import fs from "node:fs/promises";
import path from "node:path";

const PAGE = "https://shadowverse-wb.com/en/special/fankit/";
const ORIGIN = new URL(PAGE).origin;
const OUT = path.join("assets", "fankits", "worlds-beyond", "discovery.json");
const PROBES = [
  `${ORIGIN}/assets/debug/Fankit.json`,
  `${ORIGIN}/web/Fankit/index`,
  `${ORIGIN}/web/Fankit/index?lang=en`
];

async function request(url, accept = "text/html,application/xhtml+xml,application/json,application/javascript,text/css,*/*;q=0.8") {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ShadowBattle-FanKitSync/1.1)",
      accept,
      "accept-language": "en-US,en;q=0.9"
    },
    signal: AbortSignal.timeout(90_000)
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, url: response.url, text, contentType: response.headers.get("content-type") || "" };
}

async function get(url) {
  const result = await request(url);
  if (!result.ok) throw new Error(`${result.status}: ${url}`);
  return result.text;
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
    if (resolved && resolved.startsWith(ORIGIN) && /\.(?:js|css)(?:$|\?)/i.test(resolved)) out.add(resolved);
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
      if (value.length > 1200) continue;
      const resolved = resolveMaybe(value, base);
      if (resolved) candidates.add(resolved);
    }
  }
  return [...candidates];
}

function collectJsonUrls(value, base, out = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonUrls(item, base, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectJsonUrls(item, base, out);
    return out;
  }
  if (typeof value === "string") {
    const resolved = resolveMaybe(value, base);
    if (resolved && /\.(?:zip|png|jpe?g|webp)(?:$|\?)/i.test(resolved)) out.add(resolved);
  }
  return out;
}

const html = await get(PAGE);
const resourceUrls = collectResourceUrls(html, PAGE);
console.log(`Fan Kit HTML: ${html.length} chars; ${resourceUrls.length} same-origin JS/CSS resources.`);

const corpus = [{ url: PAGE, text: html }];
for (const url of resourceUrls.slice(0, 60)) {
  try {
    const text = await get(url);
    if (text.length <= 8_000_000) corpus.push({ url, text });
    console.log(`Fetched resource ${url} (${text.length} chars)`);
  } catch (error) {
    console.warn(`Skipped ${url}: ${error.message}`);
  }
}

const probeResults = [];
for (const probe of PROBES) {
  try {
    const result = await request(probe, "application/json,text/plain,*/*;q=0.8");
    const record = {
      requestUrl: probe,
      finalUrl: result.url,
      status: result.status,
      contentType: result.contentType,
      length: result.text.length,
      sample: result.text.slice(0, 1800)
    };
    try {
      const payload = JSON.parse(result.text);
      record.json = payload;
      record.assetUrls = [...collectJsonUrls(payload, result.url)];
      console.log(`Probe ${probe}: ${result.status}, JSON, ${record.assetUrls.length} asset URLs.`);
    } catch {
      console.log(`Probe ${probe}: ${result.status}, ${result.contentType}, ${result.text.length} chars.`);
    }
    probeResults.push(record);
  } catch (error) {
    probeResults.push({ requestUrl: probe, error: error.message });
    console.warn(`Probe failed ${probe}: ${error.message}`);
  }
}

for (const entry of corpus) {
  for (const needle of ["/web/Fankit/index", "downloadInfo.file_url", "bulk_download_list"]) {
    const index = entry.text.indexOf(needle);
    if (index >= 0) {
      const start = Math.max(0, index - 700);
      const end = Math.min(entry.text.length, index + 1800);
      console.log(`Context ${needle} in ${entry.url}:\n${entry.text.slice(start, end)}`);
    }
  }
}

const all = new Map();
for (const entry of corpus) {
  for (const candidate of collectCandidates(entry.text, entry.url)) {
    if (!all.has(candidate)) all.set(candidate, new Set());
    all.get(candidate).add(entry.url);
  }
}
for (const probe of probeResults) {
  for (const candidate of probe.assetUrls ?? []) {
    if (!all.has(candidate)) all.set(candidate, new Set());
    all.get(candidate).add(probe.requestUrl);
  }
}

const interesting = [...all.entries()]
  .map(([url, sources]) => ({ url, sources: [...sources] }))
  .filter(entry => /(?:fankit|fan-kit|background|back_ground|download|\.zip(?:$|\?))/i.test(entry.url))
  .sort((a, b) => a.url.localeCompare(b.url));

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify({
  schemaVersion: 2,
  sourcePage: PAGE,
  discoveredAt: new Date().toISOString(),
  resourcesScanned: corpus.length,
  probes: probeResults,
  candidates: interesting
}, null, 2)}\n`, "utf8");

console.log(`Interesting candidates: ${interesting.length}`);
for (const entry of interesting.slice(0, 120)) console.log(entry.url);
