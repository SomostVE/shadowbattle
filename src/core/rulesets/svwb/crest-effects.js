import { BATTLE_EVENT, BATTLE_VISIBILITY } from "../../battle-events.js";
import { resolveEffectCommands } from "../../effect-commands.js";
import {
  grantWorldsBeyondKeyword,
  hasWorldsBeyondKeyword
} from "./combat-readiness.js";
import { crestView, getWorldsBeyondCrests } from "./crests.js";
import { destroyWorldsBeyondFollower } from "./effect-resolver.js";
import {
  createWorldsBeyondLeaderDamageCommand,
  createWorldsBeyondLeaderHealCommand
} from "./v6/effect-commands.js";

export function resolveWorldsBeyondCrestTurnStart(session, playerIndex, crest) {
  if (!crest || session.phase !== "main") return false;
  const name = normalize(crest.name);
  let selfDamage = 0;

  if (name === "burnite, anathema of ash") selfDamage = 2;
  if (name === "burnite, anathema of flame") selfDamage = 1;
  if (!selfDamage) return false;

  emitCrestActivation(session, playerIndex, crest, "turn-start", { selfDamage });
  resolveEffectCommands(session, [
    createWorldsBeyondLeaderDamageCommand(playerIndex, playerIndex, selfDamage, crestCommandOptions(crest, "crest-turn-start"))
  ]);
  return true;
}

export function resolveWorldsBeyondCrestTurnEnd(session, playerIndex, crest) {
  if (!crest || session.phase !== "main") return false;
  const player = session.getPlayer(playerIndex);
  const enemyIndex = 1 - playerIndex;
  const enemy = session.getPlayer(enemyIndex);
  const name = normalize(crest.name);
  const followersAttackedThisTurn = didFollowerAttackThisTurn(session, playerIndex);
  let triggered = false;
  let detail = {};

  if (name === "grimnir, heavenly gale") {
    const active = player.board.some(unit => cardType(unit) === "follower" && unit.superEvolved);
    const targets = active ? [...enemy.board].filter(unit => cardType(unit) === "follower") : [];
    if (targets.length) {
      for (const target of targets) {
        session.damageFollower(enemyIndex, target.instanceId, 2, { actor: playerIndex, source: null, reason: "crest", resolveDeath: false });
        if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, reason: "crest", byAbility: true });
        if (session.phase === "ended") break;
      }
      triggered = true;
      detail = { damage: 2, targetCount: targets.length };
    }
  }

  if (name === "devotee of repose" && !followersAttackedThisTurn) {
    const candidates = player.board.filter(unit => cardType(unit) === "follower");
    if (candidates.length) {
      const unit = candidates[Math.floor(session.rng() * candidates.length)] ?? candidates[0];
      const before = currentAttack(unit);
      unit.attack = Math.max(0, before - 2);
      grantWorldsBeyondKeyword(unit, "Ward");
      session.emit(BATTLE_EVENT.FOLLOWER_BUFF, {
        actor: playerIndex,
        payload: {
          card: session.cardView(unit),
          attack: unit.attack - before,
          defense: 0,
          reason: "crest",
          crest: crestView(crest)
        }
      });
      triggered = true;
      detail = { target: session.cardView(unit), attackReduction: before - unit.attack, ward: true };
    }
  }

  if (name === "marwynn, despair manifest" && !followersAttackedThisTurn) {
    const amount = getWorldsBeyondCrests(player).length;
    splitDamageBetweenAllEnemies(session, playerIndex, amount);
    triggered = amount > 0;
    detail = { splitDamage: amount };
  }

  if (name === "congregant of repose" && !followersAttackedThisTurn) {
    const drawn = drawRandomDefenseFourFollower(session, playerIndex);
    triggered = true;
    detail = { drawn: Boolean(drawn) };
  }

  if (name === "supplicant of repose" && !followersAttackedThisTurn) {
    const healed = resolveCrestLeaderHeal(session, playerIndex, 1, crest);
    triggered = true;
    detail = { leaderHealing: healed };
  }

  if (name === "himeka, heir to repose" && player.board.some(unit => cardType(unit) === "follower" && normalize(unit.card?.name) === name)) {
    const eligible = enemy.board.filter(unit => cardType(unit) === "follower" && currentAttack(unit) <= 4 && !unit.himekaBanishAtOwnTurnEnd);
    let count = Math.min(getWorldsBeyondCrests(player).length, eligible.length);
    const locked = [];
    while (count > 0 && eligible.length) {
      const index = Math.floor(session.rng() * eligible.length);
      const [unit] = eligible.splice(index, 1);
      unit.permanentAttackLock = true;
      unit.canAttackFollowers = false;
      unit.canAttackLeader = false;
      unit.himekaBanishAtOwnTurnEnd = true;
      unit.himekaBanishActor = playerIndex;
      locked.push(session.cardView(unit));
      count -= 1;
    }
    if (locked.length) {
      triggered = true;
      detail = { locked, lockedCount: locked.length };
    }
  }

  if (name === "sandalphon, primarch successor") {
    const leaderHealing = resolveCrestLeaderHeal(session, playerIndex, 1, crest);
    let followerHealing = 0;
    for (const unit of player.board.filter(card => cardType(card) === "follower")) {
      const before = Number(unit.defense ?? 0);
      const maximum = Number(unit.maxDefense ?? before);
      unit.defense = Math.min(maximum, before + 1);
      followerHealing += Math.max(0, unit.defense - before);
    }
    triggered = true;
    detail = { leaderHealing, followerHealing };
  }

  if (triggered) emitCrestActivation(session, playerIndex, crest, "turn-end", detail);
  return triggered;
}

export function resolveWorldsBeyondCrestLastWords(session, playerIndex, crest) {
  if (!crest || session.phase !== "main") return false;
  const name = normalize(crest.name);

  if (name === "maddening benison") {
    emitCrestActivation(session, playerIndex, crest, "last-words", { selfDamage: 10 });
    resolveEffectCommands(session, [
      createWorldsBeyondLeaderDamageCommand(playerIndex, playerIndex, 10, crestCommandOptions(crest, "crest-last-words"))
    ]);
    return true;
  }

  if (name === "zoe, dazzling hope") {
    const unit = summonCrestFollower(session, playerIndex, crest, { evolve: true });
    emitCrestActivation(session, playerIndex, crest, "last-words", { summoned: Boolean(unit), evolved: Boolean(unit?.evolved), fieldFull: !unit && session.getPlayer(playerIndex).board.length >= session.ruleset.maxBoardSize });
    return true;
  }

  if (name === "lapis, shining seraph") {
    const unit = summonCrestFollower(session, playerIndex, crest, { grantStorm: true });
    emitCrestActivation(session, playerIndex, crest, "last-words", { summoned: Boolean(unit), storm: Boolean(unit && hasWorldsBeyondKeyword(unit, "Storm")), fieldFull: !unit && session.getPlayer(playerIndex).board.length >= session.ruleset.maxBoardSize });
    return true;
  }

  return false;
}

function drawRandomDefenseFourFollower(session, playerIndex) {
  const player = session.getPlayer(playerIndex);
  const candidates = player.deck.filter(item => cardType(item) === "follower" && Number(item.card?.defense) === 4);
  if (!candidates.length) return null;
  const item = candidates[Math.floor(session.rng() * candidates.length)] ?? candidates[0];
  const index = player.deck.findIndex(entry => entry.instanceId === item.instanceId);
  if (index < 0) return null;
  player.deck.splice(index, 1);

  if (player.hand.length >= session.ruleset.maxHandSize) {
    player.cemetery.push(item);
    session.emit(BATTLE_EVENT.CARD_BURNED, {
      actor: playerIndex,
      visibility: BATTLE_VISIBILITY.OWNER,
      payload: { card: session.cardView(item), reason: "crest-draw" }
    });
    return item;
  }

  player.hand.push(item);
  session.emit(BATTLE_EVENT.DRAW, {
    actor: playerIndex,
    visibility: BATTLE_VISIBILITY.OWNER,
    payload: { reason: "crest", count: 1, cards: [session.cardView(item)] }
  });
  return item;
}

function summonCrestFollower(session, playerIndex, crest, { evolve = false, grantStorm = false } = {}) {
  const player = session.getPlayer(playerIndex);
  if (player.board.length >= session.ruleset.maxBoardSize) return null;
  const card = crest.card ?? session.findCardDefinition({ id: crest.cardId, name: crest.name });
  if (!card) return null;
  const instance = {
    instanceId: `crest-summon:${playerIndex}:${session.eventSequence}:${String(card.id ?? card.cardId ?? crest.cardId ?? crest.name)}`,
    owner: playerIndex,
    cardId: card.id ?? card.cardId ?? crest.cardId ?? null,
    card,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0,
    attack: Number(card.attack ?? 0),
    defense: Number(card.defense ?? 0),
    maxDefense: Number(card.defense ?? 0),
    evolved: false,
    superEvolved: false,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: hasWorldsBeyondKeyword({ card }, "Rush") || hasWorldsBeyondKeyword({ card }, "Storm"),
    canAttackLeader: hasWorldsBeyondKeyword({ card }, "Storm")
  };
  if (grantStorm) grantWorldsBeyondKeyword(instance, "Storm");
  if (grantStorm) {
    instance.canAttackFollowers = true;
    instance.canAttackLeader = true;
  }
  player.board.push(instance);
  player.resources.rally = Math.max(0, Number(player.resources.rally ?? 0)) + 1;
  session.emit(BATTLE_EVENT.FOLLOWER_ENTER, { actor: playerIndex, payload: { card: session.cardView(instance), position: player.board.length - 1, reason: "crest-last-words" } });

  if (evolve) {
    instance.attack += 2;
    instance.defense += 2;
    instance.maxDefense += 2;
    instance.evolved = true;
    instance.imageOverride = card.evolved?.image ?? null;
    instance.canAttackFollowers = true;
    session.emit(BATTLE_EVENT.EVOLVE, { actor: playerIndex, payload: { card: session.cardView(instance), pointsRemaining: null, statBonus: 2, reason: "crest-last-words" } });
  }
  return instance;
}

function didFollowerAttackThisTurn(session, playerIndex) {
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const event = session.events[index];
    if (event.type === BATTLE_EVENT.TURN_START && event.actor === playerIndex) return false;
    if (event.type === BATTLE_EVENT.ATTACK_START && event.actor === playerIndex) return true;
  }
  return false;
}

function splitDamageBetweenAllEnemies(session, playerIndex, amount) {
  const enemyIndex = 1 - playerIndex;
  let remaining = Math.max(0, Number(amount) || 0);
  while (remaining > 0 && session.phase === "main") {
    const followers = session.getPlayer(enemyIndex).board.filter(unit => cardType(unit) === "follower");
    const pick = Math.floor(session.rng() * (followers.length + 1));
    if (pick >= followers.length) {
      session.damageLeader(enemyIndex, 1, { actor: playerIndex, reason: "crest" });
    } else {
      const target = followers[pick];
      session.damageFollower(enemyIndex, target.instanceId, 1, { actor: playerIndex, reason: "crest", resolveDeath: false });
      if (Number(target.defense ?? 0) <= 0) destroyWorldsBeyondFollower(session, enemyIndex, target.instanceId, { actor: playerIndex, reason: "crest", byAbility: true });
    }
    remaining -= 1;
  }
}

function resolveCrestLeaderHeal(session, playerIndex, amount, crest) {
  const [result] = resolveEffectCommands(session, [
    createWorldsBeyondLeaderHealCommand(playerIndex, amount, crestCommandOptions(crest, "crest"))
  ]);
  return Number(result?.healed ?? 0);
}

function crestCommandOptions(crest, reason) {
  return {
    reason,
    sourceCardId: crest?.cardId ?? null,
    sourceCardName: crest?.name ?? null,
    crest: crestView(crest),
    metadata: {
      source: "crest",
      crestName: crest?.name ?? null
    }
  };
}

function emitCrestActivation(session, playerIndex, crest, action, detail = {}) {
  session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
    actor: playerIndex,
    payload: { action, crest: crestView(crest), ...detail }
  });
}

function currentAttack(instance) {
  return Number(instance?.attack ?? (Number(instance?.card?.attack ?? 0) + Number(instance?.attackBonus ?? 0)));
}

function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
