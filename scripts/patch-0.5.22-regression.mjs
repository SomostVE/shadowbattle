import fs from "node:fs";

const path = "src/core/rulesets/svwb/effect-resolver.js";
let text = fs.readFileSync(path, "utf8");
const from = "  const supportText = normalizeWorldsBeyondStructuralVariables(conditional.text);";
const to = "  const supportText = /\\bX is the number of enemy followers on the field minus the number of allied followers on the field\\b/i.test(conditional.text)\n    ? normalizeWorldsBeyondStructuralVariables(conditional.text)\n    : text;";
const first = text.indexOf(from);
if (first < 0) throw new Error("Missing structural support marker");
if (text.indexOf(from, first + from.length) >= 0) throw new Error("Structural support marker is not unique");
text = `${text.slice(0, first)}${to}${text.slice(first + from.length)}`;
fs.writeFileSync(path, text);
