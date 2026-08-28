import { BATTLE_EVENT } from "../../battle-events.js";
import { resolveEffectCommands } from "../../effect-commands.js";
import {
  createWorldsBeyondLeaderDamageCommand,
  createWorldsBeyondLeaderHealCommand,
  createWorldsBeyondSummonCommand
} from "./v6/effect-commands.js";

const NUMBER = "(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)";
const DISCARD_PARAGRAPH = /^\s*(When this card is discarded,[^\n]*(?:\n(?!\s*\n)[^\n]*)*)/i;
const SUMMON = /^When this card is discarded,\s*summon\s+(?:a|an|one)\s+(.+?)\s*\.?$/i;
const DAMAGE_AND_HEAL = new RegExp(`^When this card is discarded,\\s*deal\\s+${NUMBER}\\s+damage to (?:the )?enemy leader and restore\\s+${NUMBER}\\s+defense to your leader\\s*\\.?$`, "i");
const RANDOM_ALLIED_BUFF = /^When this card is discarded,\s*give a random allied follower on the field\s+\+(\d+)\s*\/\s*\+(\d+)\s*\.?$/i;

export function getWorldsBeyondDiscardReactionSpec(source) {
  const text = discardReactionParagraph(source?.activeText ?? source?.card?.text ?? source?.text ?? "");
  if (!text) return null;

  const summon = text.match(SUMMON);
  if (summon) {
    return {
      kind: "discard-summon",
      cardName: summon[1].trim(),
      text
    };
  }

  const damageHeal = text.match(DAMAGE_AND_HEAL);
  if (damageHeal) {
    return {
      kind: "discard-leader-damage-heal",
      damage: numberWord(damageHeal[1]),
      heal: numberWord(damageHeal[2]),
      text
    };
  }

  const buff = text.match(RANDOM_ALLIED_BUFF);
  if (buff) {
    return {
      kind: "discard-random-allied-buff",
      attack: Math.max(0, Number(buff[1]) || 0),
      defense: Math.max(0, Number(buff[2]) || 0),
      text
    };
  }

  return null;
}

export function stripWorldsBeyondDiscardReactionText(textValue) {
  const text = String(textValue ?? "");
  const pseudoSource = { card: { text } };
  if (!getWorldsBeyondDiscardReactionSpec(pseudoSource)) return text;
  const match = text.match(DISCARD_PARAGRAPH);
  if (!match) return text;
  return text.slice(match[0].length)
    .replace(/^\s+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function resolveWorldsBeyondDiscardReaction(session, event) {
  if (!session || event?.type !== BATTLE_EVENT.CARD_DISCARDED) return false;
  const playerIndex = Number(event.actor);
  const instanceId = event.payload?.card?.instanceId;
  if ((playerIndex !== 0 && playerIndex !== 1) || !instanceId) return false;

  const player = session.getPlayer(playerIndex);
  const source = player.cemetery.find(item => item?.instanceId === instanceId) ?? null;
  if (!source?.card) return false;
  const spec = getWorldsBeyondDiscardReactionSpec(source);
  if (!spec) return false;

  if (spec.kind === "discard-summon") return resolveSummonReaction(session, playerIndex, source, spec);
  if (spec.kind === "discard-leader-damage-heal") return resolveDamageHealReaction(session, playerIndex, source, spec);
  if (spec.kind === "discard-random-allied-buff") return resolveRandomBuffReaction(session, playerIndex, source, spec);
  return false;
}

function resolveSummonReaction(session, playerIndex, source, spec) {
  const definition = session.findCardDefinition({ name: spec.cardName });
  const canSummon = Boolean(
    definition
    && normalize(definition.type) === "follower"
    && session.getPlayer(playerIndex).board.length < session.ruleset.maxBoardSize
  );
  emitDiscardAbility(session, playerIndex, source, spec, {
    applied: canSummon,
    targetCardName: spec.cardName,
    supportBlocked: !definition
  });
  if (!definition) return false;

  const [result] = resolveEffectCommands(session, [createWorldsBeyondSummonCommand(playerIndex, spec.cardName, 1, {
    reason: "discard-reaction",
    sourceCardId: source.cardId ?? source.card?.id ?? null,
    sourceCardName: source.card?.name ?? null,
    metadata: { source: "discard-reaction", sourceInstanceId: source.instanceId }
  })]);
  return Boolean(result?.applied);
}

function resolveDamageHealReaction(session, playerIndex, source, spec) {
  emitDiscardAbility(session, playerIndex, source, spec, { applied: spec.damage > 0 || spec.heal > 0 });
  const commands = [];
  const options = {
    reason: "discard-reaction",
    sourceCardId: source.cardId ?? source.card?.id ?? null,
    sourceCardName: source.card?.name ?? null,
    metadata: { source: "discard-reaction", sourceInstanceId: source.instanceId }
  };
  if (spec.damage > 0) commands.push(createWorldsBeyondLeaderDamageCommand(playerIndex, 1 - playerIndex, spec.damage, options));
  if (spec.heal > 0) commands.push(createWorldsBeyondLeaderHealCommand(playerIndex, spec.heal, options));
  const results = resolveEffectCommands(session, commands);
  return results.some(result => result?.applied);
}

function resolveRandomBuffReaction(session, playerIndex, source, spec) {
  const candidates = session.getPlayer(playerIndex).board.filter(item => cardType(item) === "follower");
  const target = candidates.length
    ? candidates[Math.floor(session.rng() * candidates.length)] ?? candidates[0]
    : null;
  emitDiscardAbility(session, playerIndex, source, spec, {
    applied: Boolean(target && (spec.attack > 0 || spec.defense > 0)),
    target: target ? session.cardView(target) : null
  });
  if (!target || (!spec.attack && !spec.defense)) return false;

  target.attack = currentAttack(target) + spec.attack;
  target.maxDefense = currentMaxDefense(target) + spec.defense;
  target.defense = currentDefense(target) + spec.defense;
  session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
    actor: playerIndex,
    payload: {
      card: session.cardView(target),
      attack: spec.attack,
      defense: spec.defense,
      reason: "discard-reaction",
      source: session.cardView(source)
    }
  });
  return true;
}

function emitDiscardAbility(session, playerIndex, source, spec, {
  applied = false,
  target = null,
  targetCardName = null,
  supportBlocked = false
} = {}) {
  session.emit(BATTLE_EVENT.ABILITY_TRIGGER, {
    actor: playerIndex,
    payload: {
      trigger: "discard",
      card: session.cardView(source),
      text: spec.text,
      originalText: spec.text,
      resolved: !supportBlocked,
      applied: Boolean(applied),
      supportBlocked,
      discardReactionKind: spec.kind,
      target,
      targetCardName
    }
  });
}

function discardReactionParagraph(textValue) {
  const match = String(textValue ?? "").match(DISCARD_PARAGRAPH);
  return match?.[1]?.trim().replace(/\s+/g, " ") ?? "";
}

function currentAttack(instance) {
  return Number(instance.attack ?? (Number(instance.card?.attack ?? 0) + Number(instance.attackBonus ?? 0)));
}

function currentDefense(instance) {
  return Number(instance.defense ?? (Number(instance.card?.defense ?? 0) + Number(instance.defenseBonus ?? 0)));
}

function currentMaxDefense(instance) {
  return Number(instance.maxDefense ?? (Number(instance.card?.defense ?? 0) + Number(instance.defenseBonus ?? 0)));
}

function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function numberWord(value) {
  if (/^\d+$/.test(String(value))) return Number(value);
  return ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[normalize(value)] ?? 0;
}
