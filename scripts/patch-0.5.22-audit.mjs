import fs from "node:fs";

const path = "src/core/rulesets/svwb/effect-resolver.js";
let text = fs.readFileSync(path, "utf8");
const from = "  const supportText = normalizeWorldsBeyondStructuralVariables(text);";
const to = "  const supportText = normalizeWorldsBeyondStructuralVariables(conditional.text);";
const first = text.indexOf(from);
if (first < 0) throw new Error("Missing Marlone structural normalization marker");
if (text.indexOf(from, first + from.length) >= 0) throw new Error("Marlone structural normalization marker is not unique");
text = `${text.slice(0, first)}${to}${text.slice(first + from.length)}`;
fs.writeFileSync(path, text);
