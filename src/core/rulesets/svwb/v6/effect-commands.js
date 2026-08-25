import { BATTLE_EVENT } from "../../../battle-events.js";
import { createEffectCommand } from "../../../effect-commands.js";
import { gainWorldsBeyondCrest } from "../crests.js";

export const SVWB_EFFECT_COMMAND = Object.freeze({
  GAIN_CREST: "svwb:gain-crest",
  DRAW: "draw",
  HEAL_LEADER: "heal-leader",
  DAMAGE_LEADER: "damage-leader"
});

export function createWorldsBeyondEffectCommand(type, payload = {}, metadata = {}) {
  return createEffectCommand(type, payload, { ruleset: "svwb-v6-alpha", ...metadata });
}

export function createWorldsBeyondLeaderDamageCommand(playerIndex, targetPlayerIndex, amount, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.DAMAGE_LEADER, {
    playerIndex,
    targetPlayerIndex,
    amount,
    reason: options.reason ?? "ability",
    sourceCardId: options.sourceCardId ?? null,
    sourceCardName: options.sourceCardName ?? null,
    crest: options.crest ?? null
  }, options.metadata);
}

export function createWorldsBeyondLeaderHealCommand(playerIndex, amount, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.HEAL_LEADER, {
    playerIndex,
    amount,
    reason: options.reason ?? "ability",
    sourceCardId: options.sourceCardId ?? null,
    sourceCardName: options.sourceCardName ?? null,
    crest: options.crest ?? null
  }, options.metadata);
}

export function createWorldsBeyondDrawCommand(playerIndex, amount, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.DRAW, {
    playerIndex,
    amount,
    reason: options.reason ?? "ability"
  }, options.metadata);
}

export function createWorldsBeyondGainCrestCommand(playerIndex, crestName, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.GAIN_CREST, {
    playerIndex,
    crestName,
    sourceCardId: options.sourceCardId ?? null,
    sourceCardName: options.sourceCardName ?? null
  }, options.metadata);
}

export function compileWorldsBeyondPreTargetCommands(text, { playerIndex, source } = {}) {
  const commands = [];
  const sourceOptions = cardSourceOptions(source, "pre-target");
  for (const match of String(text ?? "").matchAll(/\bGain Crest\s*:\s*([^.;\n]+)/gi)) {
    commands.push(createWorldsBeyondGainCrestCommand(playerIndex, match[1].trim(), sourceOptions));
  }
  return commands;
}

export function compileWorldsBeyondPostTargetCommands(text, { playerIndex, source } = {}) {
  const commands = [];
  const sourceOptions = cardSourceOptions(source, "post-target");

  for (const match of String(text ?? "").matchAll(/\bdraw\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+cards?\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) commands.push(createWorldsBeyondDrawCommand(playerIndex, amount, sourceOptions));
  }

  for (const match of String(text ?? "").matchAll(/\b(?:restore|recover)\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+defense to your leader\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) commands.push(createWorldsBeyondLeaderHealCommand(playerIndex, amount, sourceOptions));
  }

  for (const match of String(text ?? "").matchAll(/\bdeal\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage to (?:the )?enemy leader\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) commands.push(createWorldsBeyondLeaderDamageCommand(playerIndex, 1 - Number(playerIndex), amount, sourceOptions));
  }

  return commands;
}

export function resolveWorldsBeyondEffectCommand(session, command) {
  const payload = command?.payload ?? {};
  const playerIndex = validPlayer(payload.playerIndex);
  const source = resolveSource(session, payload);

  if (command.type === SVWB_EFFECT_COMMAND.GAIN_CREST) {
    const result = gainWorldsBeyondCrest(session, playerIndex, payload.crestName, source?.card ?? null);
    return { applied: result.gained, crest: result.crest ?? null, reason: result.reason ?? null };
  }

  if (command.type === SVWB_EFFECT_COMMAND.DRAW) {
    const requested = positiveAmount(payload.amount);
    const drawn = requested ? session.draw(playerIndex, requested, { reason: payload.reason ?? "ability" }) : [];
    return { applied: requested > 0, requested, drawn: drawn.length };
  }

  if (command.type === SVWB_EFFECT_COMMAND.HEAL_LEADER) {
    const requested = positiveAmount(payload.amount);
    if (!requested) return { applied: false, requested: 0, healed: 0 };
    const player = session.getPlayer(playerIndex);
    const before = Number(player.hp ?? 0);
    player.hp = Math.min(Number(player.maxHp ?? before), before + requested);
    const healed = player.hp - before;
    session.emit(BATTLE_EVENT.HEAL, {
      actor: playerIndex,
      payload: {
        targetPlayer: playerIndex,
        amount: healed,
        requestedAmount: requested,
        hp: player.hp,
        source: source ? session.cardView(source) : null,
        reason: payload.reason ?? "ability",
        crest: payload.crest ?? null
      }
    });
    return { applied: true, requested, healed };
  }

  if (command.type === SVWB_EFFECT_COMMAND.DAMAGE_LEADER) {
    const targetPlayerIndex = validPlayer(payload.targetPlayerIndex);
    const requested = positiveAmount(payload.amount);
    const damage = requested
      ? session.damageLeader(targetPlayerIndex, requested, {
          actor: playerIndex,
          source,
          reason: payload.reason ?? "ability"
        })
      : 0;
    return { applied: requested > 0, requested, damage };
  }

  throw new Error(`Unsupported Worlds Beyond effect command: ${command?.type ?? "unknown"}`);
}

function cardSourceOptions(source, stage) {
  return {
    reason: "ability",
    sourceCardId: source?.cardId ?? source?.card?.id ?? source?.card?.cardId ?? null,
    sourceCardName: source?.card?.name ?? null,
    metadata: {
      source: "card-text",
      stage,
      sourceInstanceId: source?.instanceId ?? null
    }
  };
}

function resolveSource(session, payload) {
  if (payload.sourceCardId == null && !payload.sourceCardName) return null;
  const card = session.findCardDefinition({
    id: payload.sourceCardId ?? null,
    name: payload.sourceCardName ?? null
  });
  if (!card) return null;
  return {
    instanceId: null,
    owner: Number(payload.playerIndex),
    cardId: card.id ?? card.cardId ?? payload.sourceCardId ?? null,
    card
  };
}

function validPlayer(value) {
  const index = Number(value);
  if (index !== 0 && index !== 1) throw new Error(`Invalid effect command player: ${value}`);
  return index;
}

function positiveAmount(value) {
  return Math.max(0, Number(value) || 0);
}

function numberWord(value) {
  if (/^\d+$/.test(String(value))) return Number(value);
  return ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[String(value).toLowerCase()] ?? 0;
}
