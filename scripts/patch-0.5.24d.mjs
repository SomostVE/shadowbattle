import fs from "node:fs";

function replaceOnce(path, before, after, label) {
  let source = fs.readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one marker, found ${count}`);
  source = source.replace(before, after);
  fs.writeFileSync(path, source);
}

const genericPath = "src/core/rulesets/svwb/generic-effects.js";
replaceOnce(genericPath,
`const RANDOM_ENEMY_FOLLOWER_AND_LEADER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to\\\\s+" + NUMBER + "\\\\s+random enemy followers and the enemy leader\\\\b", "gi");
const RANDOM_ENEMY_FOLLOWER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to\\\\s+" + NUMBER + "\\\\s+random enemy followers\\\\b", "gi");`,
`const RANDOM_ENEMY_FOLLOWER_AND_LEADER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to\\\\s+" + NUMBER + "\\\\s+random enemy followers and the enemy leader\\\\b", "gi");
const RANDOM_ENEMY_FOLLOWER_AND_SELF_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to\\\\s+" + NUMBER + "\\\\s+random enemy followers and\\\\s+" + NUMBER + "\\\\s+damage to your leader\\\\b", "gi");
const RANDOM_ENEMY_FOLLOWER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to\\\\s+" + NUMBER + "\\\\s+random enemy followers\\\\b", "gi");`,
"Unleashed structural grammar");

replaceOnce(genericPath,
`  RANDOM_ENEMY_FOLLOWER_AND_LEADER_DAMAGE,
  RANDOM_ENEMY_FOLLOWER_DAMAGE,`,
`  RANDOM_ENEMY_FOLLOWER_AND_LEADER_DAMAGE,
  RANDOM_ENEMY_FOLLOWER_AND_SELF_DAMAGE,
  RANDOM_ENEMY_FOLLOWER_DAMAGE,`,
"Unleashed strip order");

const commandsPath = "src/core/rulesets/svwb/v6/effect-commands.js";
replaceOnce(commandsPath,
`    const tail = value.slice((match.index ?? 0) + match[0].length);
    if (/^\\s+and the enemy leader\\b/i.test(tail)) {
      indexed.push({
        index: (match.index ?? 0) + match[0].length,
        command: createWorldsBeyondLeaderDamageCommand(playerIndex, 1 - Number(playerIndex), amount, sourceOptions)
      });
    }
  }`,
`    const tail = value.slice((match.index ?? 0) + match[0].length);
    if (/^\\s+and the enemy leader\\b/i.test(tail)) {
      indexed.push({
        index: (match.index ?? 0) + match[0].length,
        command: createWorldsBeyondLeaderDamageCommand(playerIndex, 1 - Number(playerIndex), amount, sourceOptions)
      });
    }
    const selfDamage = tail.match(/^\\s+and\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+damage to your leader\\b/i);
    if (selfDamage) {
      indexed.push({
        index: (match.index ?? 0) + match[0].length,
        command: createWorldsBeyondLeaderDamageCommand(playerIndex, playerIndex, numberWord(selfDamage[1]), sourceOptions)
      });
    }
  }`,
"Unleashed ordered self damage");
