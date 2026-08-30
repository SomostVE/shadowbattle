const response = await fetch("https://raw.githubusercontent.com/SomostVE/beyond_codex/main/api/v1/cards.json", { cache: "no-store" });
if (!response.ok) throw new Error(`Codex fetch failed: ${response.status}`);
const cards = await response.json();
let count = 0;
for (const card of cards) {
  const text = String(card.text ?? "").replace(/\s+/g, " ");
  const match = text.match(/Super-Evolve:\s*([^]*?)(?=(?:Fanfare|Last Words|Strike|Evolve|Super-Evolve|Enhance|Accelerate|Crystallize|Engage|At the start of your turn|At the end of your turn):|$)/i);
  const section = match?.[1]?.trim() ?? "";
  if (!/\binstead\b/i.test(section)) continue;
  count += 1;
  console.log(`${card.name} (${card.id}) :: ${text}`);
}
console.log(`Super-Evolve sections containing instead: ${count}`);
