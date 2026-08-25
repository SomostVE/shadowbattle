import { BATTLE_EVENT, BATTLE_VISIBILITY, createBattleEvent } from "./battle-events.js";
import { WORLDS_BEYOND_RULESET } from "./rulesets/worlds-beyond.js";

const PHASE = Object.freeze({
  CREATED: "created",
  MULLIGAN: "mulligan",
  MAIN: "main",
  ENDED: "ended"
});

const ACTION = Object.freeze({
  MULLIGAN: "mulligan",
  END_TURN: "end-turn",
  USE_BONUS_PP: "use-bonus-pp"
});

const DEFAULT_RULESETS = new Map([[WORLDS_BEYOND_RULESET.gameId, WORLDS_BEYOND_RULESET]]);

export class GameSession {
  constructor({ gameId, players, seed = "shadowbattle", firstPlayer = "random", ruleset = null } = {}) {
    this.ruleset = ruleset ?? DEFAULT_RULESETS.get(gameId);
    if (!this.ruleset) throw new Error(`No playable ruleset registered for ${gameId}`);
    if (!Array.isArray(players) || players.length !== 2) throw new Error("GameSession requires exactly two players");

    this.gameId = this.ruleset.gameId;
    this.seed = String(seed);
    this.rng = createRng(this.seed);
    this.requestedFirstPlayer = firstPlayer;
    this.players = players.map((player, index) => makePlayerShell(player, index));
    this.phase = PHASE.CREATED;
    this.activePlayer = null;
    this.turn = 0;
    this.round = 0;
    this.winner = null;
    this.events = [];
    this.eventSequence = 0;
    this.started = false;
  }

  start() {
    if (this.started) throw new Error("GameSession has already started");
    this.started = true;

    const first = resolveFirstPlayer(this.requestedFirstPlayer, this.rng);
    const second = 1 - first;
    this.players[first].goingFirst = true;
    this.players[second].goingFirst = false;

    for (const player of this.players) {
      player.deck = shuffle(player.deck.map((card, index) => createCardInstance(card, player.index, index)), this.rng);
      player.resources = this.ruleset.createPlayerResources({ goingFirst: player.goingFirst, playerIndex: player.index });
      player.hp = this.ruleset.leaderHealth;
      player.maxHp = this.ruleset.leaderHealth;
    }

    this.activePlayer = first;
    this.phase = PHASE.MULLIGAN;
    this.emit(BATTLE_EVENT.MATCH_START, { payload: { firstPlayer: first, secondPlayer: second, gameId: this.gameId, ruleset: this.ruleset.id } });

    for (const player of this.players) {
      const drawn = this.draw(player.index, this.ruleset.openingHandSize, { opening: true, emitEach: false });
      this.emit(BATTLE_EVENT.OPENING_DRAW, {
        actor: player.index,
        visibility: BATTLE_VISIBILITY.OWNER,
        payload: { count: drawn.length, cards: drawn.map(card => publicCard(card)) }
      });
    }

    return this.getSnapshot();
  }

  dispatch(action) {
    if (!action || typeof action !== "object") throw new Error("GameSession action must be an object");
    if (action.type === ACTION.MULLIGAN) return this.submitMulligan(action.player, action.cards ?? []);
    if (action.type === ACTION.END_TURN) return this.endTurn(action.player);
    if (action.type === ACTION.USE_BONUS_PP) return this.useBonusPp(action.player);
    if (typeof this.ruleset.applyAction === "function") return this.ruleset.applyAction(this, action);
    throw new Error(`Unsupported GameSession action: ${action.type}`);
  }

  submitMulligan(playerIndex, cardInstanceIds = []) {
    this.assertPhase(PHASE.MULLIGAN);
    const player = this.getPlayer(playerIndex);
    if (player.mulliganDone) throw new Error(`Player ${playerIndex} already submitted a mulligan`);

    const requested = new Set(cardInstanceIds);
    if (requested.size !== cardInstanceIds.length) throw new Error("Mulligan cards must be unique");
    const selected = player.hand.filter(card => requested.has(card.instanceId));
    if (selected.length !== requested.size) throw new Error("Mulligan contains a card that is not in the player's hand");

    player.hand = player.hand.filter(card => !requested.has(card.instanceId));
    const replacements = this.draw(playerIndex, selected.length, { emitEach: false });
    player.deck.push(...selected);
    player.deck = shuffle(player.deck, this.rng);
    player.mulliganDone = true;

    this.emit(BATTLE_EVENT.MULLIGAN, {
      actor: playerIndex,
      payload: { replaced: selected.length },
      visibility: BATTLE_VISIBILITY.PUBLIC
    });
    if (replacements.length) {
      this.emit(BATTLE_EVENT.DRAW, {
        actor: playerIndex,
        visibility: BATTLE_VISIBILITY.OWNER,
        payload: { reason: "mulligan", count: replacements.length, cards: replacements.map(publicCard) }
      });
    }

    if (this.players.every(item => item.mulliganDone)) {
      this.emit(BATTLE_EVENT.MULLIGAN_COMPLETE);
      this.phase = PHASE.MAIN;
      this.beginTurn(this.activePlayer);
    }
    return this.getSnapshot(playerIndex);
  }

  beginTurn(playerIndex) {
    this.assertPhase(PHASE.MAIN);
    const player = this.getPlayer(playerIndex);
    this.activePlayer = playerIndex;
    player.personalTurn += 1;
    this.turn += 1;
    if (player.goingFirst) this.round = player.personalTurn;

    this.ruleset.beginTurn(player, this);
    this.emit(BATTLE_EVENT.TURN_START, {
      actor: playerIndex,
      payload: { turn: this.turn, personalTurn: player.personalTurn, pp: player.resources.pp, maxPp: player.resources.maxPp }
    });
    this.draw(playerIndex, 1, { reason: "turn-start" });
  }

  useBonusPp(playerIndex) {
    this.assertPhase(PHASE.MAIN);
    if (playerIndex !== this.activePlayer) throw new Error(`It is not player ${playerIndex}'s turn`);
    const player = this.getPlayer(playerIndex);
    if (player.goingFirst) throw new Error("The first player cannot use Bonus PP");
    if (!player.resources.bonusPpAvailable) throw new Error("Bonus PP is not available");
    player.resources.pp += 1;
    player.resources.bonusPpUses += 1;
    player.resources.bonusPpAvailable = false;
    this.emit(BATTLE_EVENT.BONUS_PP, {
      actor: playerIndex,
      payload: { pp: player.resources.pp, maxPp: player.resources.maxPp, uses: player.resources.bonusPpUses }
    });
    return this.getSnapshot(playerIndex);
  }

  endTurn(playerIndex) {
    this.assertPhase(PHASE.MAIN);
    if (playerIndex !== this.activePlayer) throw new Error(`It is not player ${playerIndex}'s turn`);
    const player = this.getPlayer(playerIndex);
    this.emit(BATTLE_EVENT.TURN_END, {
      actor: playerIndex,
      payload: { turn: this.turn, personalTurn: player.personalTurn, ppRemaining: player.resources.pp }
    });
    this.beginTurn(1 - playerIndex);
    return this.getSnapshot(playerIndex);
  }

  draw(playerIndex, count = 1, { opening = false, emitEach = true, reason = "draw" } = {}) {
    const player = this.getPlayer(playerIndex);
    const drawn = [];
    for (let i = 0; i < count; i += 1) {
      const card = player.deck.shift();
      if (!card) {
        player.deckOut = true;
        break;
      }
      if (player.hand.length >= this.ruleset.maxHandSize) {
        player.cemetery.push(card);
        this.emit(BATTLE_EVENT.CARD_BURNED, {
          actor: playerIndex,
          visibility: BATTLE_VISIBILITY.OWNER,
          payload: { card: publicCard(card), reason }
        });
        continue;
      }
      player.hand.push(card);
      drawn.push(card);
      if (emitEach && !opening) {
        this.emit(BATTLE_EVENT.DRAW, {
          actor: playerIndex,
          visibility: BATTLE_VISIBILITY.OWNER,
          payload: { reason, count: 1, cards: [publicCard(card)] }
        });
      }
    }
    return drawn;
  }

  emit(type, options = {}) {
    const event = createBattleEvent(this.eventSequence++, type, options);
    this.events.push(event);
    return event;
  }

  getEvents({ since = 0, viewer = null, revealHands = false } = {}) {
    return this.events.filter(event => event.sequence >= since && eventVisibleTo(event, viewer, revealHands));
  }

  getSnapshot(viewer = null, { revealHands = false } = {}) {
    return {
      gameId: this.gameId,
      ruleset: this.ruleset.id,
      phase: this.phase,
      turn: this.turn,
      round: this.round,
      activePlayer: this.activePlayer,
      winner: this.winner,
      players: this.players.map(player => snapshotPlayer(player, viewer, revealHands)),
      nextEventSequence: this.eventSequence
    };
  }

  getPlayer(index) {
    if (index !== 0 && index !== 1) throw new Error(`Invalid player index: ${index}`);
    return this.players[index];
  }

  assertPhase(expected) {
    if (this.phase !== expected) throw new Error(`Expected phase ${expected}, got ${this.phase}`);
  }
}

export { ACTION as GAME_ACTION, PHASE as GAME_PHASE };

function makePlayerShell(input, index) {
  const deck = Array.isArray(input?.deck) ? input.deck : [];
  if (!deck.length) throw new Error(`Player ${index} requires a non-empty deck`);
  return {
    index,
    id: input.id ?? `player-${index}`,
    name: input.name ?? `Player ${index + 1}`,
    className: input.className ?? null,
    deck: [...deck],
    hand: [],
    board: [],
    cemetery: [],
    banished: [],
    resources: {},
    hp: 0,
    maxHp: 0,
    goingFirst: false,
    personalTurn: 0,
    mulliganDone: false,
    deckOut: false
  };
}

function createCardInstance(card, owner, index) {
  const source = typeof card === "object" && card !== null ? card : { id: card };
  const cardId = source.id ?? source.cardId ?? card;
  return {
    instanceId: `${owner}:${index}:${String(cardId)}`,
    owner,
    cardId,
    card: source
  };
}

function snapshotPlayer(player, viewer, revealHands) {
  const canSeeHand = revealHands || viewer === player.index;
  return {
    index: player.index,
    id: player.id,
    name: player.name,
    className: player.className,
    hp: player.hp,
    maxHp: player.maxHp,
    goingFirst: player.goingFirst,
    personalTurn: player.personalTurn,
    resources: clone(player.resources),
    deckCount: player.deck.length,
    handCount: player.hand.length,
    hand: canSeeHand ? player.hand.map(publicCard) : player.hand.map(() => null),
    board: player.board.map(publicCard),
    cemeteryCount: player.cemetery.length,
    banishedCount: player.banished.length,
    mulliganDone: player.mulliganDone,
    deckOut: player.deckOut
  };
}

function publicCard(instance) {
  return {
    instanceId: instance.instanceId,
    cardId: instance.cardId,
    name: instance.card?.name ?? null,
    image: instance.card?.image ?? null,
    type: instance.card?.type ?? null,
    cost: Number(instance.card?.cost ?? 0)
  };
}

function eventVisibleTo(event, viewer, revealHands) {
  if (event.visibility === BATTLE_VISIBILITY.PUBLIC) return true;
  if (event.visibility === BATTLE_VISIBILITY.INTERNAL) return false;
  if (revealHands) return true;
  return viewer != null && viewer === event.actor;
}

function resolveFirstPlayer(value, rng) {
  if (value === 0 || value === "first" || value === "player-0") return 0;
  if (value === 1 || value === "second" || value === "player-1") return 1;
  if (value !== "random") throw new Error(`Invalid firstPlayer value: ${value}`);
  return rng() < 0.5 ? 0 : 1;
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffle(items, rng) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
