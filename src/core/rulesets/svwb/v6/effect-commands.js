import { BATTLE_EVENT, BATTLE_VISIBILITY } from "../../../battle-events.js";
import { createEffectCommand } from "../../../effect-commands.js";
import { gainWorldsBeyondCrest } from "../crests.js";
import { addWorldsBeyondGeneratedCard } from "../generated-cards.js";

export const SVWB_EFFECT_COMMAND = Object.freeze({
  GAIN_CREST: "svwb:gain-crest",
  DRAW: "draw",
  DRAW_FILTERED: "svwb:draw-filtered",
  ADD_TO_HAND: "svwb:add-to-hand",
  SUMMON: "svwb:summon",
  HEAL_LEADER: "heal-leader",
  DAMAGE_LEADER: "damage-leader",
  SPLIT_DAMAGE_ENEMY_FOLLOWERS: "svwb:split-damage-enemy-followers",
  SPLIT_DAMAGE_ALL_ENEMIES: "svwb:split-damage-all-enemies"
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

export function createWorldsBeyondSplitEnemyFollowerDamageCommand(playerIndex, amount, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.SPLIT_DAMAGE_ENEMY_FOLLOWERS, {
    playerIndex,
    amount,
    reason: options.reason ?? "ability",
    sourceCardId: options.sourceCardId ?? null,
    sourceCardName: options.sourceCardName ?? null
  }, options.metadata);
}

export function createWorldsBeyondSplitAllEnemiesDamageCommand(playerIndex, amount, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.SPLIT_DAMAGE_ALL_ENEMIES, {
    playerIndex,
    amount,
    reason: options.reason ?? "ability",
    sourceCardId: options.sourceCardId ?? null,
    sourceCardName: options.sourceCardName ?? null
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

export function createWorldsBeyondFilteredDrawCommand(playerIndex, {
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
}

export function createWorldsBeyondAddToHandCommand(playerIndex, cardName, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.ADD_TO_HAND, {
    playerIndex,
    cardName: String(cardName ?? "").trim(),
    count: Math.max(1, Number(options.count) || 1),
    reason: options.reason ?? "ability",
    sourceCardId: options.sourceCardId ?? null,
    sourceCardName: options.sourceCardName ?? null
  }, options.metadata);
}

export function createWorldsBeyondSummonCommand(playerIndex, cardName, count = 1, options = {}) {
  return createWorldsBeyondEffectCommand(SVWB_EFFECT_COMMAND.SUMMON, {
    playerIndex,
    cardName: String(cardName ?? "").trim(),
    count: Math.max(0, Number(count) || 0),
    reason: options.reason ?? "ability",
    sourceCardId: options.sourceCardId ?? null,
    sourceCardName: options.sourceCardName ?? null
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
  const indexed = [];
  const sourceOptions = cardSourceOptions(source, "pre-target");
  const value = String(text ?? "");

  for (const match of value.matchAll(/\bAdd\s+(two|three|four|five|six|seven|eight|nine|ten|\d+)\s+copies of\s+(.+?)\s+to your hand\b/gi)) {
    indexed.push({
      index: match.index ?? 0,
      command: createWorldsBeyondAddToHandCommand(playerIndex, match[2].trim(), {
        ...sourceOptions,
        count: numberWord(match[1])
      })
    });
  }

  const addToHand = value.match(/^\s*Add\s+(?:a|an|one)\s+([^\n.]+?)\s+to your hand\s*\.?/i);
  if (addToHand) {
    indexed.push({ index: addToHand.index ?? 0, command: createWorldsBeyondAddToHandCommand(playerIndex, addToHand[1].trim(), sourceOptions) });
  }
  for (const match of value.matchAll(/\bGain Crest\s*:\s*([^.;\n]+)/gi)) {
    indexed.push({ index: match.index ?? 0, command: createWorldsBeyondGainCrestCommand(playerIndex, match[1].trim(), sourceOptions) });
  }
  for (const match of value.matchAll(/\bSummon\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+copies of\s+([^.]+?)\s*(?:\.|$)/gi)) {
    indexed.push({ index: match.index ?? 0, command: createWorldsBeyondSummonCommand(playerIndex, match[2].trim(), numberWord(match[1]), sourceOptions) });
  }
  for (const match of value.matchAll(/\bSummon\s+(?:a|an|one)\s+([^.]+?)\s*(?:\.|$)/gi)) {
    indexed.push({ index: match.index ?? 0, command: createWorldsBeyondSummonCommand(playerIndex, match[1].trim(), 1, sourceOptions) });
  }

  return indexed.sort((left, right) => left.index - right.index).map(item => item.command);
}

export function compileWorldsBeyondPostTargetCommands(text, { playerIndex, source } = {}) {
  const indexed = [];
  const sourceOptions = cardSourceOptions(source, "post-target");
  const value = String(text ?? "");

  for (const match of value.matchAll(/\bdraw\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+cards?\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) indexed.push({ index: match.index ?? 0, command: createWorldsBeyondDrawCommand(playerIndex, amount, sourceOptions) });
  }

  for (const match of value.matchAll(/\b(?:restore|recover)\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+defense to your leader\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) indexed.push({ index: match.index ?? 0, command: createWorldsBeyondLeaderHealCommand(playerIndex, amount, sourceOptions) });
  }

  for (const match of value.matchAll(/\bdeal\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage to (?:the )?enemy leader\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) indexed.push({ index: match.index ?? 0, command: createWorldsBeyondLeaderDamageCommand(playerIndex, 1 - Number(playerIndex), amount, sourceOptions) });
  }

  for (const match of value.matchAll(/\bdeal\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage split between all enemy followers\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) indexed.push({ index: match.index ?? 0, command: createWorldsBeyondSplitEnemyFollowerDamageCommand(playerIndex, amount, sourceOptions) });
  }

  for (const match of value.matchAll(/\bdeal\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+damage split between all enemies\b/gi)) {
    const amount = numberWord(match[1]);
    if (amount > 0) indexed.push({ index: match.index ?? 0, command: createWorldsBeyondSplitAllEnemiesDamageCommand(playerIndex, amount, sourceOptions) });
  }

  return indexed.sort((left, right) => left.index - right.index).map(item => item.command);
}

export function compileWorldsBeyondTrailingFilteredDrawCommands(text, { playerIndex, source } = {}) {
  const value = String(text ?? "");
  const sourceOptions = cardSourceOptions(source, "trailing");

  const genericType = value.match(/\bdraw\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(amulets?|spells?)\s*\.?\s*$/i);
  if (genericType) {
    return [createWorldsBeyondFilteredDrawCommand(playerIndex, {
      amount: numberWord(genericType[1]),
      cardType: singularType(genericType[2])
    }, sourceOptions)];
  }

  const typed = value.match(/\bdraw\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+([a-z]+craft)\s+(followers?)\s*\.?\s*$/i);
  if (typed) {
    return [createWorldsBeyondFilteredDrawCommand(playerIndex, {
      amount: numberWord(typed[1]),
      cardClass: typed[2],
      cardType: singularType(typed[3])
    }, sourceOptions)];
  }

  const named = value.match(/\bdraw\s+(?:a|an|one)\s+([A-Z][A-Za-z0-9'’&,:\- ]+?)\s*\.?\s*$/);
  if (!named) return [];
  return [createWorldsBeyondFilteredDrawCommand(playerIndex, {
    cardName: named[1].trim()
  }, sourceOptions)];
}

export function resolveWorldsBeyondEffectCommand(session, command) {
  const payload = command?.payload ?? {};
  const playerIndex = validPlayer(payload.playerIndex);
  const source = resolveSource(session, payload, command?.metadata);

  if (command.type === SVWB_EFFECT_COMMAND.GAIN_CREST) {
    const result = gainWorldsBeyondCrest(session, playerIndex, payload.crestName, source?.card ?? null);
    return { applied: result.gained, crest: result.crest ?? null, reason: result.reason ?? null };
  }

  if (command.type === SVWB_EFFECT_COMMAND.DRAW) {
    const requested = positiveAmount(payload.amount);
    const drawn = requested ? session.draw(playerIndex, requested, { reason: payload.reason ?? "ability" }) : [];
    return { applied: requested > 0, requested, drawn: drawn.length };
  }

  if (command.type === SVWB_EFFECT_COMMAND.DRAW_FILTERED) {
    return resolveFilteredDraw(session, playerIndex, payload);
  }

  if (command.type === SVWB_EFFECT_COMMAND.ADD_TO_HAND) {
    return resolveAddToHand(session, playerIndex, payload);
  }

  if (command.type === SVWB_EFFECT_COMMAND.SUMMON) {
    return resolveSummon(session, playerIndex, payload, source);
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

  if (command.type === SVWB_EFFECT_COMMAND.SPLIT_DAMAGE_ENEMY_FOLLOWERS) {
    const requested = positiveAmount(payload.amount);
    if (!requested) return { applied: false, requested: 0 };
    const applied = Boolean(session.ruleset?.resolveSplitEnemyFollowerDamage?.(session, {
      playerIndex,
      source,
      amount: requested
    }));
    return { applied, requested };
  }

  if (command.type === SVWB_EFFECT_COMMAND.SPLIT_DAMAGE_ALL_ENEMIES) {
    const requested = positiveAmount(payload.amount);
    if (!requested) return { applied: false, requested: 0 };
    const applied = Boolean(session.ruleset?.resolveSplitAllEnemiesDamage?.(session, {
      playerIndex,
      source,
      amount: requested,
      reason: payload.reason ?? "ability"
    }));
    return { applied, requested };
  }

  throw new Error(`Unsupported Worlds Beyond effect command: ${command?.type ?? "unknown"}`);
}

function resolveAddToHand(session, playerIndex, payload) {
  const definition = session.findCardDefinition({ name: payload.cardName });
  const requested = Math.max(1, Number(payload.count) || 1);
  if (!definition) return { applied: false, requested, added: 0, burned: 0, missingCard: true, cardName: payload.cardName ?? null };

  let added = 0;
  let burned = 0;
  for (let index = 0; index < requested; index += 1) {
    const result = addWorldsBeyondGeneratedCard(session, playerIndex, definition, { reason: payload.reason ?? "ability" });
    if (result.added) added += 1;
    if (result.burned) burned += 1;
  }
  return {
    applied: added > 0 || burned > 0,
    requested,
    added,
    burned,
    missingCard: false,
    cardName: definition.name ?? payload.cardName ?? null
  };
}

function resolveFilteredDraw(session, playerIndex, payload) {
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
    const candidates = player.deck
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const card = item?.card ?? item;
        return (!wantedClass || normalize(card?.class) === wantedClass)
          && (!wantedType || normalize(card?.type) === wantedType)
          && (!wantedName || normalize(card?.name) === wantedName);
      });
    matched = Math.max(matched, candidates.length);
    if (!candidates.length) break;

    const selected = candidates[Math.floor(session.rng() * candidates.length)] ?? candidates[0];
    const [card] = player.deck.splice(selected.index, 1);
    if (!card) break;

    if (player.hand.length >= session.ruleset.maxHandSize) {
      player.cemetery.push(card);
      burned += 1;
      session.emit(BATTLE_EVENT.CARD_BURNED, {
        actor: playerIndex,
        visibility: BATTLE_VISIBILITY.OWNER,
        payload: { card: session.cardView(card), reason: payload.reason ?? "ability" }
      });
      continue;
    }

    player.hand.push(card);
    drawn += 1;
    session.emit(BATTLE_EVENT.DRAW, {
      actor: playerIndex,
      visibility: BATTLE_VISIBILITY.OWNER,
      payload: { reason: payload.reason ?? "ability", count: 1, cards: [session.cardView(card)] }
    });
  }

  return { applied: drawn > 0 || burned > 0, requested, drawn, burned, matched };
}

function resolveSummon(session, playerIndex, payload, source) {
  const player = session.getPlayer(playerIndex);
  const requested = positiveAmount(payload.count);
  const definition = session.findCardDefinition({ name: payload.cardName });
  if (!requested || !definition || normalize(definition.type) !== "follower") {
    return { applied: false, requested, summoned: 0, missingCard: !definition, cardName: payload.cardName ?? null };
  }

  const slots = Math.max(0, Number(session.ruleset.maxBoardSize ?? 5) - player.board.length);
  const count = Math.min(requested, slots);
  const summoned = [];
  for (let index = 0; index < count; index += 1) {
    const cardId = definition.id ?? definition.cardId ?? definition.sourceCardId ?? definition.name;
    const instance = {
      instanceId: `${playerIndex}:summon:${session.eventSequence}:${index}:${String(cardId)}`,
      owner: playerIndex,
      cardId,
      card: definition,
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
        source: source ? session.cardView(source) : null,
        reason: payload.reason ?? "ability"
      }
    });
    summoned.push(instance);
  }
  return { applied: summoned.length > 0, requested, summoned: summoned.length, cardName: definition.name ?? payload.cardName ?? null };
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
  const card = session.findCardDefinition({
    id: payload.sourceCardId ?? null,
    name: payload.sourceCardName ?? null
  });
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
  if (index !== 0 && index !== 1) throw new Error(`Invalid effect command player: ${value}`);
  return index;
}

function positiveAmount(value) {
  return Math.max(0, Number(value) || 0);
}

function singularType(value) {
  const normalized = normalize(value);
  if (normalized === "amulets") return "amulet";
  if (normalized === "spells") return "spell";
  if (normalized === "followers") return "follower";
  return normalized;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function numberWord(value) {
  if (/^\d+$/.test(String(value))) return Number(value);
  return ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[String(value).toLowerCase()] ?? 0;
}
