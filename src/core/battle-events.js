export const BATTLE_EVENT = Object.freeze({
  MATCH_START: "match-start",
  OPENING_DRAW: "opening-draw",
  MULLIGAN: "mulligan",
  MULLIGAN_COMPLETE: "mulligan-complete",
  TURN_START: "turn-start",
  DRAW: "draw",
  CARD_BURNED: "card-burned",
  TURN_END: "turn-end",
  BONUS_PP: "bonus-pp",
  CARD_PLAY: "card-play",
  FUSE: "fuse",
  CARD_TRANSFORM: "card-transform",
  FOLLOWER_ENTER: "follower-enter",
  AMULET_ENTER: "amulet-enter",
  ENGAGE: "engage",
  COUNTDOWN_TICK: "countdown-tick",
  AMULET_DESTROYED: "amulet-destroyed",
  CARD_BANISHED: "card-banished",
  CARD_RETURNED: "card-returned",
  SPELL_CAST: "spell-cast",
  ABILITY_TRIGGER: "ability-trigger",
  FOLLOWER_BUFF: "follower-buff",
  ATTACK_START: "attack-start",
  ATTACK_IMPACT: "attack-impact",
  LEADER_DAMAGE: "leader-damage",
  FOLLOWER_DAMAGE: "follower-damage",
  FOLLOWER_DESTROYED: "follower-destroyed",
  EVOLVE: "evolve",
  SUPER_EVOLVE: "super-evolve",
  HEAL: "heal",
  CREST_GAINED: "crest-gained",
  CREST_TICK: "crest-tick",
  CREST_ACTIVATE: "crest-activate",
  CREST_EXPIRED: "crest-expired",
  MATCH_END: "match-end"
});

export const BATTLE_VISIBILITY = Object.freeze({
  PUBLIC: "public",
  OWNER: "owner",
  INTERNAL: "internal"
});

export function createBattleEvent(sequence, type, { actor = null, payload = {}, visibility = BATTLE_VISIBILITY.PUBLIC } = {}) {
  if (!Object.values(BATTLE_EVENT).includes(type)) throw new Error(`Unknown battle event type: ${type}`);
  return Object.freeze({
    sequence,
    type,
    actor,
    visibility,
    payload: Object.freeze({ ...payload })
  });
}
