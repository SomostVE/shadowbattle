import fs from "node:fs";

function patch(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No changes produced for ${path}`);
  fs.writeFileSync(path, after);
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Non-unique patch anchor: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

patch("src/core/rulesets/svwb/combat-readiness.js", text => {
  text = replaceOnce(text,
`export function grantWorldsBeyondKeyword(instance, keyword) {
  if (!instance || !keyword) return false;
  const wanted = normalize(keyword);
  const granted = keywordValues(instance.grantedKeywords);
  const alreadyGranted = granted.some(value => normalize(keywordName(value)) === wanted);
  let reactivated = false;
  if (wanted === "barrier" && !instance.barrierActive) {
    instance.barrierActive = true;
    reactivated = true;
  }
  if (alreadyGranted) return reactivated;
  instance.grantedKeywords = [...granted, String(keyword).trim()];
  return true;
}

export function hasWorldsBeyondKeyword(instance, keyword) {
  const wanted = normalize(keyword);
  if (!wanted) return false;
  if (wanted === "barrier" && Object.prototype.hasOwnProperty.call(instance ?? {}, "barrierActive")) {
    return Boolean(instance.barrierActive);
  }

  const granted = keywordValues(instance?.grantedKeywords);`,
`export function grantWorldsBeyondKeyword(instance, keyword) {
  if (!instance || !keyword) return false;
  const wanted = normalize(keyword);
  const granted = keywordValues(instance.grantedKeywords);
  const suppressed = keywordValues(instance.suppressedKeywords);
  const remainingSuppressed = suppressed.filter(value => normalize(keywordName(value)) !== wanted);
  const unsuppressed = remainingSuppressed.length !== suppressed.length;
  if (unsuppressed) instance.suppressedKeywords = remainingSuppressed;
  const alreadyGranted = granted.some(value => normalize(keywordName(value)) === wanted);
  let reactivated = false;
  if (wanted === "barrier" && !instance.barrierActive) {
    instance.barrierActive = true;
    reactivated = true;
  }
  if (alreadyGranted) return reactivated || unsuppressed;
  instance.grantedKeywords = [...granted, String(keyword).trim()];
  return true;
}

export function removeWorldsBeyondKeyword(instance, keyword) {
  if (!instance || !keyword) return false;
  const wanted = normalize(keyword);
  if (!wanted) return false;
  const hadKeyword = hasWorldsBeyondKeyword(instance, keyword);
  const granted = keywordValues(instance.grantedKeywords);
  instance.grantedKeywords = granted.filter(value => normalize(keywordName(value)) !== wanted);
  const suppressed = keywordValues(instance.suppressedKeywords);
  if (!suppressed.some(value => normalize(keywordName(value)) === wanted)) {
    instance.suppressedKeywords = [...suppressed, String(keyword).trim()];
  }
  if (wanted === "barrier") instance.barrierActive = false;
  return hadKeyword;
}

export function hasWorldsBeyondKeyword(instance, keyword) {
  const wanted = normalize(keyword);
  if (!wanted) return false;
  const suppressed = keywordValues(instance?.suppressedKeywords);
  if (suppressed.some(value => normalize(keywordName(value)) === wanted)) return false;
  if (wanted === "barrier" && Object.prototype.hasOwnProperty.call(instance ?? {}, "barrierActive")) {
    return Boolean(instance.barrierActive);
  }

  const granted = keywordValues(instance?.grantedKeywords);`, "keyword suppression");
  return text;
});

patch("src/core/rulesets/svwb/ability-evolution.js", text => {
  text = replaceOnce(text,
`import { BATTLE_EVENT } from "../../battle-events.js";
import { resolveWorldsBeyondTrigger } from "./effect-resolver.js";`,
`import { BATTLE_EVENT } from "../../battle-events.js";`, "ability evolution import");
  text = replaceOnce(text,
`  if (superEvolution) {
    resolveWorldsBeyondTrigger(session, {
      trigger: "super-evolve",
      playerIndex,
      source: follower
    });
    resolveNaturalEvolutionAbility(session, playerIndex, follower);
  } else {
    resolveWorldsBeyondTrigger(session, {
      trigger: "evolve",
      playerIndex,
      source: follower
    });
  }
  return true;
}

function resolveNaturalEvolutionAbility(session, playerIndex, follower) {
  const text = naturalEvolutionText(follower.card?.text);
  if (!text) return false;
  const source = {
    ...follower,
    activeText: \`Evolve: \${text}\`
  };
  const result = resolveWorldsBeyondTrigger(session, {
    trigger: "evolve",
    playerIndex,
    source
  });
  return Boolean(result?.applied);
}

function naturalEvolutionText(textValue) {
  const text = String(textValue ?? "");
  const match = text.match(/(?:^|\\n\\s*\\n)\\s*When this follower evolves,\\s*([\\s\\S]*?)(?=\\n\\s*\\n|$)/i);
  return match?.[1]?.trim() ?? "";
}`,
`  return true;
}`, "ability evolution triggers");
  return text;
});

patch("src/core/rulesets/svwb/v6/effect-commands.js", text => {
  text = replaceOnce(text,
`import { gainWorldsBeyondCrest } from "../crests.js";
import { addWorldsBeyondGeneratedCard } from "../generated-cards.js";`,
`import { grantWorldsBeyondKeyword } from "../combat-readiness.js";
import { gainWorldsBeyondCrest } from "../crests.js";
import { addWorldsBeyondGeneratedCard } from "../generated-cards.js";`, "filtered draw keyword import");
  text = replaceOnce(text,
`export function createWorldsBeyondFilteredDrawCommand(playerIndex, {
  amount = 1,
  cardClass = null,
  cardType = null,
  cardName = null
} = {}, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.DRAW_FILTERED, {
    playerIndex,
    amount: Math.max(0, Number(amount) || 0),
    cardClass,
    cardType,
    cardName,
    reason: options.reason ?? "ability"
  }, options.metadata);
}`,
`export function createWorldsBeyondFilteredDrawCommand(playerIndex, {
  amount = 1,
  cardClass = null,
  cardType = null,
  cardName = null,
  allMatches = false,
  grantKeyword = null
} = {}, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.DRAW_FILTERED, {
    playerIndex,
    amount: Math.max(0, Number(amount) || 0),
    cardClass,
    cardType,
    cardName,
    allMatches: Boolean(allMatches),
    grantKeyword: grantKeyword ? String(grantKeyword).trim() : null,
    reason: options.reason ?? "ability"
  }, options.metadata);
}`, "filtered draw payload");
  text = replaceOnce(text,
`  const genericType = value.match(/\\bdraw\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(amulets?|spells?)\\s*\\.?\\s*$/i);
  if (genericType) {
    return [createWorldsBeyondFilteredDrawCommand(playerIndex, {
      amount: numberWord(genericType[1]),
      cardType: singularType(genericType[2])
    }, sourceOptions)];
  }

  const typed = value.match`,
`  const allNamed = value.match(/\\bdraw\\s+all copies of\\s+(.+?)\\s+and give them\\s+(Storm|Rush|Ward|Bane|Drain)\\s*\\.?\\s*$/i);
  if (allNamed) {
    return [createWorldsBeyondFilteredDrawCommand(playerIndex, {
      cardName: allNamed[1].trim(),
      allMatches: true,
      grantKeyword: allNamed[2]
    }, sourceOptions)];
  }

  const genericType = value.match(/\\bdraw\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(amulets?|spells?|followers?)\\s*\\.?\\s*$/i);
  if (genericType) {
    return [createWorldsBeyondFilteredDrawCommand(playerIndex, {
      amount: numberWord(genericType[1]),
      cardType: singularType(genericType[2])
    }, sourceOptions)];
  }

  const typed = value.match`, "filtered draw grammars");
  text = replaceOnce(text,
`function resolveFilteredDraw(session, playerIndex, payload) {
  const requested = positiveAmount(payload.amount);
  if (!requested) return { applied: false, requested: 0, drawn: 0, burned: 0, matched: 0 };

  const player = session.getPlayer(playerIndex);
  const wantedClass = normalize(payload.cardClass);
  const wantedType = normalize(payload.cardType);
  const wantedName = normalize(payload.cardName);
  let drawn = 0;
  let burned = 0;
  let matched = 0;

  for (let iteration = 0; iteration < requested; iteration += 1) {
    const candidates = player.deck`,
`function resolveFilteredDraw(session, playerIndex, payload) {
  const player = session.getPlayer(playerIndex);
  const wantedClass = normalize(payload.cardClass);
  const wantedType = normalize(payload.cardType);
  const wantedName = normalize(payload.cardName);
  const allMatches = Boolean(payload.allMatches);
  const initialMatches = player.deck.filter(item => {
    const card = item?.card ?? item;
    return (!wantedClass || normalize(card?.class) === wantedClass)
      && (!wantedType || normalize(card?.type) === wantedType)
      && (!wantedName || normalize(card?.name) === wantedName);
  }).length;
  const requested = allMatches ? initialMatches : positiveAmount(payload.amount);
  if (!requested) return { applied: false, requested: 0, drawn: 0, burned: 0, matched: initialMatches };

  let drawn = 0;
  let burned = 0;
  let matched = initialMatches;

  for (let iteration = 0; iteration < requested; iteration += 1) {
    const candidates = player.deck`, "filtered draw all matches");
  text = replaceOnce(text,
`    player.hand.push(card);
    drawn += 1;
    session.emit(BATTLE_EVENT.DRAW, {`,
`    player.hand.push(card);
    if (payload.grantKeyword) grantWorldsBeyondKeyword(card, payload.grantKeyword);
    drawn += 1;
    session.emit(BATTLE_EVENT.DRAW, {`, "filtered draw grant keyword");
  return text;
});

patch("src/core/rulesets/svwb/effect-resolver.js", text => {
  text = replaceOnce(text,
`import { evaluateWorldsBeyondClassCondition } from "./class-conditions.js";
import { spellboostWorldsBeyondHand, worldsBeyondCardX } from "./spellboost.js";`,
`import { evaluateWorldsBeyondClassCondition } from "./class-conditions.js";
import { grantWorldsBeyondKeyword, removeWorldsBeyondKeyword, refreshWorldsBeyondAttackReadiness } from "./combat-readiness.js";
import { spellboostWorldsBeyondHand, worldsBeyondCardX } from "./spellboost.js";`, "target keyword imports");
  text = replaceOnce(text,
`const SUPPORTED_TARGET_KINDS = new Set(["damage", "destroy", "banish", "return", "set-defense", "stat-debuff"]);`,
`const SUPPORTED_TARGET_KINDS = new Set(["damage", "destroy", "banish", "return", "set-defense", "stat-debuff", "stat-buff", "grant-keyword", "remove-keyword", "evolve-and-buff"]);`, "target kinds");
  text = replaceOnce(text,
`export function resolveWorldsBeyondTrigger(session, { trigger, playerIndex, source, targetInstanceId = null, discardInstanceId = null, mode = null }) {`,
`export function resolveWorldsBeyondTrigger(session, { trigger, playerIndex, source, targetInstanceId = null, discardInstanceId = null, mode = null, antecedentInstanceIds = [] }) {`, "trigger antecedents signature");
  text = replaceOnce(text,
`    notes: conditional.notes
  });`,
`    notes: conditional.notes,
    antecedentInstanceIds
  });`, "execute antecedents");
  text = replaceOnce(text,
`  if (trigger === "evolve") return replicateFanfareIfRequested(text, section(text, "evolve") || naturalLifecycle(text, /(?<!["“])when this follower evolves,\\s*/i));
  if (trigger === "super-evolve") return replicateFanfareIfRequested(text, section(text, "super-evolve"));`,
`  if (trigger === "evolve") return replicateFanfareIfRequested(text, section(text, "evolve") || naturalLifecycle(text, /(?<!["“])when this follower evolves,\\s*/i));
  if (trigger === "super-evolve") return normalizeSuperEvolutionReplacement(text, replicateFanfareIfRequested(text, section(text, "super-evolve")));`, "super evolve replacement normalization");
  text = replaceOnce(text,
`function replicateFanfareIfRequested(fullText, triggerSection) {
  if (!/replicate the effects? of this card'?s fanfare ability/i.test(String(triggerSection ?? ""))) return triggerSection;
  return baseText(fullText);
}

function resolveWorldsBeyondVariables`,
`function replicateFanfareIfRequested(fullText, triggerSection) {
  if (!/replicate the effects? of this card'?s fanfare ability/i.test(String(triggerSection ?? ""))) return triggerSection;
  return baseText(fullText);
}

function normalizeSuperEvolutionReplacement(fullText, triggerSection) {
  let value = String(triggerSection ?? "").trim();
  if (!/\\binstead\\b/i.test(value)) return value;
  const evolveText = section(String(fullText ?? ""), "evolve");

  let match = value.match(/^Restore\\s+(\\d+)\\s+defense instead\\.?$/i);
  if (match && /restore\\s+\\d+\\s+defense to your leader/i.test(evolveText)) {
    return `Restore ${match[1]} defense to your leader.`;
  }

  match = value.match(/^Deal damage to all enemy followers instead\\.?$/i);
  if (match) {
    const amount = evolveText.match(/deal it\\s+(\\d+)\\s+damage/i)?.[1];
    if (amount) return `Deal ${amount} damage to all enemy followers.`;
  }

  match = value.match(/^Summon\\s+(\\d+)\\s+instead\\.?$/i);
  if (match) {
    const cardName = evolveText.match(/Summon\\s+(?:a|an|one)\\s+([^.]+?)\\s*\\.?$/i)?.[1]?.trim();
    if (cardName) return `Summon ${match[1]} copies of ${cardName}.`;
  }

  match = value.match(/^Add\\s+(\\d+)\\s+copies instead\\.?$/i);
  if (match) {
    const cardName = evolveText.match(/Add\\s+(?:a|an|one)\\s+(.+?)\\s+to your hand/i)?.[1]?.trim();
    if (cardName) return `Add ${match[1]} copies of ${cardName} to your hand.`;
  }

  return value.replace(/\\s+instead\\b/gi, "").trim();
}

function resolveWorldsBeyondVariables`, "super evolve replacement helper");
  text = replaceOnce(text,
`function worldsBeyondTargetEffectSpec(text, source) {
  const value = String(text ?? "");
  let match = value.match(/select an allied card on the field and destroy it/i);
  if (match) return { kind: "destroy", selectedGrammar: true, targetSide: "allied", targetScope: "card" };

  match = value.match(/select an enemy card on the field and banish it/i);`,
`function worldsBeyondTargetEffectSpec(text, source) {
  const value = String(text ?? "");
  let match = value.match(/select an allied card on the field and destroy it/i);
  if (match) return { kind: "destroy", selectedGrammar: true, targetSide: "allied", targetScope: "card" };

  match = value.match(/select an allied card on the field and return it to hand/i);
  if (match) return { kind: "return", selectedGrammar: true, targetSide: "allied", targetScope: "card" };

  match = value.match(/select an allied follower(?: on the field)? and destroy it/i);
  if (match) return { kind: "destroy", selectedGrammar: true, targetSide: "allied" };

  match = value.match(/select an allied follower(?: on the field)? and give it\\s+(Storm|Rush|Ward|Bane|Drain)/i);
  if (match) return { kind: "grant-keyword", keyword: match[1], selectedGrammar: true, targetSide: "allied" };

  match = value.match(/select an enemy follower(?: on the field)? and remove\\s+(Storm|Rush|Ward|Bane|Drain)\\s+from it/i);
  if (match) return { kind: "remove-keyword", keyword: match[1], selectedGrammar: true, targetSide: "enemy" };

  match = value.match(/select another allied follower(?: on the field)? and give it\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)/i);
  if (match) return { kind: "stat-buff", attack: Number(match[1]) || 0, defense: Number(match[2]) || 0, selectedGrammar: true, targetSide: "allied", excludeInstanceId: source?.instanceId ?? null };

  match = value.match(/select an allied\\s+([A-Za-z]+)\\s+follower(?: on the field)?,?\\s+evolve it,?\\s+and give it\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)/i);
  if (match) return { kind: "evolve-and-buff", requiredTrait: match[1], attack: Number(match[2]) || 0, defense: Number(match[3]) || 0, selectedGrammar: true, targetSide: "allied", requireUnevolved: true };

  match = value.match(/select an enemy follower(?: on the field)? with\\s+(\\d+)\\s+defense or less and banish it/i);
  if (match) return { kind: "banish", selectedGrammar: true, targetSide: "enemy", maxDefense: Number(match[1]) || 0 };

  match = value.match(/select an enemy follower(?: on the field)? and return it to hand/i);
  if (match) return { kind: "return", selectedGrammar: true, targetSide: "enemy" };

  match = value.match(/select an enemy card on the field and banish it/i);`, "Basic target grammars");
  text = replaceOnce(text,
`function targetOptionsForSpec(session, playerIndex, targetSpec) {
  if (targetSpec?.targetScope === "card") {
    const board = session.getPlayer(targetSpec.targetSide === "allied" ? playerIndex : 1 - playerIndex).board;
    return targetSpec.targetSide === "allied" ? [...board] : targetableEnemyCards(board);
  }
  if (targetSpec?.targetScope === "follower-or-leader") {`,
`function targetOptionsForSpec(session, playerIndex, targetSpec) {
  if (targetSpec?.targetScope === "card") {
    const board = session.getPlayer(targetSpec.targetSide === "allied" ? playerIndex : 1 - playerIndex).board;
    const candidates = targetSpec.targetSide === "allied" ? [...board] : targetableEnemyCards(board);
    return filterTargetCandidates(candidates, targetSpec);
  }
  if (targetSpec?.targetScope === "follower-or-leader") {`, "card target filtering");
  text = replaceOnce(text,
`  if (targetSpec?.targetSide === "allied") {
    return session.getPlayer(playerIndex).board.filter(unit => cardType(unit) === "follower");
  }
  return targetableEnemyFollowers(session.getPlayer(1 - playerIndex).board);
}

function targetPlayerForSpec`,
`  if (targetSpec?.targetSide === "allied") {
    return filterTargetCandidates(session.getPlayer(playerIndex).board.filter(unit => cardType(unit) === "follower"), targetSpec);
  }
  return filterTargetCandidates(targetableEnemyFollowers(session.getPlayer(1 - playerIndex).board), targetSpec);
}

function filterTargetCandidates(candidates, targetSpec) {
  return candidates.filter(unit => {
    if (targetSpec?.excludeInstanceId && unit.instanceId === targetSpec.excludeInstanceId) return false;
    if (targetSpec?.maxDefense != null && Number(unit.defense ?? unit.card?.defense ?? 0) > Number(targetSpec.maxDefense)) return false;
    if (targetSpec?.requireUnevolved && unit.evolved) return false;
    if (targetSpec?.requiredTrait) {
      const wanted = String(targetSpec.requiredTrait).trim().toLowerCase();
      const traits = Array.isArray(unit?.card?.traits) ? unit.card.traits : Array.isArray(unit?.traits) ? unit.traits : [];
      if (!traits.some(trait => String(trait).trim().toLowerCase() === wanted)) return false;
    }
    return true;
  });
}

function targetPlayerForSpec`, "target filters");
  text = replaceOnce(text,
`  const patterns = [
    /\\bselect an allied card on the field and destroy it\\b/gi,
    /\\bselect an enemy card on the field and banish it\\b/gi,`,
`  const patterns = [
    /\\bselect an allied card on the field and destroy it\\b/gi,
    /\\bselect an allied card on the field and return it to hand\\b/gi,
    /\\bselect an allied follower(?: on the field)? and destroy it\\b/gi,
    /\\bselect an allied follower(?: on the field)? and give it\\s+(?:Storm|Rush|Ward|Bane|Drain)\\b/gi,
    /\\bselect an enemy follower(?: on the field)? and remove\\s+(?:Storm|Rush|Ward|Bane|Drain)\\s+from it\\b/gi,
    /\\bselect another allied follower(?: on the field)? and give it\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\b/gi,
    /\\bselect an allied\\s+[A-Za-z]+\\s+follower(?: on the field)?,?\\s+evolve it,?\\s+and give it\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\b/gi,
    /\\bselect an enemy follower(?: on the field)? with\\s+\\d+\\s+defense or less and banish it\\b/gi,
    /\\bselect an enemy follower(?: on the field)? and return it to hand\\b/gi,
    /\\bselect an enemy card on the field and banish it\\b/gi,`, "strip Basic target grammars");
  text = replaceOnce(text,
`    /\\bdraw\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+cards?\\b/gi,
    new RegExp(TRAILING_TYPED_DRAW.source, "gi"),`,
`    /\\bdraw\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+cards?\\b/gi,
    /\\bdraw\\s+(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+followers?\\b/gi,
    /\\bdraw\\s+all copies of\\s+.+?\\s+and give them\\s+(?:Storm|Rush|Ward|Bane|Drain)\\b/gi,
    /\\bbanish all enemy followers with\\s+\\d+\\s+defense or less\\b/gi,
    /\\bgive this follower\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\s+and\\s+(?:Storm|Rush|Ward|Bane|Drain)\\b/gi,
    /\\bgive them\\s+(?:Storm|Rush|Ward|Bane|Drain)\\b/gi,
    new RegExp(TRAILING_TYPED_DRAW.source, "gi"),`, "Basic residual grammars");
  text = replaceOnce(text,
`function executeSimpleEffects(session, { text, playerIndex, source, targetSpec = null, target = null, discard = null, returnToDeck = null, notes = [] }) {`,
`function executeSimpleEffects(session, { text, playerIndex, source, targetSpec = null, target = null, discard = null, returnToDeck = null, notes = [], antecedentInstanceIds = [] }) {`, "execute antecedents signature");
  text = replaceOnce(text,
`    } else if (targetSpec.kind === "stat-debuff") {
      const beforeAttack = Number(target.attack ?? target.card?.attack ?? 0);`,
`    } else if (targetSpec.kind === "stat-buff") {
      const attack = Math.max(0, Number(targetSpec.attack) || 0);
      const defense = Math.max(0, Number(targetSpec.defense) || 0);
      target.attack = Number(target.attack ?? target.card?.attack ?? 0) + attack;
      target.maxDefense = Number(target.maxDefense ?? target.card?.defense ?? 0) + defense;
      target.defense = Number(target.defense ?? target.card?.defense ?? 0) + defense;
      session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
        actor: playerIndex,
        payload: { card: session.cardView(target), attack, defense, reason: "ability", source: session.cardView(source) }
      });
      applied = true;
    } else if (targetSpec.kind === "grant-keyword") {
      applied = grantWorldsBeyondKeyword(target, targetSpec.keyword) || applied;
      refreshWorldsBeyondAttackReadiness(session, targetPlayer, target);
    } else if (targetSpec.kind === "remove-keyword") {
      applied = removeWorldsBeyondKeyword(target, targetSpec.keyword) || applied;
      refreshWorldsBeyondAttackReadiness(session, targetPlayer, target);
    } else if (targetSpec.kind === "evolve-and-buff") {
      const evolved = Boolean(session.ruleset?.evolveFollowerByAbility?.(session, targetPlayer, target));
      const live = session.findBoardCard(targetPlayer, target.instanceId);
      if (evolved && live) {
        const attack = Math.max(0, Number(targetSpec.attack) || 0);
        const defense = Math.max(0, Number(targetSpec.defense) || 0);
        live.attack = Number(live.attack ?? live.card?.attack ?? 0) + attack;
        live.maxDefense = Number(live.maxDefense ?? live.card?.defense ?? 0) + defense;
        live.defense = Number(live.defense ?? live.card?.defense ?? 0) + defense;
        session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
          actor: playerIndex,
          payload: { card: session.cardView(live), attack, defense, reason: "ability", source: session.cardView(source) }
        });
      }
      applied = evolved || applied;
    } else if (targetSpec.kind === "stat-debuff") {
      const beforeAttack = Number(target.attack ?? target.card?.attack ?? 0);`, "execute Basic targets");
  text = replaceOnce(text,
`  for (const match of text.matchAll(/\\bgive this follower\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)\\b/gi)) {
    if (!session.findBoardCard(playerIndex, source.instanceId)) continue;`,
`  for (const match of text.matchAll(/\\bgive this follower\\s+\\+(\\d+)\\s*\\/\\s*\\+(\\d+)\\b/gi)) {
    if (!session.findBoardCard(playerIndex, source.instanceId)) continue;`, "self buff stable anchor");
  text = replaceOnce(text,
`    applied = true;
  }

  for (const match of text.matchAll(/\\bgain\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+earth sigils?\\b/gi)) {`,
`    applied = true;
  }

  for (const match of text.matchAll(/\\bgive this follower\\s+\\+\\d+\\s*\\/\\s*\\+\\d+\\s+and\\s+(Storm|Rush|Ward|Bane|Drain)\\b/gi)) {
    if (!session.findBoardCard(playerIndex, source.instanceId)) continue;
    applied = grantWorldsBeyondKeyword(source, match[1]) || applied;
    refreshWorldsBeyondAttackReadiness(session, playerIndex, source);
  }

  for (const match of text.matchAll(/\\bgive them\\s+(Storm|Rush|Ward|Bane|Drain)\\b/gi)) {
    for (const instanceId of [...new Set(antecedentInstanceIds)]) {
      const unit = session.findBoardCard(playerIndex, instanceId);
      if (!unit || cardType(unit) !== "follower") continue;
      applied = grantWorldsBeyondKeyword(unit, match[1]) || applied;
      refreshWorldsBeyondAttackReadiness(session, playerIndex, unit);
    }
  }

  if (/\\bbanish all enemy followers with\\s+(\\d+)\\s+defense or less\\b/i.test(text)) {
    const maxDefense = Number(text.match(/\\bbanish all enemy followers with\\s+(\\d+)\\s+defense or less\\b/i)?.[1] ?? 0);
    const targetIds = session.getPlayer(enemyIndex).board
      .filter(unit => cardType(unit) === "follower" && Number(unit.defense ?? unit.card?.defense ?? 0) <= maxDefense)
      .map(unit => unit.instanceId);
    for (const instanceId of targetIds) {
      applied = Boolean(banishBoardCard(session, enemyIndex, instanceId, { actor: playerIndex, source, reason: "ability" })) || applied;
    }
  }

  for (const match of text.matchAll(/\\bgain\\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+earth sigils?\\b/gi)) {`, "compound keyword antecedents mass banish");
  return text;
});

patch("src/core/rulesets/svwb/evolution-actions.js", text => {
  text = replaceOnce(text,
`  try {
    resolveWorldsBeyondTrigger(session, {
      trigger,
      playerIndex,
      source: follower,
      targetInstanceId: action.targetInstanceId ?? null
    });
  } finally {`,
`  try {
    if (!superEvolution || superEvolutionReplacesEvolve(follower)) {
      resolveWorldsBeyondTrigger(session, {
        trigger,
        playerIndex,
        source: follower,
        targetInstanceId: action.targetInstanceId ?? null
      });
    } else {
      const beforeEvolveIds = new Set(player.board.map(unit => unit.instanceId));
      resolveWorldsBeyondTrigger(session, {
        trigger: EVOLVE,
        playerIndex,
        source: follower,
        targetInstanceId: action.evolveTargetInstanceId ?? action.targetInstanceId ?? null
      });
      const antecedentInstanceIds = player.board
        .filter(unit => !beforeEvolveIds.has(unit.instanceId))
        .map(unit => unit.instanceId);
      resolveWorldsBeyondTrigger(session, {
        trigger: SUPER_EVOLVE,
        playerIndex,
        source: follower,
        targetInstanceId: action.superEvolveTargetInstanceId ?? action.targetInstanceId ?? null,
        antecedentInstanceIds
      });
    }
  } finally {`, "manual super evolution sequencing");
  text = replaceOnce(text,
`function evolutionEffectText(follower, trigger) {`,
`function superEvolutionReplacesEvolve(follower) {
  return /\\binstead\\b/i.test(section(String(follower?.card?.text ?? ""), SUPER_EVOLVE));
}

function evolutionEffectText(follower, trigger) {`, "super evolution replacement detection");
  return text;
});

console.log("0.5.25 source patch applied");
