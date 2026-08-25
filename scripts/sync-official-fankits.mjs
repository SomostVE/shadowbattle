import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const KITS = [
  {
    gameId: "shadowverse-ccg",
    page: "https://shadowverse.com/special/fankit/"
  },
  {
    gameId: "worlds-beyond",
    page: "https://shadowverse-wb.com/ja/special/fankit/"
  }
];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeName(url, index) {
  const raw = decodeURIComponent(path.basename(url.pathname) || `asset-${index}`)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || `asset-${index}`;
}

async function fetchWithRetry(url, kind = "text", attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "ShadowBattle official Fan Kit archival sync/0.3" },
        signal: AbortSignal.timeout(90_000)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return kind === "bytes" ? Buffer.from(await response.arrayBuffer()) : await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

function discoverDownloadLinks(html, pageUrl) {
  const hrefs = [...html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1].replaceAll("&amp;", "&"));
  const out = [];
  const seen = new Set();
  for (const href of hrefs) {
    let url;
    try { url = new URL(href, pageUrl); } catch { continue; }
    if (url.protocol !== "https:") continue;
    if (!/\.(?:zip|png|jpe?g|webp)(?:$|\?)/i.test(`${url.pathname}${url.search}`)) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    out.push(url);
  }
  return out;
}

for (const kit of KITS) {
  const root = path.join("assets", "fankits", kit.gameId);
  const downloadDir = path.join(root, "downloads");
  await fs.mkdir(downloadDir, { recursive: true });

  console.log(`Discovering official Fan Kit: ${kit.page}`);
  const html = await fetchWithRetry(kit.page);
  const links = discoverDownloadLinks(html, kit.page);
  if (links.length === 0) throw new Error(`No downloadable Fan Kit assets discovered for ${kit.gameId}`);

  const files = [];
  const usedNames = new Set();
  for (let index = 0; index < links.length; index++) {
    const url = links[index];
    let name = safeName(url, index + 1);
    if (usedNames.has(name)) {
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      name = `${base}-${index + 1}${ext}`;
    }
    usedNames.add(name);

    console.log(`[${index + 1}/${links.length}] ${kit.gameId}: ${url.href}`);
    const bytes = await fetchWithRetry(url.href, "bytes");
    const filePath = path.join(downloadDir, name);
    await fs.writeFile(filePath, bytes);
    files.push({
      file: `./downloads/${name}`,
      sourceUrl: url.href,
      bytes: bytes.length,
      sha256: sha256(bytes)
    });
  }

  const manifest = {
    schemaVersion: 1,
    gameId: kit.gameId,
    source: "official-cygames-fankit",
    sourcePage: kit.page,
    fetchedAt: new Date().toISOString(),
    fileCount: files.length,
    files
  };
  await fs.writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Downloaded ${files.length} official Fan Kit files for ${kit.gameId}.`);
}
