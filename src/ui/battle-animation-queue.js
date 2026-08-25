import { BATTLE_EVENT } from "../core/battle-events.js";

export const DEFAULT_BATTLE_TIMINGS = Object.freeze({
  [BATTLE_EVENT.MATCH_START]: 450,
  [BATTLE_EVENT.OPENING_DRAW]: 260,
  [BATTLE_EVENT.MULLIGAN]: 320,
  [BATTLE_EVENT.MULLIGAN_COMPLETE]: 300,
  [BATTLE_EVENT.TURN_START]: 480,
  [BATTLE_EVENT.DRAW]: 240,
  [BATTLE_EVENT.CARD_BURNED]: 420,
  [BATTLE_EVENT.TURN_END]: 320,
  [BATTLE_EVENT.BONUS_PP]: 360,
  [BATTLE_EVENT.CARD_PLAY]: 520,
  [BATTLE_EVENT.FOLLOWER_ENTER]: 460,
  [BATTLE_EVENT.AMULET_ENTER]: 460,
  [BATTLE_EVENT.COUNTDOWN_TICK]: 360,
  [BATTLE_EVENT.AMULET_DESTROYED]: 520,
  [BATTLE_EVENT.SPELL_CAST]: 620,
  [BATTLE_EVENT.ABILITY_TRIGGER]: 480,
  [BATTLE_EVENT.FOLLOWER_BUFF]: 360,
  [BATTLE_EVENT.ATTACK_START]: 260,
  [BATTLE_EVENT.ATTACK_IMPACT]: 380,
  [BATTLE_EVENT.LEADER_DAMAGE]: 420,
  [BATTLE_EVENT.FOLLOWER_DAMAGE]: 380,
  [BATTLE_EVENT.FOLLOWER_DESTROYED]: 520,
  [BATTLE_EVENT.EVOLVE]: 1100,
  [BATTLE_EVENT.SUPER_EVOLVE]: 1450,
  [BATTLE_EVENT.HEAL]: 420,
  [BATTLE_EVENT.CREST_ACTIVATE]: 560,
  [BATTLE_EVENT.MATCH_END]: 1200
});

export class BattleAnimationQueue {
  constructor({ timings = DEFAULT_BATTLE_TIMINGS, reducedMotion = false } = {}) {
    this.timings = { ...DEFAULT_BATTLE_TIMINGS, ...timings };
    this.reducedMotion = reducedMotion;
    this.handlers = new Map();
    this.tail = Promise.resolve();
  }

  register(type, handler) {
    if (typeof handler !== "function") throw new Error("Animation handler must be a function");
    this.handlers.set(type, handler);
    return this;
  }

  enqueue(event, context = {}) {
    this.tail = this.tail.then(() => this.play(event, context));
    return this.tail;
  }

  enqueueMany(events, context = {}) {
    for (const event of events) this.enqueue(event, context);
    return this.tail;
  }

  async play(event, context = {}) {
    const handler = this.handlers.get(event.type);
    const duration = this.reducedMotion ? 0 : Math.max(0, Number(this.timings[event.type] ?? 0));
    if (handler) await handler(event, { ...context, duration, reducedMotion: this.reducedMotion });
    else if (duration > 0) await delay(duration);
  }

  flush() {
    return this.tail;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
