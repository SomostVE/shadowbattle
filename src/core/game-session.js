import { BATTLE_EVENT, BATTLE_VISIBILITY, createBattleEvent } from "./battle-events.js";
import { BattleResolutionQueue } from "./resolution-queue.js";
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
  constructor({ gameId, players, seed = "shadowbattle", firstPlayer = "random", ruleset = null, cardCatalog = [] } = {}) {
    this.ruleset = ruleset ?? DEFAULT_RULESETS.get(gameId);
    if (!this.ruleset) throw new Error(`No playable ruleset registered for ${gameId}`);
    if (!Array.isArray(players) || players.length !== 2) throw new Error("GameSession requires exactly two players");

    this.gameId = this.ruleset.gameId;
    this.seed = String(seed);
    this.rng = createRng(this.seed);
    this.requestedFirstPlayer = firstPlayer;
    this.players = players.map((player, index) => makePlayerShell(player, index));
    this.deckManifests = players.map(player => createDeckManifest(player?.deck));
    this.cardCatalogById = new Map();
    this.cardCatalogByName = new Map();
    this.registerCardDefinitions(cardCatalog);
    this.registerCardDefinitions(this.players.flatMap(player => player.deck));
    this.phase = PHASE.CREATED;
    this.activePlayer = null;
    this.turn = 0;
    this.round = 0;
    this.winner = null;
    this.endReason = null;
    this.events = [];
    this.eventSequence = 0;
    this.resolutionQueue = new BattleResolutionQueue();
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
        payload: { count: drawn.length, cards: drawn.map(card => this.cardView(card)) }
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

  listLegalActions(playerIndex = this.activePlayer) {
    if (typeof this.ruleset.listLegalActions !== "function") return [];
    return this.ruleset.listLegalActions(this, playerIndex);
  }

  getDeckManifest(playerIndex) {
    this.getPlayer(playerIndex);
    return this.deckManifests[playerIndex].map(row => ({ ...row }));
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
        payload: { reason: "mulligan", count: replacements.length, cards: replacements.map(card => this.cardView(card)) }
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
    if (typeof this.ruleset.afterTurnStart === "function") this.ruleset.afterTurnStart(player, this);
    if (this.phase === PHASE.MAIN) this.draw(playerIndex, 1, { reason: "turn-start" });
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
    if (typeof this.ruleset.beforeTurnEnd === "function") this.ruleset.beforeTurnEnd(player, this);
    if (this.phase !== PHASE.MAIN) return this.getSnapshot(playerIndex);
    this.emit(BATTLE_EVENT.TURN_END, {
      actor: playerIndex,
      payload: { turn: this.turn, personalTurn: player.personalTurn, ppRemaining: player.resources.pp }
    });
    if (this.phase === PHASE.MAIN) this.beginTurn(1 - playerIndex);
    return this.getSnapshot(playerIndex);
  }

  draw(playerIndex, count = 1, { opening = false, emitEach = true, reason = "draw" } = {}) {
    const player = this.getPlayer(playerIndex);
    const drawn = [];
    for (let i = 0; i < count; i += 1) {
      const card = player.deck.shift();
      if (!card) {
        player.deckOut = true;
        if (this.phase === PHASE.MAIN) this.finishMatch(1 - playerIndex, "deck-out", { loser: playerIndex });
        break;
      }
      if (player.hand.length >= this.ruleset.maxHandSize) {
        player.cemetery.push(card);
        this.emit(BATTLE_EVENT.CARD_BURNED, {
          actor: playerIndex,
          visibility: BATTLE_VISIBILITY.OWNER,
          payload: { card: this.cardView(card), reason }
        });
        continue;
      }
      player.hand.push(card);
      drawn.push(card);
      if (emitEach && !opening) {
        this.emit(BATTLE_EVENT.DRAW, {
          actor: playerIndex,
          visibility: BATTLE_VISIBILITY.OWNER,
          payload: { reason, count: 1, cards: [this.cardView(card)] }
        });
      }
    }
    return drawn;
  }

  damageLeader(playerIndex, amount, { actor = null, source = null, reason = "damage" } = {}) {
    if (this.phase === PHASE.ENDED) return 0;
    const player = this.getPlayer(playerIndex);
    const damage = Math.max(0, Number(amount) || 0);
    if (!damage) return 0;
    player.hp = Math.max(0, player.hp - damage);
    this.emit(BATTLE_EVENT.LEADER_DAMAGE, {
      actor,
      payload: { targetPlayer: playerIndex, amount: damage, hp: player.hp, source: source ? this.cardView(source) : null, reason }
    });
    if (player.hp <= 0) this.finishMatch(1 - playerIndex, "leader-defense-zero", { loser: playerIndex });
    return damage;
  }

  damageFollower(playerIndex, instanceId, amount, { actor = null, source = null, reason = "damage", resolveDeath = true } = {}) {
    const unit = this.findBoardCard(playerIndex, instanceId);
    if (!unit) throw new Error("Follower damage target is not on the board");
    const requested = Math.max(0, Number(amount) || 0);
    const invincible = Boolean(unit.superEvolved && this.activePlayer === playerIndex && this.phase === PHASE.MAIN);
    const damage = invincible ? 0 : requested;
    if (damage) unit.defense = Number(unit.defense ?? unit.card?.defense ?? 0) - damage;
    this.emit(BATTLE_EVENT.FOLLOWER_DAMAGE, {
      actor,
      payload: { targetPlayer: playerIndex, target: this.cardView(unit), amount: damage, prevented: requested - damage, source: source ? this.cardView(source) : null, reason }
    });
    if (resolveDeath && Number(unit.defense ?? 0) <= 0) this.destroyFollower(playerIndex, instanceId, { actor, source, reason });
    return damage;
  }

  destroyFollower(playerIndex, instanceId, { actor = null, source = null, reason = "destroy", byAbility = false } = {}) {
    const player = this.getPlayer(playerIndex);
    const index = player.board.findIndex(unit => unit.instanceId === instanceId);
    if (index < 0) return null;
    const unit = player.board[index];
    if (byAbility && unit.superEvolved && this.activePlayer === playerIndex && this.phase === PHASE.MAIN) return null;
    player.board.splice(index, 1);
    player.cemetery.push(unit);
    this.emit(BATTLE_EVENT.FOLLOWER_DESTROYED, {
      actor,
      payload: { owner: playerIndex, card: this.cardView(unit), source: source ? this.cardView(source) : null, reason }
    });
    return unit;
  }

  finishMatch(winner, reason = "resolved", payload = {}) {
    if (this.phase === PHASE.ENDED) return this.getSnapshot();
    this.winner = winner;
    this.endReason = reason;
    this.phase = PHASE.ENDED;
    this.emit(BATTLE_EVENT.MATCH_END, { actor: winner, payload: { winner, reason, ...payload } });
    return this.getSnapshot();
  }

  findBoardCard(playerIndex, instanceId) {
    return this.getPlayer(playerIndex).board.find(unit => unit.instanceId === instanceId) ?? null;
  }

  findHandCard(playerIndex, instanceId) {
    return this.getPlayer(playerIndex).hand.find(card => card.instanceId === instanceId) ?? null;
  }

  registerCardDefinitions(cards = []) {
    for (const card of cards ?? []) {
      if (!card || typeof card !== "object") continue;
      const id = card.id ?? card.cardId ?? card.sourceCardId;
      if (id != null) this.cardCatalogById.set(String(id), card);
      const name = normalizeCardName(card.name);
      if (name) this.cardCatalogByName.set(name, card);
    }
    return this;
  }

  findCardDefinition({ id = null, name = null } = {}) {
    if (id != null) {
      const byId = this.cardCatalogById.get(String(id));
      if (byId) return byId;
    }
    if (name != null) return this.cardCatalogByName.get(normalizeCardName(name)) ?? null;
    return null;
  }

  cardView(instance) {
    return publicCard(instance);
  }

  emit(type, options = {}) {
    const event = createBattleEvent(this.eventSequence++, type, options);
    this.events.push(event);
    if (typeof this.ruleset.afterEvent === "function") {
      this.resolutionQueue.enqueue(`after-event:${type}`, () => this.ruleset.afterEvent(this, event), {
        eventSequence: event.sequence,
        eventType: type
      });
      this.resolutionQueue.drain();
    }
    return event;
  }

  queueResolution(label, resolver, metadata = {}) {
    const id = this.resolutionQueue.enqueue(label, resolver, metadata);
    this.resolutionQueue.drain();
    return id;
  }

  getResolutionState() {
    return this.resolutionQueue.getState();
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
      endReason: this.endReason,
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

function createDeckManifest(deck) {
  const rows = new Map();
  for (const value of Array.isArray(deck) ? deck : []) {
    const card = typeof value === "object" && value !== null ? value : { id: value };
    const cardId = card.id ?? card.cardId ?? value;
    const key = String(cardId);
    const existing = rows.get(key);
    if (existing) {
      existing.qty += 1;
      continue;
    }
    rows.set(key, {
      cardId,
      name: card.name ?? null,
      className: card.class ?? card.className ?? null,
      type: card.type ?? null,
      cost: Math.max(0, Number(card.cost ?? 0) || 0),
      qty: 1
    });
  }
  return Object.freeze([...rows.values()].map(row => Object.freeze({ ...row })));
}

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
    fusedCards: [],
    resources: {},
    hp: 0,
    maxHp: 0,
    goingFirst: false,
    personalTurn: 0,
    mulliganDone: false,
    deckOut: false,
    cardsPlayedThisTurn: 0,
    spellsPlayedThisTurn: 0,
    evolutionActionUsed: false
  };
}

function createCardInstance(card, owner, index) {
  const source = typeof card === "object" && card !== null ? card : { id: card };
  const cardId = source.id ?? source.cardId ?? card;
  return {
    instanceId: `${owner}:${index}:${String(cardId)}`,
    owner,
    cardId,
    card: source,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0
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
    fusedCount: player.fusedCards.length,
    mulliganDone: player.mulliganDone,
    deckOut: player.deckOut,
    evolutionActionUsed: player.evolutionActionUsed
  };
}

function publicCard(instance) {
  const evolved = Boolean(instance.evolved);
  return {
    instanceId: instance.instanceId,
    cardId: instance.cardId,
    name: instance.card?.name ?? null,
    image: instance.imageOverride ?? (evolved ? instance.card?.evolved?.image : null) ?? instance.card?.image ?? null,
    type: instance.card?.type ?? null,
    cost: Math.max(0, Number(instance.card?.cost ?? 0) + Number(instance.costDelta ?? 0)),
    attack: instance.attack == null ? Number(instance.card?.attack ?? 0) + Number(instance.attackBonus ?? 0) : Number(instance.attack),
    defense: instance.defense == null ? Number(instance.card?.defense ?? 0) + Number(instance.defenseBonus ?? 0) : Number(instance.defense),
    maxDefense: instance.maxDefense == null ? Number(instance.card?.defense ?? 0) + Number(instance.defenseBonus ?? 0) : Number(instance.maxDefense),
    evolved,
    superEvolved: Boolean(instance.superEvolved),
    attacksRemaining: Number(instance.attacksRemaining ?? 0),
    canAttackFollowers: Boolean(instance.canAttackFollowers),
    canAttackLeader: Boolean(instance.canAttackLeader),
    countdown: instance.countdown ?? null,
    fusedCount: Array.isArray(instance.fusedCards) ? instance.fusedCards.length : 0,
    keywords: [...(instance.card?.keywords ?? [])]
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

function normalizeCardName(value) {
  return String(value ?? "").trim().toLowerCase();
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
