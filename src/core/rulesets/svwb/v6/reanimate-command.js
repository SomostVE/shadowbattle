import { BATTLE_EVENT } from "../../../battle-events.js";
import { createEffectCommand } from "../../../effect-commands.js";
import { getWorldsBeyondDestroyedFollowerOccurrences } from "../match-history.js";

export const SVWB_REANIMATE_EFFECT_COMMAND = "svwb:reanimate";

export function createWorldsBeyondReanimateCommand(playerIndex, maxCost, options = {}) {
  return createEffectCommand(SVWB_REANIMATE_EFFECT_COMMAND, {
    playerIndex,
    maxCost: Math.max(0, Number(maxCost) || 0),
    reason: options.reason ?? "ability",
    sourceCardId: options.sourceCardId ?? null,
    sourceCardName: options.sourceCardName ?? null
  }, {
    ruleset: "svwb-v6-alpha",
    ...(options.metadata ?? {})
  });
}

export function compileWorldsBeyondReanimateCommands(text, { playerIndex, source } = {}) {
  const commands = [];
  const sourceOptions = cardSourceOptions(source);
  for (const match of String(text ?? "").matchAll(/\bReanimate\s*\(\s*(\d+)\s*\)/gi)) {
    commands.push(createWorldsBeyondReanimateCommand(playerIndex, Number(match[1]), sourceOptions));
  }
  return commands;
}

export function isWorldsBeyondReanimateCommand(command) {
  return command?.type === SVWB_REANIMATE_EFFECT_COMMAND;
}

export function resolveWorldsBeyondReanimateCommand(session, command) {
  if (!isWorldsBeyondReanimateCommand(command)) return null;
  const payload = command?.payload ?? {};
  const playerIndex = validPlayer(payload.playerIndex);
  const player = session.getPlayer(playerIndex);
  const maxCost = Math.max(0, Number(payload.maxCost) || 0);
  const slots = Math.max(0, Number(session.ruleset?.maxBoardSize ?? 5) - player.board.length);
  if (!slots) return { applied: false, maxCost, eligible: 0, summoned: 0, boardFull: true };

  const occurrences = getWorldsBeyondDestroyedFollowerOccurrences(session, playerIndex)
    .filter(item => item.baseCost <= maxCost);
  if (!occurrences.length) return { applied: false, maxCost, eligible: 0, summoned: 0, boardFull: false };

  const highestBaseCost = Math.max(...occurrences.map(item => item.baseCost));
  const eligible = occurrences.filter(item => item.baseCost === highestBaseCost);
  const selected = eligible[Math.floor(session.rng() * eligible.length)] ?? eligible[0];
  const source = resolveSource(session, payload, command?.metadata);
  const instance = summonReanimatedCopy(session, playerIndex, selected.definition, source, {
    reason: payload.reason ?? "ability",
    reanimateCost: maxCost
  });

  return {
    applied: Boolean(instance),
    maxCost,
    eligible: eligible.length,
    summoned: instance ? 1 : 0,
    boardFull: false,
    cardName: selected.definition?.name ?? null,
    baseCost: highestBaseCost
  };
}

function destroyedFollowerOccurrences(session, playerIndex, maxCost) {
  const occurrences = [];
  for (const event of session.events ?? []) {
    if (event?.type !== BATTLE_EVENT.FOLLOWER_DESTROYED) continue;
    if (Number(event.payload?.owner) !== playerIndex) continue;
    const view = event.payload?.card ?? {};
    const definition = session.findCardDefinition({ id: view.cardId ?? null })
      ?? session.findCardDefinition({ name: view.name ?? null });
    if (!definition || normalize(definition.type) !== "follower") continue;
    const baseCost = Math.max(0, Number(definition.cost) || 0);
    if (baseCost > maxCost) continue;
    occurrences.push({ event, definition, baseCost });
  }
  return occurrences;
}

function summonReanimatedCopy(session, playerIndex, definition, source, { reason, reanimateCost } = {}) {
  const player = session.getPlayer(playerIndex);
  if (player.board.length >= Number(session.ruleset?.maxBoardSize ?? 5)) return null;

  const card = withDepartedTrait(definition);
  const cardId = definition.id ?? definition.cardId ?? definition.sourceCardId ?? definition.name;
  const instance = {
    instanceId: `${playerIndex}:reanimate:${session.eventSequence}:${String(cardId)}`,
    owner: playerIndex,
    cardId,
    card,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0,
    attack: Number(definition.attack ?? 0),
    defense: Number(definition.defense ?? 0),
    maxDefense: Number(definition.defense ?? 0),
    evolved: false,
    superEvolved: false
  };
  player.board.push(instance);
  session.emit(BATTLE_EVENT.FOLLOWER_ENTER, {
    actor: playerIndex,
    payload: {
      card: session.cardView(instance),
      position: player.board.length - 1,
      summoned: true,
      reanimated: true,
      reanimateCost: Math.max(0, Number(reanimateCost) || 0),
      source: source ? session.cardView(source) : null,
      reason: reason ?? "ability"
    }
  });
  return instance;
}

function withDepartedTrait(definition) {
  const traits = traitValues(definition?.traits ?? definition?.trait);
  if (traits.some(value => normalize(traitName(value)) === "departed")) return { ...definition, traits: [...traits] };
  return { ...definition, traits: [...traits, "Departed"] };
}

function traitValues(value) {
  if (Array.isArray(value)) return [...value];
  if (typeof value === "string") return value.split(/[,|]/).map(item => item.trim()).filter(Boolean);
  return value == null ? [] : [value];
}

function traitName(value) {
  if (!value || typeof value !== "object") return value;
  return value.name ?? value.trait ?? value.label ?? "";
}

function cardSourceOptions(source) {
  return {
    reason: "ability",
    sourceCardId: source?.cardId ?? source?.card?.id ?? source?.card?.cardId ?? null,
    sourceCardName: source?.card?.name ?? null,
    metadata: {
      source: "card-text",
      stage: "post-target",
      sourceInstanceId: source?.instanceId ?? null
    }
  };
}

function resolveSource(session, payload, metadata = {}) {
  const playerIndex = Number(payload.playerIndex);
  const sourceInstanceId = metadata?.sourceInstanceId;
  if ((playerIndex === 0 || playerIndex === 1) && sourceInstanceId) {
    const player = session.getPlayer(playerIndex);
    for (const zone of [player.hand, player.board, player.cemetery, player.deck, player.banished]) {
      const instance = (zone ?? []).find(item => item?.instanceId === sourceInstanceId);
      if (instance) return instance;
    }
  }

  if (payload.sourceCardId == null && !payload.sourceCardName) return null;
  const card = session.findCardDefinition({ id: payload.sourceCardId ?? null, name: payload.sourceCardName ?? null });
  if (!card) return null;
  return {
    instanceId: null,
    owner: playerIndex,
    cardId: card.id ?? card.cardId ?? payload.sourceCardId ?? null,
    card
  };
}

function validPlayer(value) {
  const index = Number(value);
  if (index !== 0 && index !== 1) throw new Error(`Invalid Reanimate player: ${value}`);
  return index;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
