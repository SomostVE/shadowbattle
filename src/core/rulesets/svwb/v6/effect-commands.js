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
