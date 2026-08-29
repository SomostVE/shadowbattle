import fs from "node:fs";

const path = "src/core/rulesets/svwb/generic-effects.js";
let text = fs.readFileSync(path, "utf8");
const needle = String.raw`random enemy followers?\b`;
const matches = text.split(needle).length - 1;
if (matches !== 2) throw new Error(`Expected exactly 2 random multi-destroy grammar markers, found ${matches}`);
text = text.split(needle).join(String.raw`random enemy followers\b`);
fs.writeFileSync(path, text);
console.log("Narrowed random multi-destroy grammar to plural followers.");
