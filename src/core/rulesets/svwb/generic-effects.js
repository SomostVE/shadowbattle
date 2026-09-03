import { BATTLE_EVENT } from "../../battle-events.js";
import { resolveEffectCommands } from "../../effect-commands.js";
import { currentAttack, currentDefense, currentMaxDefense, effectiveCardType } from "./runtime-card-state.js";
import {
  LIVE_ALL_FOLLOWER_COUNT_DAMAGE,
  resolveWorldsBeyondAllFollowersCountDamage
} from "./all-followers-count-x.js";
import {
  grantWorldsBeyondAttackLimit,
  grantWorldsBeyondKeyword,
  hasWorldsBeyondKeyword,
  refreshWorldsBeyondAttackReadiness
} from "./combat-readiness.js";
import { addWorldsBeyondGeneratedCard, addWorldsBeyondGeneratedCardsToDeck } from "./generated-cards.js";
import { LIVE_HAND_SIZE_LEADER_HEAL } from "./post-draw-hand-x.js";
import { createWorldsBeyondLeaderHealCommand } from "./v6/effect-commands.js";

const NUMBER = "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)";
const CARD_NAME = "([A-Z][A-Za-z0-9'’&,:\\- ]+?)";
const ALLIED_GOLEM_AREA_DAMAGE = /\bdeal damage to all enemy followers equal to the number of allied Golem followers on the field\b/gi;
const RANDOM_ENEMY_FOLLOWER_AND_LEADER_DAMAGE = new RegExp("\\bdeal\\s+" + NUMBER + "\\s+damage to\\s+" + NUMBER + "\\s+random enemy followers and the enemy leader\\b", "gi");
const RANDOM_ENEMY_FOLLOWER_AND_SELF_DAMAGE = new RegExp("\\bdeal\\s+" + NUMBER + "\\s+damage to\\s+" + NUMBER + "\\s+random enemy followers and\\s+" + NUMBER + "\\s+damage to your leader\\b", "gi");
const RANDOM_ENEMY_FOLLOWER_DAMAGE = new RegExp("\\bdeal\\s+" + NUMBER + "\\s+damage to\\s+" + NUMBER + "\\s+random enemy followers\\b", "gi");
const ALL_OTHER_FOLLOWER_DAMAGE = new RegExp("\\bdeal\\s+" + NUMBER + "\\s+damage to all other followers\\b", "gi");
const OPPOSING_FOLLOWER_DAMAGE = new RegExp("\\bdeal\\s+" + NUMBER + "\\s+damage to the opposing follower\\b", "gi");
const DAMAGED_OPPOSING_FOLLOWER_DESTROY = /\bif the opposing follower is damaged,?\s*destroy it\b/gi;
const OPPOSING_FOLLOWER_DESTROY = /\bdestroy the opposing follower\b/gi;
const LIVE_NEUTRAL_HAND_RANDOM_DAMAGE = /\bdeal damage to (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) random enemy followers equal to the number of Neutral cards in your hand\b/gi;
const ADD_TO_DECK_SINGLE = new RegExp(`\\badd\\s+(?:a|an|one)\\s+${CARD_NAME}\\s+to your deck\\s*\\.?`, "gi");
const ADD_TO_DECK_COPIES = new RegExp(`\\badd\\s+${NUMBER}\\s+copies of\\s+${CARD_NAME}\\s+to your deck\\s*\\.?`, "gi");
const SELF_ATTACK_LIMIT_GRANT = /\bgive (?:this follower|it)\s+["“]?Can attack\s+(\d+)\s+times per turn\.?["”]?/gi;
const LEFTMOST_ALLIED_ATTACK_LIMIT_GRANT = /\bgive the leftmost allied (?:(Neutral|[A-Za-z]+craft)\s+)?follower(?: on the field)?\s+["“]?Can attack\s+(\d+)\s+times per turn\.?["”]?/gi;
const RANDOM_ALLIED_FOLLOWER_BUFF = /\bgive a random allied follower(?: on the field)?\s+\+(\d+)\s*\/\s*\+(\d+)\b/gi;
const RANDOM_NAMED_ALLIED_FOLLOWER_BUFF = /\bgive a random allied ([A-Z][A-Za-z0-9'’&,: \-]+?) on the field\s+\+(\d+)\s*\/\s*\+(\d+)\b/gi;
const RANDOM_SUPER_EVOLVED_ALLIED_FOLLOWER_BUFF = /\bgive a random super-evolved allied follower(?: on the field)?\s+\+(\d+)\s*\/\s*\+(\d+)\b/gi;
const EVOLVE_ALL_UNEVOLVED_ALLIED = /\bevolve all unevolved allied followers(?: on the field)?\b/gi;
const EVOLVE_RANDOM_UNEVOLVED_ALLIED = /\bevolve\s+(another|a|an)\s+random unevolved allied follower(?: on the field)?(?: with Ward)?(?: with a base cost of (\d+) or more)?(?: that didn['’]t attack this turn)?(?:\s+and give it\s+\+(\d+)\s*\/\s*\+(\d+))?\b/gi;
const ADVANCE_SPECIFIC_CREST = new RegExp(`\\badvance the count of your Crest\\s*:?\\s*${CARD_NAME}\\s+by\\s+${NUMBER}\\b`, "gi");
const DELAY_SPECIFIC_CREST = new RegExp(`\\bdelay the count of your Crest\\s*:?\\s*${CARD_NAME}\\s+by\\s+${NUMBER}\\b`, "gi");
const DELAY_ALL_CRESTS = new RegExp(`\\bdelay the counts of all your crests by\\s+${NUMBER}\\b`, "gi");
const ADVANCE_NAMED_ALLIED_COUNTDOWNS = new RegExp(`\\badvance the counts of all allied copies of\\s+${CARD_NAME}\\s+on the field by\\s+${NUMBER}\\b`, "gi");
const DELAY_RANDOM_NAMED_ALLIED_COUNTDOWN = new RegExp(`\\bdelay the count of a random allied\\s+${CARD_NAME}\\s+on the field by\\s+${NUMBER}\\b`, "gi");
const DELAY_SELF_AMULET_COUNTDOWN = new RegExp(`\\bdelay the count of this amulet by\\s+${NUMBER}\\b`, "gi");

const GENERIC_EFFECT_PATTERNS = Object.freeze([
  new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage split between all enemy followers\\b`, "gi"),
  new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage split between all enemies\\b`, "gi"),
  new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage to your leader\\b`, "gi"),
  new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage to both leaders\\b`, "gi"),
  ALLIED_GOLEM_AREA_DAMAGE,
  LIVE_ALL_FOLLOWER_COUNT_DAMAGE,
  LIVE_HAND_SIZE_LEADER_HEAL,
  RANDOM_ENEMY_FOLLOWER_AND_LEADER_DAMAGE,
  RANDOM_ENEMY_FOLLOWER_AND_SELF_DAMAGE,
  RANDOM_ENEMY_FOLLOWER_DAMAGE,
  ALL_OTHER_FOLLOWER_DAMAGE,
  OPPOSING_FOLLOWER_DAMAGE,
  DAMAGED_OPPOSING_FOLLOWER_DESTROY,
  OPPOSING_FOLLOWER_DESTROY,
  LIVE_NEUTRAL_HAND_RANDOM_DAMAGE,
  ADVANCE_SPECIFIC_CREST,
  DELAY_SPECIFIC_CREST,
  DELAY_ALL_CRESTS,
  ADVANCE_NAMED_ALLIED_COUNTDOWNS,
  DELAY_RANDOM_NAMED_ALLIED_COUNTDOWN,
  DELAY_SELF_AMULET_COUNTDOWN,
  RANDOM_SUPER_EVOLVED_ALLIED_FOLLOWER_BUFF,
  RANDOM_NAMED_ALLIED_FOLLOWER_BUFF,
  RANDOM_ALLIED_FOLLOWER_BUFF,
  /\bgive all (?:other )?allied followers(?: on the field)?\s+\+\d+\s*\/\s*\+\d+\b/gi,
  /\bgive all (?:other )?allied [A-Za-z][A-Za-z0-9'’\-]* followers(?: on the field)?\s+\+\d+\s*\/\s*\+\d+\b/gi,
  /\bgive all (?:other )?allied copies of .+? on the field\s+\+\d+\s*\/\s*\+\d+\b/gi,
  /\bgive all (?:other )?allied followers(?: on the field)?\s+(?:Ward|Bane|Barrier|Rush|Storm)\b/gi,
  /\bgive all (?:other )?allied [A-Za-z][A-Za-z0-9'’\-]* followers(?: on the field)?\s+(?:Ward|Bane|Barrier|Rush|Storm)\b/gi,
  /\bgive all (?:other )?allied copies of .+? on the field\s+(?:Ward|Bane|Barrier|Rush|Storm)\b/gi,
  /\bgive all enemy followers(?: on the field)?\s+-\d+\s*\/\s*-\d+\b/gi,
  new RegExp(`\\bdestroy\\s+${NUMBER}\\s+random enemy followers\\b`, "gi"),
  /\bdestroy all other allied cards(?: on the field)?\b/gi,
  /\bdestroy all damaged enemy followers\b/gi,
  new RegExp(`\\bgain\\s+${NUMBER}\\s+shadows?\\b`, "gi"),
  new RegExp(`\\bgain\\s+${NUMBER}\\s+max play points?\\b`, "gi"),
  new RegExp(`\\brecover\\s+${NUMBER}\\s+evolution points?\\b`, "gi"),
  new RegExp(`\\bdraw\\s+${NUMBER}\\s+(?:Neutral|[a-z]+craft)\\s+followers?\\s*\\.\\s*recover\\s+${NUMBER}\\s+play points?\\b`, "gi"),
  ADD_TO_DECK_COPIES,
  ADD_TO_DECK_SINGLE,
  new RegExp(`\\badd\\s+${NUMBER}\\s+copies of\\s+[^.]+?\\s+to your hand\\s*\\.?\\s*$`, "gi"),
  new RegExp(`^\\s*add\\s+(?:a|an|one)\\s+${CARD_NAME}\\s+to your hand\\s*\\.?`, "gi"),
  new RegExp(`[.!?]\\s+add\\s+(?:a|an|one)\\s+${CARD_NAME}\\s+to your hand\\s*\\.?\\s*$`, "gi"),
  new RegExp(`\\bdraw\\s+${NUMBER}\\s+amulets?\\s*\\.?\\s*$`, "gi"),
  new RegExp(`\\bdraw\\s+${NUMBER}\\s+spells?\\s*\\.?\\s*$`, "gi"),
  EVOLVE_ALL_UNEVOLVED_ALLIED,
  EVOLVE_RANDOM_UNEVOLVED_ALLIED,
  /\bsuper[- ]evolve this follower\b/gi,
  /(?<!super[- ])\bevolve this follower\b/gi,
  /\bgive (?:this follower|it)\s+Barrier\b/gi,
  LEFTMOST_ALLIED_ATTACK_LIMIT_GRANT,
  SELF_ATTACK_LIMIT_GRANT
]);

export function hasWorldsBeyondDrawBeforeGeneratedDeckInsertion(text) {
  const value = String(text ?? "");
  const drawIndex = value.search(/\bdraw\b/i);
  if (drawIndex < 0) return false;
  for (const pattern of [ADD_TO_DECK_COPIES, ADD_TO_DECK_SINGLE]) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      if ((match.index ?? -1) > drawIndex) return true;
    }
  }
  return false;
}

export function stripWorldsBeyondGenericEffectText(text) {
  let inspect = String(text ?? "");
  for (const pattern of GENERIC_EFFECT_PATTERNS) {
    pattern.lastIndex = 0;
    inspect = inspect.replace(pattern, " ");
  }
  return inspect;
}

export function resolveWorldsBeyondGenericEffects(session, {
  text,
  playerIndex,
  source,
  destroyFollower,
  destroyCard,
  gainShadows,
  opposingFollowerInstanceId = null
} = {}) {
  const value = String(text ?? "");
  const effects = [];

  collect(value, new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage to your leader\\b`, "gi"), match => ({
    kind: "self-leader-damage",
    amount: numberWord(match[1])
  }), effects);
  collect(value, new RegExp(`\\bdeal\\s+${NUMBER}\\s+damage to both leaders\\b`, "gi"), match => ({
    kind: "both-leaders-damage",
    amount: numberWord(match[1])
  }), effects);
  collect(value, ALL_OTHER_FOLLOWER_DAMAGE, match => ({
    kind: "all-other-follower-damage",
    amount: numberWord(match[1])
  }), effects);
  collect(value, OPPOSING_FOLLOWER_DAMAGE, match => ({
    kind: "opposing-follower-damage",
    amount: numberWord(match[1])
  }), effects);
  collect(value, DAMAGED_OPPOSING_FOLLOWER_DESTROY, () => ({
    kind: "damaged-opposing-follower-destroy"
  }), effects);
  collect(value, OPPOSING_FOLLOWER_DESTROY, () => ({
    kind: "opposing-follower-destroy"
  }), effects);
  collect(value, ALLIED_GOLEM_AREA_DAMAGE, () => ({
    kind: "enemy-area-damage-by-allied-golem-count"
  }), effects);
  collect(value, LIVE_ALL_FOLLOWER_COUNT_DAMAGE, () => ({
    kind: "all-followers-damage-by-live-count"
  }), effects);
  collect(value, LIVE_HAND_SIZE_LEADER_HEAL, () => ({
    kind: "leader-heal-by-live-hand-size"
  }), effects);
  collect(value, ADVANCE_SPECIFIC_CREST, match => ({
    kind: "crest-countdown",
    direction: "advance",
    crestName: match[1].trim(),
    amount: numberWord(match[2])
  }), effects);
  collect(value, DELAY_SPECIFIC_CREST, match => ({
    kind: "crest-countdown",
    direction: "delay",
    crestName: match[1].trim(),
    amount: numberWord(match[2])
  }), effects);
  collect(value, DELAY_ALL_CRESTS, match => ({
    kind: "delay-all-crests",
    amount: numberWord(match[1])
  }), effects);
  collect(value, ADVANCE_NAMED_ALLIED_COUNTDOWNS, match => ({
    kind: "advance-named-allied-countdowns",
    cardName: match[1].trim(),
    amount: numberWord(match[2])
  }), effects);
  collect(value, DELAY_RANDOM_NAMED_ALLIED_COUNTDOWN, match => ({
    kind: "delay-random-named-allied-countdown",
    cardName: match[1].trim(),
    amount: numberWord(match[2])
  }), effects);
  collect(value, DELAY_SELF_AMULET_COUNTDOWN, match => ({
    kind: "delay-self-amulet-countdown",
    amount: numberWord(match[1])
  }), effects);
  collect(value, RANDOM_SUPER_EVOLVED_ALLIED_FOLLOWER_BUFF, match => ({
    kind: "random-allied-buff",
    attack: Number(match[1]) || 0,
    defense: Number(match[2]) || 0,
    requireSuperEvolved: true
  }), effects);
  collect(value, RANDOM_NAMED_ALLIED_FOLLOWER_BUFF, match => ({
    kind: "random-allied-buff",
    attack: Number(match[2]) || 0,
    defense: Number(match[3]) || 0,
    requiredName: match[1].trim()
  }), effects);
  collect(value, RANDOM_ALLIED_FOLLOWER_BUFF, match => ({
    kind: "random-allied-buff",
    attack: Number(match[1]) || 0,
    defense: Number(match[2]) || 0
  }), effects);
  collect(value, /\bgive all (other )?allied followers(?: on the field)?\s+\+(\d+)\s*\/\s*\+(\d+)\b/gi, match => ({
    kind: "allied-buff",
    attack: Number(match[2]) || 0,
    defense: Number(match[3]) || 0,
    excludeSource: Boolean(match[1])
  }), effects);
  collect(value, /\bgive all (other )?allied ([A-Za-z][A-Za-z0-9'’\-]*) followers(?: on the field)?\s+\+(\d+)\s*\/\s*\+(\d+)\b/gi, match => ({
    kind: "allied-buff",
    attack: Number(match[3]) || 0,
    defense: Number(match[4]) || 0,
    excludeSource: Boolean(match[1]),
    requiredClass: /craft$/i.test(match[2]) ? match[2] : null,
    requiredTrait: /craft$/i.test(match[2]) ? null : match[2]
  }), effects);
  collect(value, /\bgive all (other )?allied copies of (.+?) on the field\s+\+(\d+)\s*\/\s*\+(\d+)\b/gi, match => ({
    kind: "allied-buff",
    attack: Number(match[3]) || 0,
    defense: Number(match[4]) || 0,
    excludeSource: Boolean(match[1]),
    requiredName: match[2].trim()
  }), effects);
  collect(value, /\bgive all (other )?allied followers(?: on the field)?\s+(Ward|Bane|Barrier|Rush|Storm)\b/gi, match => ({
    kind: "allied-keyword",
    keyword: match[2],
    excludeSource: Boolean(match[1])
  }), effects);
  collect(value, /\bgive all (other )?allied ([A-Za-z][A-Za-z0-9'’\-]*) followers(?: on the field)?\s+(Ward|Bane|Barrier|Rush|Storm)\b/gi, match => ({
    kind: "allied-keyword",
    keyword: match[3],
    excludeSource: Boolean(match[1]),
    requiredClass: /craft$/i.test(match[2]) ? match[2] : null,
    requiredTrait: /craft$/i.test(match[2]) ? null : match[2]
  }), effects);
  collect(value, /\bgive all (other )?allied copies of (.+?) on the field\s+(Ward|Bane|Barrier|Rush|Storm)\b/gi, match => ({
    kind: "allied-keyword",
    keyword: match[3],
    excludeSource: Boolean(match[1]),
    requiredName: match[2].trim()
  }), effects);
  collect(value, /\bgive all enemy followers(?: on the field)?\s+-(\d+)\s*\/\s*-(\d+)\b/gi, match => ({
    kind: "enemy-debuff",
    attack: Number(match[1]) || 0,
    defense: Number(match[2]) || 0
  }), effects);
  collect(value, new RegExp(`\\bdestroy\\s+${NUMBER}\\s+random enemy followers\\b`, "gi"), match => ({
    kind: "destroy-random-enemy-followers",
    count: numberWord(match[1])
  }), effects);
  collect(value, /\bdestroy all other allied cards(?: on the field)?\b/gi, () => ({
    kind: "destroy-other-allied-cards"
  }), effects);
  collect(value, /\bdestroy all damaged enemy followers\b/gi, () => ({
    kind: "destroy-damaged-enemies"
  }), effects);
  collect(value, new RegExp(`\\bgain\\s+${NUMBER}\\s+shadows?\\b`, "gi"), match => ({
    kind: "gain-shadows",
    amount: numberWord(match[1])
  }), effects);
  collect(value, new RegExp(`\\bgain\\s+${NUMBER}\\s+max play points?\\b`, "gi"), match => ({
    kind: "gain-max-pp",
    amount: numberWord(match[1])
  }), effects);
  collect(value, new RegExp(`\\brecover\\s+${NUMBER}\\s+evolution points?\\b`, "gi"), match => ({
    kind: "recover-evolution-points",
    amount: numberWord(match[1])
  }), effects);
  collect(value, ADD_TO_DECK_COPIES, match => ({
    kind: "add-to-deck",
    count: numberWord(match[1]),
    cardName: match[2].trim()
  }), effects);
  collect(value, ADD_TO_DECK_SINGLE, match => ({
    kind: "add-to-deck",
    count: 1,
    cardName: match[1].trim()
  }), effects);
  collect(value, new RegExp(`[.!?]\\s+add\\s+(?:a|an|one)\\s+${CARD_NAME}\\s+to your hand\\s*\\.?\\s*$`, "gi"), match => ({
    kind: "add-to-hand",
    cardName: match[1].trim()
  }), effects);
  collect(value, EVOLVE_ALL_UNEVOLVED_ALLIED, () => ({
    kind: "ability-evolve-all-allied"
  }), effects);
  collect(value, EVOLVE_RANDOM_UNEVOLVED_ALLIED, match => ({
    kind: "ability-evolve-random-allied",
    excludeSource: /^evolve\s+another\b/i.test(match[0]),
    requireWard: /\bwith Ward\b/i.test(match[0]),
    minBaseCost: match[2] == null ? null : Math.max(0, Number(match[2]) || 0),
    requireNotAttacked: /didn['’]t attack this turn/i.test(match[0]),
    attack: Number(match[3]) || 0,
    defense: Number(match[4]) || 0
  }), effects);
  collect(value, /\bsuper[- ]evolve this follower\b/gi, () => ({
    kind: "ability-super-evolve"
  }), effects);
  collect(value, /(?<!super[- ])\bevolve this follower\b/gi, () => ({
    kind: "ability-evolve"
  }), effects);
  collect(value, LEFTMOST_ALLIED_ATTACK_LIMIT_GRANT, match => ({
    kind: "leftmost-allied-attack-limit",
    requiredClass: match[1] ?? null,
    amount: Number(match[2]) || 1
  }), effects);
  collect(value, SELF_ATTACK_LIMIT_GRANT, match => ({
    kind: "self-attack-limit",
    amount: Number(match[1]) || 1
  }), effects);
  collect(value, /\bgive (?:this follower|it)\s+Barrier\b/gi, () => ({
    kind: "self-barrier"
  }), effects);

  effects.sort((left, right) => left.index - right.index);
  let applied = false;
  for (const effect of effects) {
    if (session.phase === "ended") break;
    if (effect.kind === "self-leader-damage") {
      applied = session.damageLeader(playerIndex, effect.amount, { actor: playerIndex, source, reason: "ability" }) > 0 || applied;
      continue;
    }
    if (effect.kind === "both-leaders-damage") {
      applied = damageLeadersSimultaneously(session, [playerIndex, 1 - playerIndex], effect.amount, { actor: playerIndex, source }) || applied;
      continue;
    }
    if (effect.kind === "enemy-area-damage-by-allied-golem-count") {
      applied = damageEnemyFollowersByAlliedGolemCount(session, playerIndex, source, destroyFollower) || applied;
      continue;
    }
    if (effect.kind === "all-followers-damage-by-live-count") {
      applied = resolveWorldsBeyondAllFollowersCountDamage(session, {
        playerIndex,
        source,
        destroyFollower
      }) || applied;
      continue;
    }
    if (effect.kind === "leader-heal-by-live-hand-size") {
      applied = healLeaderByLiveHandSize(session, playerIndex, source) || applied;
      continue;
    }
    if (effect.kind === "all-other-follower-damage") {
      applied = damageAllOtherFollowers(session, playerIndex, source, effect.amount, destroyFollower) || applied;
      continue;
    }
    if (effect.kind === "opposing-follower-damage") {
      applied = damageOpposingFollower(session, playerIndex, source, opposingFollowerInstanceId, effect.amount, destroyFollower) || applied;
      continue;
    }
    if (effect.kind === "damaged-opposing-follower-destroy") {
      applied = destroyDamagedOpposingFollower(session, playerIndex, source, opposingFollowerInstanceId, destroyFollower) || applied;
      continue;
    }
    if (effect.kind === "opposing-follower-destroy") {
      applied = destroyOpposingFollower(session, playerIndex, source, opposingFollowerInstanceId, destroyFollower) || applied;
      continue;
    }
    if (effect.kind === "random-allied-buff") {
      applied = buffRandomAlliedFollower(session, playerIndex, source, effect) || applied;
      continue;
    }
    if (effect.kind === "allied-buff") {
      applied = buffAlliedFollowers(session, playerIndex, source, effect) || applied;
      continue;
    }
    if (effect.kind === "allied-keyword") {
      applied = grantAlliedKeyword(session, playerIndex, source, effect) || applied;
      continue;
    }
    if (effect.kind === "enemy-debuff") {
      applied = debuffEnemyFollowers(session, playerIndex, source, effect, destroyFollower) || applied;
      continue;
    }
    if (effect.kind === "destroy-random-enemy-followers") {
      applied = destroyRandomEnemyFollowers(session, playerIndex, source, effect.count, destroyFollower) || applied;
      continue;
    }
    if (effect.kind === "destroy-other-allied-cards") {
      applied = destroyOtherAlliedCards(session, playerIndex, source, destroyCard) || applied;
      continue;
    }
    if (effect.kind === "destroy-damaged-enemies") {
      applied = destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) || applied;
      continue;
    }
    if (effect.kind === "crest-countdown") {
      applied = adjustSpecificCrestCountdown(session, playerIndex, effect) || applied;
      continue;
    }
    if (effect.kind === "delay-all-crests") {
      applied = delayAllCrestCountdowns(session, playerIndex, effect.amount) || applied;
      continue;
    }
    if (effect.kind === "advance-named-allied-countdowns") {
      applied = advanceNamedAlliedCountdowns(session, playerIndex, source, effect) || applied;
      continue;
    }
    if (effect.kind === "delay-random-named-allied-countdown") {
      applied = delayRandomNamedAlliedCountdown(session, playerIndex, source, effect) || applied;
      continue;
    }
    if (effect.kind === "delay-self-amulet-countdown") {
      applied = delaySelfAmuletCountdown(session, playerIndex, source, effect.amount) || applied;
      continue;
    }
    if (effect.kind === "gain-shadows") {
      if (effect.amount > 0) {
        gainShadows?.(session, playerIndex, effect.amount);
        applied = true;
      }
      continue;
    }
    if (effect.kind === "gain-max-pp") {
      applied = gainMaximumPlayPoints(session, playerIndex, effect.amount) || applied;
      continue;
    }
    if (effect.kind === "recover-evolution-points") {
      applied = recoverEvolutionPoints(session, playerIndex, effect.amount) || applied;
      continue;
    }
    if (effect.kind === "add-to-deck") {
      applied = addGeneratedCardsToDeck(session, playerIndex, effect.cardName, effect.count) || applied;
      continue;
    }
    if (effect.kind === "add-to-hand") {
      applied = addGeneratedCardToHand(session, playerIndex, effect.cardName) || applied;
      continue;
    }
    if (effect.kind === "ability-evolve-all-allied") {
      applied = evolveAllAlliedFollowersByAbility(session, playerIndex) || applied;
      continue;
    }
    if (effect.kind === "ability-evolve-random-allied") {
      applied = evolveRandomAlliedFollowerByAbility(session, playerIndex, source, effect) || applied;
      continue;
    }
    if (effect.kind === "ability-super-evolve") {
      applied = Boolean(session.ruleset?.superEvolveFollowerByAbility?.(session, playerIndex, source)) || applied;
      continue;
    }
    if (effect.kind === "ability-evolve") {
      applied = Boolean(session.ruleset?.evolveFollowerByAbility?.(session, playerIndex, source)) || applied;
      continue;
    }
    if (effect.kind === "leftmost-allied-attack-limit") {
      applied = grantLeftmostAlliedAttackLimit(session, playerIndex, effect) || applied;
      continue;
    }
    if (effect.kind === "self-attack-limit") {
      applied = grantSelfAttackLimit(session, playerIndex, source, effect.amount) || applied;
      continue;
    }
    if (effect.kind === "self-barrier") {
      applied = grantSelfBarrier(session, playerIndex, source) || applied;
    }
  }
  return applied;
}

function collect(text, pattern, factory, effects) {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) effects.push({ index: match.index ?? 0, ...factory(match) });
}

export function resolveWorldsBeyondRandomEnemyFollowerDamage(session, {
  playerIndex,
  source,
  amount,
  count,
  destroyFollower
} = {}) {
  const enemyIndex = 1 - playerIndex;
  const candidates = session.getPlayer(enemyIndex).board
    .filter(unit => effectiveCardType(unit) === "follower")
    .map(unit => unit.instanceId);
  const targetIds = [];
  let remaining = Math.min(Math.max(0, Number(count) || 0), candidates.length);
  while (remaining > 0 && candidates.length) {
    const index = Math.floor(session.rng() * candidates.length);
    targetIds.push(candidates.splice(index, 1)[0]);
    remaining -= 1;
  }

  let applied = false;
  const damage = Math.max(0, Number(amount) || 0);
  for (const instanceId of targetIds) {
    const live = session.findBoardCard(enemyIndex, instanceId);
    if (!live || session.phase === "ended") continue;
    session.damageFollower(enemyIndex, live.instanceId, damage, {
      actor: playerIndex,
      source,
      reason: "ability",
      resolveDeath: false
    });
    applied = true;
    const damaged = session.findBoardCard(enemyIndex, instanceId);
    if (!damaged || currentDefense(damaged) > 0) continue;
    destroyFollower?.(session, enemyIndex, damaged.instanceId, {
      actor: playerIndex,
      source,
      reason: "ability",
      byAbility: true
    });
  }
  return applied;
}

export function resolveWorldsBeyondSplitEnemyFollowerDamage(session, {
  playerIndex,
  source,
  amount,
  destroyFollower
} = {}) {
  let remaining = Math.max(0, Number(amount) || 0);
  if (!remaining) return false;
  const enemyIndex = 1 - playerIndex;
  const targetIds = session.getPlayer(enemyIndex).board
    .filter(unit => effectiveCardType(unit) === "follower")
    .map(unit => unit.instanceId);
  let applied = false;

  for (const instanceId of targetIds) {
    if (remaining <= 0 || session.phase === "ended") break;
    const live = session.findBoardCard(enemyIndex, instanceId);
    if (!live) continue;
    const allocation = Math.min(remaining, Math.max(0, currentDefense(live)));
    if (!allocation) continue;
    remaining -= allocation;
    session.damageFollower(enemyIndex, live.instanceId, allocation, {
      actor: playerIndex,
      source,
      reason: "ability",
      resolveDeath: false
    });
    applied = true;
    const damaged = session.findBoardCard(enemyIndex, instanceId);
    if (!damaged || currentDefense(damaged) > 0) continue;
    destroyFollower?.(session, enemyIndex, damaged.instanceId, {
      actor: playerIndex,
      source,
      reason: "ability",
      byAbility: true
    });
  }
  return applied;
}

export function resolveWorldsBeyondSplitAllEnemiesDamage(session, {
  playerIndex,
  source = null,
  amount,
  destroyFollower,
  reason = "ability"
} = {}) {
  let remaining = Math.max(0, Number(amount) || 0);
  if (!remaining || session.phase === "ended") return false;
  const enemyIndex = 1 - playerIndex;
  let applied = false;

  while (remaining > 0 && session.phase !== "ended") {
    const followers = session.getPlayer(enemyIndex).board.filter(unit => effectiveCardType(unit) === "follower");
    const pick = Math.floor(session.rng() * (followers.length + 1));
    if (pick >= followers.length) {
      session.damageLeader(enemyIndex, 1, { actor: playerIndex, source, reason });
      applied = true;
    } else {
      const target = followers[pick];
      session.damageFollower(enemyIndex, target.instanceId, 1, {
        actor: playerIndex,
        source,
        reason,
        resolveDeath: false
      });
      applied = true;
      const damaged = session.findBoardCard(enemyIndex, target.instanceId);
      if (damaged && currentDefense(damaged) <= 0) {
        destroyFollower?.(session, enemyIndex, damaged.instanceId, {
          actor: playerIndex,
          source,
          reason,
          byAbility: true
        });
      }
    }
    remaining -= 1;
  }
  return applied;
}

function damageOpposingFollower(session, playerIndex, source, instanceId, amount, destroyFollower) {
  if (!instanceId) return false;
  const enemyIndex = 1 - playerIndex;
  const target = session.findBoardCard(enemyIndex, instanceId);
  if (!target || effectiveCardType(target) !== "follower") return false;
  const damage = Math.max(0, Number(amount) || 0);
  session.damageFollower(enemyIndex, target.instanceId, damage, {
    actor: playerIndex,
    source,
    reason: "ability",
    resolveDeath: false
  });
  const live = session.findBoardCard(enemyIndex, target.instanceId);
  if (live && currentDefense(live) <= 0) {
    destroyFollower?.(session, enemyIndex, live.instanceId, {
      actor: playerIndex,
      source,
      reason: "ability",
      byAbility: true
    });
  }
  return true;
}

function destroyDamagedOpposingFollower(session, playerIndex, source, instanceId, destroyFollower) {
  if (!instanceId) return false;
  const enemyIndex = 1 - playerIndex;
  const target = session.findBoardCard(enemyIndex, instanceId);
  if (!target || effectiveCardType(target) !== "follower") return false;
  if (currentDefense(target) >= currentMaxDefense(target)) return false;
  return Boolean(destroyFollower?.(session, enemyIndex, target.instanceId, {
    actor: playerIndex,
    source,
    reason: "ability",
    byAbility: true,
    abilityDestroy: true
  }));
}

function destroyOpposingFollower(session, playerIndex, source, instanceId, destroyFollower) {
  if (!instanceId) return false;
  const enemyIndex = 1 - playerIndex;
  const target = session.findBoardCard(enemyIndex, instanceId);
  if (!target || effectiveCardType(target) !== "follower") return false;
  return Boolean(destroyFollower?.(session, enemyIndex, target.instanceId, {
    actor: playerIndex,
    source,
    reason: "ability",
    byAbility: true,
    abilityDestroy: true
  }));
}

function damageAllOtherFollowers(session, playerIndex, source, amount, destroyFollower) {
  const damage = Math.max(0, Number(amount) || 0);
  if (!damage) return false;
  const sourceInstanceId = source?.instanceId ?? null;
  const targets = [];
  for (const owner of [0, 1]) {
    for (const unit of session.getPlayer(owner).board) {
      if (effectiveCardType(unit) !== "follower" || unit.instanceId === sourceInstanceId) continue;
      targets.push({ owner, instanceId: unit.instanceId });
    }
  }

  let applied = false;
  for (const target of targets) {
    const live = session.findBoardCard(target.owner, target.instanceId);
    if (!live) continue;
    session.damageFollower(target.owner, live.instanceId, damage, {
      actor: playerIndex,
      source,
      reason: "ability",
      resolveDeath: false
    });
    applied = true;
  }

  for (const target of targets) {
    const damaged = session.findBoardCard(target.owner, target.instanceId);
    if (!damaged || currentDefense(damaged) > 0) continue;
    destroyFollower?.(session, target.owner, damaged.instanceId, {
      actor: playerIndex,
      source,
      reason: "ability",
      byAbility: true
    });
  }
  return applied;
}

function damageEnemyFollowersByAlliedGolemCount(session, playerIndex, source, destroyFollower) {
  const alliedGolems = session.getPlayer(playerIndex).board.filter(unit =>
    effectiveCardType(unit) === "follower" && hasCardTrait(unit, "Golem")
  ).length;
  const enemyIndex = 1 - playerIndex;
  const targetIds = session.getPlayer(enemyIndex).board
    .filter(unit => effectiveCardType(unit) === "follower")
    .map(unit => unit.instanceId);
  let applied = false;

  for (const instanceId of targetIds) {
    const live = session.findBoardCard(enemyIndex, instanceId);
    if (!live || session.phase === "ended") continue;
    session.damageFollower(enemyIndex, live.instanceId, alliedGolems, {
      actor: playerIndex,
      source,
      reason: "ability",
      resolveDeath: false
    });
    applied = true;
    const damaged = session.findBoardCard(enemyIndex, instanceId);
    if (!damaged || currentDefense(damaged) > 0) continue;
    destroyFollower?.(session, enemyIndex, damaged.instanceId, {
      actor: playerIndex,
      source,
      reason: "ability",
      byAbility: true
    });
  }
  return applied;
}
function healLeaderByLiveHandSize(session, playerIndex, source) {
  const amount = session.getPlayer(playerIndex).hand.filter(Boolean).length;
  const sourceCardId = source?.cardId ?? source?.card?.id ?? null;
  const sourceCardName = source?.card?.name ?? null;
  const [result] = resolveEffectCommands(session, [
    createWorldsBeyondLeaderHealCommand(playerIndex, amount, {
      sourceCardId,
      sourceCardName,
      reason: "ability",
      metadata: {
        source: "card-text",
        stage: "post-draw-hand-x",
        sourceInstanceId: source?.instanceId ?? null
      }
    })
  ]);
  return Boolean(result?.applied);
}

function evolveAllAlliedFollowersByAbility(session, playerIndex) {
  const instanceIds = session.getPlayer(playerIndex).board
    .filter(unit => effectiveCardType(unit) === "follower" && !unit.evolved)
    .map(unit => unit.instanceId);
  let applied = false;
  for (const instanceId of instanceIds) {
    const unit = session.findBoardCard(playerIndex, instanceId);
    if (!unit || unit.evolved) continue;
    applied = Boolean(session.ruleset?.evolveFollowerByAbility?.(session, playerIndex, unit)) || applied;
  }
  return applied;
}

function evolveRandomAlliedFollowerByAbility(session, playerIndex, source, effect) {
  const candidates = session.getPlayer(playerIndex).board.filter(unit => {
    if (effectiveCardType(unit) !== "follower" || unit.evolved) return false;
    if (effect.excludeSource && unit.instanceId === source?.instanceId) return false;
    if (effect.requireWard && !hasWorldsBeyondKeyword(unit, "Ward")) return false;
    if (effect.minBaseCost != null && Number(unit.card?.cost ?? unit.cost ?? 0) < Number(effect.minBaseCost)) return false;
    if (effect.requireNotAttacked && Boolean(unit.hasAttacked)) return false;
    return true;
  });
  if (!candidates.length) return false;

  const roll = Math.max(0, Math.min(0.999999999999, Number(session.rng()) || 0));
  const selected = candidates[Math.min(candidates.length - 1, Math.floor(roll * candidates.length))];
  const evolved = Boolean(session.ruleset?.evolveFollowerByAbility?.(session, playerIndex, selected));
  if (!evolved) return false;

  const attack = Math.max(0, Number(effect.attack) || 0);
  const defense = Math.max(0, Number(effect.defense) || 0);
  if (attack || defense) {
    const live = session.findBoardCard(playerIndex, selected.instanceId);
    if (live) {
      live.attack = currentAttack(live) + attack;
      live.maxDefense = currentMaxDefense(live) + defense;
      live.defense = currentDefense(live) + defense;
      session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
        actor: playerIndex,
        payload: {
          card: session.cardView(live),
          attack,
          defense,
          reason: "ability",
          source: source ? session.cardView(source) : null
        }
      });
    }
  }
  return true;
}

function buffRandomAlliedFollower(session, playerIndex, source, effect) {
  const requiredName = String(effect.requiredName ?? "").trim().toLowerCase();
  const candidates = session.getPlayer(playerIndex).board.filter(unit => {
    if (effectiveCardType(unit) !== "follower") return false;
    if (requiredName && cardName(unit) !== requiredName) return false;
    if (effect.requireSuperEvolved && !unit.superEvolved) return false;
    return true;
  });
  if (!candidates.length) return false;

  const roll = Math.max(0, Math.min(0.999999999999, Number(session.rng()) || 0));
  const unit = candidates[Math.min(candidates.length - 1, Math.floor(roll * candidates.length))];
  const attack = Math.max(0, Number(effect.attack) || 0);
  const defense = Math.max(0, Number(effect.defense) || 0);
  unit.attack = currentAttack(unit) + attack;
  unit.maxDefense = currentMaxDefense(unit) + defense;
  unit.defense = currentDefense(unit) + defense;
  session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
    actor: playerIndex,
    payload: {
      card: session.cardView(unit),
      attack,
      defense,
      reason: "ability",
      source: source ? session.cardView(source) : null
    }
  });
  return true;
}

function buffAlliedFollowers(session, playerIndex, source, effect) {
  const followers = session.getPlayer(playerIndex).board.filter(unit => effectiveCardType(unit) === "follower");
  let applied = false;
  for (const unit of followers) {
    if (effect.excludeSource && unit.instanceId === source?.instanceId) continue;
    if (effect.requiredTrait && !hasCardTrait(unit, effect.requiredTrait)) continue;
    if (effect.requiredClass && cardClass(unit) !== String(effect.requiredClass).trim().toLowerCase()) continue;
    if (effect.requiredName && cardName(unit) !== String(effect.requiredName).trim().toLowerCase()) continue;
    const attack = Math.max(0, Number(effect.attack) || 0);
    const defense = Math.max(0, Number(effect.defense) || 0);
    unit.attack = currentAttack(unit) + attack;
    unit.maxDefense = currentMaxDefense(unit) + defense;
    unit.defense = currentDefense(unit) + defense;
    session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
      actor: playerIndex,
      payload: {
        card: session.cardView(unit),
        attack,
        defense,
        reason: "ability",
        source: source ? session.cardView(source) : null
      }
    });
    applied = true;
  }
  return applied;
}

function grantAlliedKeyword(session, playerIndex, source, effect) {
  let applied = false;
  for (const unit of session.getPlayer(playerIndex).board.filter(card => effectiveCardType(card) === "follower")) {
    if (effect.excludeSource && unit.instanceId === source?.instanceId) continue;
    if (effect.requiredTrait && !hasCardTrait(unit, effect.requiredTrait)) continue;
    if (effect.requiredClass && cardClass(unit) !== String(effect.requiredClass).trim().toLowerCase()) continue;
    if (effect.requiredName && cardName(unit) !== String(effect.requiredName).trim().toLowerCase()) continue;
    const granted = grantWorldsBeyondKeyword(unit, effect.keyword);
    if (!granted) continue;
    if (/^(?:Rush|Storm)$/i.test(String(effect.keyword ?? ""))) {
      refreshWorldsBeyondAttackReadiness(session, playerIndex, unit);
    }
    applied = true;
  }
  return applied;
}

function grantSelfAttackLimit(session, playerIndex, source, amount) {
  const follower = source?.instanceId ? session.findBoardCard(playerIndex, source.instanceId) : null;
  if (!follower || effectiveCardType(follower) !== "follower") return false;
  return grantWorldsBeyondAttackLimit(session, playerIndex, follower, amount);
}

function grantLeftmostAlliedAttackLimit(session, playerIndex, effect) {
  const wantedClass = String(effect.requiredClass ?? "").trim().toLowerCase();
  const follower = session.getPlayer(playerIndex).board.find(unit =>
    effectiveCardType(unit) === "follower" && (!wantedClass || cardClass(unit) === wantedClass)
  );
  if (!follower) return false;
  return grantWorldsBeyondAttackLimit(session, playerIndex, follower, effect.amount);
}

function grantSelfBarrier(session, playerIndex, source) {
  const follower = source?.instanceId ? session.findBoardCard(playerIndex, source.instanceId) : null;
  if (!follower || effectiveCardType(follower) !== "follower") return false;
  const granted = grantWorldsBeyondKeyword(follower, "Barrier");
  if (!granted) return false;
  session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
    actor: playerIndex,
    payload: {
      card: session.cardView(follower),
      attack: 0,
      defense: 0,
      keywords: ["Barrier"],
      reason: "ability-keyword",
      source: session.cardView(source)
    }
  });
  return true;
}

function gainMaximumPlayPoints(session, playerIndex, amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return false;
  const player = session.getPlayer(playerIndex);
  const before = Math.max(0, Number(player.resources?.maxPp ?? 0));
  const cap = Math.max(before, Number(session.ruleset?.maxPp ?? 10) || 10);
  const after = Math.min(cap, before + value);
  if (after === before) return false;
  player.resources.maxPp = after;
  return true;
}

function recoverEvolutionPoints(session, playerIndex, amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return false;
  const player = session.getPlayer(playerIndex);
  const before = Math.max(0, Number(player.resources?.evolutionPoints ?? 0));
  const starting = session.ruleset?.startingEvolutionPoints ?? {};
  const cap = Math.max(0, Number(starting[player.goingFirst ? "first" : "second"] ?? 2) || 2);
  const after = Math.min(cap, before + value);
  player.resources.evolutionPoints = after;
  return after > before;
}

function addGeneratedCardsToDeck(session, playerIndex, cardName, count) {
  const definition = session.findCardDefinition({ name: cardName });
  if (!definition) return false;
  const result = addWorldsBeyondGeneratedCardsToDeck(session, playerIndex, definition, { count });
  return result.added > 0;
}

function addGeneratedCardToHand(session, playerIndex, cardName) {
  const definition = session.findCardDefinition({ name: cardName });
  if (!definition) return false;
  const result = addWorldsBeyondGeneratedCard(session, playerIndex, definition, { reason: "ability" });
  return Boolean(result.added || result.burned);
}

function destroyRandomEnemyFollowers(session, playerIndex, source, count, destroyFollower) {
  const enemyIndex = 1 - playerIndex;
  const candidates = session.getPlayer(enemyIndex).board
    .filter(unit => effectiveCardType(unit) === "follower")
    .map(unit => unit.instanceId);
  const targetIds = [];
  let remaining = Math.min(Math.max(0, Number(count) || 0), candidates.length);
  while (remaining > 0 && candidates.length) {
    const index = Math.floor(session.rng() * candidates.length);
    targetIds.push(candidates.splice(index, 1)[0]);
    remaining -= 1;
  }

  let applied = false;
  for (const instanceId of targetIds) {
    const live = session.findBoardCard(enemyIndex, instanceId);
    if (!live || session.phase === "ended") continue;
    const destroyed = destroyFollower?.(session, enemyIndex, live.instanceId, {
      actor: playerIndex,
      source,
      reason: "ability",
      byAbility: true,
      abilityDestroy: true
    });
    applied = Boolean(destroyed) || applied;
  }
  return applied;
}

function destroyOtherAlliedCards(session, playerIndex, source, destroyCard) {
  const sourceInstanceId = source?.instanceId ?? null;
  const targetIds = session.getPlayer(playerIndex).board
    .filter(card => card?.instanceId !== sourceInstanceId)
    .map(card => card.instanceId);
  let applied = false;

  for (const instanceId of targetIds) {
    const live = session.findBoardCard(playerIndex, instanceId);
    if (!live || session.phase === "ended") continue;
    const destroyed = destroyCard?.(session, playerIndex, live, {
      actor: playerIndex,
      source,
      reason: "ability",
      byAbility: true,
      abilityDestroy: true
    });
    applied = Boolean(destroyed) || applied;
  }
  return applied;
}

function adjustSpecificCrestCountdown(session, playerIndex, effect) {
  const amount = Math.max(0, Number(effect.amount) || 0);
  if (!amount || !effect.crestName) return false;
  if (effect.direction === "advance") {
    return Boolean(session.ruleset?.advanceCrestCountdown?.(session, { playerIndex, name: effect.crestName, amount }));
  }
  return Boolean(session.ruleset?.delayCrestCountdown?.(session, { playerIndex, name: effect.crestName, amount }));
}

function delayAllCrestCountdowns(session, playerIndex, amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return false;
  const names = [...(session.getPlayer(playerIndex).resources?.crests ?? [])].map(crest => crest?.name).filter(Boolean);
  let applied = false;
  for (const name of names) {
    applied = Boolean(session.ruleset?.delayCrestCountdown?.(session, { playerIndex, name, amount: value })) || applied;
  }
  return applied;
}

function advanceNamedAlliedCountdowns(session, playerIndex, source, effect) {
  const wanted = String(effect.cardName ?? "").trim().toLowerCase();
  const amount = Math.max(0, Number(effect.amount) || 0);
  if (!wanted || !amount) return false;
  const targetIds = session.getPlayer(playerIndex).board
    .filter(unit => cardName(unit) === wanted && effectiveCardType(unit) === "amulet" && unit.countdown != null && Number.isFinite(Number(unit.countdown)))
    .map(unit => unit.instanceId);
  let applied = false;
  for (const instanceId of targetIds) {
    const result = session.ruleset?.advanceAmuletCountdown?.(session, { playerIndex, instanceId, amount, source });
    applied = Boolean(result?.applied) || applied;
    if (session.phase === "ended") break;
  }
  return applied;
}

function delayRandomNamedAlliedCountdown(session, playerIndex, source, effect) {
  const wanted = String(effect.cardName ?? "").trim().toLowerCase();
  const amount = Math.max(0, Number(effect.amount) || 0);
  if (!wanted || !amount) return false;
  const candidates = session.getPlayer(playerIndex).board
    .filter(unit => cardName(unit) === wanted && effectiveCardType(unit) === "amulet" && unit.countdown != null && Number.isFinite(Number(unit.countdown)));
  if (!candidates.length) return false;
  const target = candidates[Math.floor(session.rng() * candidates.length)] ?? candidates[0];
  const result = session.ruleset?.delayAmuletCountdown?.(session, { playerIndex, instanceId: target.instanceId, amount, source });
  return Boolean(result?.applied);
}

function delaySelfAmuletCountdown(session, playerIndex, source, amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (!source?.instanceId || effectiveCardType(source) !== "amulet" || !value) return false;
  const result = session.ruleset?.delayAmuletCountdown?.(session, { playerIndex, instanceId: source.instanceId, amount: value, source });
  return Boolean(result?.applied);
}

function destroyDamagedEnemyFollowers(session, playerIndex, source, destroyFollower) {
  const enemyIndex = 1 - playerIndex;
  const targetIds = session.getPlayer(enemyIndex).board
    .filter(unit => effectiveCardType(unit) === "follower" && currentDefense(unit) < currentMaxDefense(unit))
    .map(unit => unit.instanceId);
  let applied = false;
  for (const instanceId of targetIds) {
    const live = session.findBoardCard(enemyIndex, instanceId);
    if (!live) continue;
    const destroyed = destroyFollower?.(session, enemyIndex, instanceId, {
      actor: playerIndex,
      source,
      reason: "ability",
      byAbility: true,
      abilityDestroy: true
    });
    applied = Boolean(destroyed) || applied;
  }
  return applied;
}

function debuffEnemyFollowers(session, playerIndex, source, effect, destroyFollower) {
  const enemyIndex = 1 - playerIndex;
  const targets = [...session.getPlayer(enemyIndex).board].filter(unit => effectiveCardType(unit) === "follower");
  if (!targets.length) return false;

  for (const unit of targets) {
    if (!session.findBoardCard(enemyIndex, unit.instanceId)) continue;
    const beforeAttack = currentAttack(unit);
    const beforeDefense = currentDefense(unit);
    const beforeMaxDefense = currentMaxDefense(unit);
    unit.attack = Math.max(0, beforeAttack - Math.max(0, Number(effect.attack) || 0));
    unit.defense = Math.max(0, beforeDefense - Math.max(0, Number(effect.defense) || 0));
    unit.maxDefense = Math.max(0, beforeMaxDefense - Math.max(0, Number(effect.defense) || 0));
    session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
      actor: playerIndex,
      payload: {
        card: session.cardView(unit),
        attack: unit.attack - beforeAttack,
        defense: unit.defense - beforeDefense,
        reason: "ability",
        source: source ? session.cardView(source) : null
      }
    });
  }

  for (const unit of targets) {
    const live = session.findBoardCard(enemyIndex, unit.instanceId);
    if (!live || currentDefense(live) > 0) continue;
    destroyFollower?.(session, enemyIndex, live.instanceId, { actor: playerIndex, source, reason: "ability", byAbility: true });
  }
  return true;
}

function damageLeadersSimultaneously(session, targetPlayerIndexes, amount, { actor, source } = {}) {
  const targets = [...new Set(targetPlayerIndexes)].filter(index => index === 0 || index === 1);
  const damage = Math.max(0, Number(amount) || 0);
  if (!targets.length || !damage || session.phase === "ended") return false;

  const lethal = [];
  for (const targetPlayer of targets) {
    const player = session.getPlayer(targetPlayer);
    player.hp = Math.max(0, Number(player.hp ?? 0) - damage);
    session.emit(BATTLE_EVENT.LEADER_DAMAGE, {
      actor,
      payload: {
        targetPlayer,
        amount: damage,
        hp: player.hp,
        source: source ? session.cardView(source) : null,
        reason: "ability"
      }
    });
    if (player.hp <= 0) lethal.push(targetPlayer);
  }

  if (lethal.length) {
    const loser = lethal.length > 1 ? session.activePlayer : lethal[0];
    session.finishMatch(1 - loser, "leader-defense-zero", {
      loser,
      losers: lethal,
      simultaneous: lethal.length > 1
    });
  }
  return true;
}

function hasCardTrait(instance, traitName) {
  const target = String(traitName ?? "").trim().toLowerCase();
  if (!target) return false;
  const traits = instance?.card?.traits ?? instance?.traits ?? [];
  return (Array.isArray(traits) ? traits : [traits]).some(trait => String(trait ?? "").trim().toLowerCase() === target);
}


function cardClass(instance) {
  return String(instance?.card?.class ?? instance?.class ?? "").trim().toLowerCase();
}

function cardName(instance) {
  return String(instance?.card?.name ?? instance?.name ?? "").trim().toLowerCase();
}




function numberWord(value) {
  if (/^\d+$/.test(String(value))) return Number(value);
  return ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[String(value).toLowerCase()] ?? 0;
}