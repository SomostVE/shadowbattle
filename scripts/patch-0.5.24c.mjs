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
`const RANDOM_ENEMY_FOLLOWER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to\\\\s+" + NUMBER + "\\\\s+random enemy followers\\\\b", "gi");
const LIVE_NEUTRAL_HAND_RANDOM_DAMAGE = /\\bdeal damage to (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+) random enemy followers equal to the number of Neutral cards in your hand\\b/gi;`,
`const RANDOM_ENEMY_FOLLOWER_AND_LEADER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to\\\\s+" + NUMBER + "\\\\s+random enemy followers and the enemy leader\\\\b", "gi");
const RANDOM_ENEMY_FOLLOWER_DAMAGE = new RegExp("\\\\bdeal\\\\s+" + NUMBER + "\\\\s+damage to\\\\s+" + NUMBER + "\\\\s+random enemy followers\\\\b", "gi");
const LIVE_NEUTRAL_HAND_RANDOM_DAMAGE = /\\bdeal damage to (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+) random enemy followers equal to the number of Neutral cards in your hand\\b/gi;`,
"combined random damage constant");

replaceOnce(genericPath,
`  LIVE_HAND_SIZE_LEADER_HEAL,
  RANDOM_ENEMY_FOLLOWER_DAMAGE,`,
`  LIVE_HAND_SIZE_LEADER_HEAL,
  RANDOM_ENEMY_FOLLOWER_AND_LEADER_DAMAGE,
  RANDOM_ENEMY_FOLLOWER_DAMAGE,`,
"combined strip order");

const commandsPath = "src/core/rulesets/svwb/v6/effect-commands.js";
replaceOnce(commandsPath,
`  for (const match of value.matchAll(/\\bdeal\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+damage to\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+random enemy followers\\b/gi)) {
    indexed.push({
      index: match.index ?? 0,
      command: createWorldsBeyondRandomEnemyFollowerDamageCommand(playerIndex, numberWord(match[1]), numberWord(match[2]), sourceOptions)
    });
  }`,
`  for (const match of value.matchAll(/\\bdeal\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+damage to\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+random enemy followers\\b/gi)) {
    const amount = numberWord(match[1]);
    indexed.push({
      index: match.index ?? 0,
      command: createWorldsBeyondRandomEnemyFollowerDamageCommand(playerIndex, amount, numberWord(match[2]), sourceOptions)
    });
    const tail = value.slice((match.index ?? 0) + match[0].length);
    if (/^\\s+and the enemy leader\\b/i.test(tail)) {
      indexed.push({
        index: (match.index ?? 0) + match[0].length,
        command: createWorldsBeyondLeaderDamageCommand(playerIndex, 1 - Number(playerIndex), amount, sourceOptions)
      });
    }
  }`,
"combined command compilation");
