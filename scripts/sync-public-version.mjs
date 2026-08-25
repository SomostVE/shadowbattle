import fs from "node:fs/promises";

const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const version = packageJson.version;
const pages = [
  "index.html",
  "api/index.html",
  "test/index.html",
  "decks/index.html",
  "library/index.html"
];

for (const file of pages) {
  let source = await fs.readFile(file, "utf8");
  const next = source
    .replace(/\?v=\d+\.\d+\.\d+/g, `?v=${version}`)
    .replace(/>v\d+\.\d+\.\d+</g, `>v${version}<`);
  if (next !== source) {
    await fs.writeFile(file, next, "utf8");
    console.log(`Updated ${file} -> ${version}`);
  }
}
