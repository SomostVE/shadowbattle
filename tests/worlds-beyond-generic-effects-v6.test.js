import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: []
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "generic-effects-v6",
    firstPlayer: 0,
    players: [
      { name: "A", deck: fillerDeck("A") },
      { name: "B", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function replaceHandCard(game, card) {
  const instance = game.players[0].hand[0];
  instance.card = card;
  instance.cardId = card.id;
  game.registerCardDefinitions([card]);
  return instance;
}

function follower(instanceId, owner, { attack = 2, defense = 3, keywords = [], traits = [], cardClass = "Neutral", name = instanceId } = {}) {
  return {
    instanceId,
    owner,
    cardId: instanceId,
    card: { id: instanceId, name, class: cardClass, type: "Follower", cost: 1, attack, defense, keywords, traits },
    attack,
    defense,
    maxDefense: defense,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true,
    playedTurn: 0,
    evolved: false,
    superEvolved: false
  };
}

function resolvedPlayTrigger(game) {
  return game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.ABILITY_TRIGGER && event.payload?.trigger === "play");
}

test("generic self-damage and Gain shadows resolve in printed order", () => {
  const game = readyGame();
  const card = replaceHandCard(game, {
    id: "self-damage-shadows",
    name: "Self Damage Shadows",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Deal 2 damage to your leader. Gain 2 shadows."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  assert.equal(game.players[0].hp, 18);
  assert.equal(game.players[0].resources.shadows, 2);
  assert.equal(resolvedPlayTrigger(game)?.payload.resolved, true);
});

test("damage to both leaders is simultaneous and active player loses a double lethal", () => {
  const game = readyGame();
  game.players[0].hp = 2;
  game.players[1].hp = 2;
  const card = replaceHandCard(game, {
    id: "double-lethal",
    name: "Double Lethal",
    type: "Spell",
    cost: 0,
    keywords: [],
    text: "Deal 2 damage to both leaders."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  assert.equal(game.players[0].hp, 0);
  assert.equal(game.players[1].hp, 0);
  assert.equal(game.winner, 1);
  assert.equal(game.endReason, "leader-defense-zero");
});

test("all-other allied buffs exclude the source follower", () => {
  const game = readyGame();
  const ally = follower("ally", 0, { attack: 2, defense: 3 });
  game.players[0].board.push(ally);
  const card = replaceHandCard(game, {
    id: "group-buffer",
    name: "Group Buffer",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Give all other allied followers on the field +1/+2."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const source = game.players[0].board.find(unit => unit.cardId === "group-buffer");
  assert.equal(ally.attack, 3);
  assert.equal(ally.defense, 5);
  assert.equal(ally.maxDefense, 5);
  assert.equal(source.attack, 1);
  assert.equal(source.defense, 1);
  assert.equal(resolvedPlayTrigger(game)?.payload.resolved, true);
});

test("allied-wide buffs include the source follower", () => {
  const game = readyGame();
  const ally = follower("allied-wide-ally", 0, { attack: 2, defense: 3 });
  game.players[0].board.push(ally);
  const card = replaceHandCard(game, {
    id: "allied-wide-buffer",
    name: "Allied Wide Buffer",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Give all allied followers on the field +2/+3."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const source = game.players[0].board.find(unit => unit.cardId === "allied-wide-buffer");
  assert.equal(ally.attack, 4);
  assert.equal(ally.defense, 6);
  assert.equal(ally.maxDefense, 6);
  assert.equal(source.attack, 3);
  assert.equal(source.defense, 4);
  assert.equal(source.maxDefense, 4);
  assert.equal(resolvedPlayTrigger(game)?.payload.resolved, true);
});

test("Ironcrown-style mode can buff all allied followers", () => {
  const game = readyGame();
  const ally = follower("iron-ally", 0, { attack: 2, defense: 2 });
  game.players[0].board.push(ally);
  const spell = replaceHandCard(game, {
    id: "iron-mode",
    name: "Ironcrown Majesty",
    class: "Swordcraft",
    type: "Spell",
    cost: 0,
    keywords: ["Mode"],
    text: "Select a Mode to activate.\n1. Summon a Steelclad Knight and Knight.\n2. Give all allied followers on the field +1/+1."
  });

  const action = game.listLegalActions(0).find(item => item.type === "play-card" && item.cardInstanceId === spell.instanceId && item.playMode?.modeIndex === 2);
  assert.ok(action, "global allied-buff mode should be legal");
  game.dispatch(action);

  assert.equal(ally.attack, 3);
  assert.equal(ally.defense, 3);
  assert.equal(ally.maxDefense, 3);
});

test("trait-filtered allied buffs affect only matching followers", () => {
  const game = readyGame();
  const pixie = follower("pixie-ally", 0, { attack: 2, defense: 2, traits: ["Pixie"] });
  const artifact = follower("artifact-ally", 0, { attack: 3, defense: 3, traits: ["Artifact"] });
  const plain = follower("plain-ally", 0, { attack: 4, defense: 4 });
  game.players[0].board.push(pixie, artifact, plain);
  const card = replaceHandCard(game, {
    id: "pixie-wide-buffer",
    name: "Pixie Wide Buffer",
    class: "Forestcraft",
    type: "Spell",
    cost: 0,
    keywords: [],
    text: "Give all allied Pixie followers on the field +1/+2."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  assert.equal(pixie.attack, 3);
  assert.equal(pixie.defense, 4);
  assert.equal(pixie.maxDefense, 4);
  assert.equal(artifact.attack, 3);
  assert.equal(artifact.defense, 3);
  assert.equal(plain.attack, 4);
  assert.equal(plain.defense, 4);
});

test("trait-filtered allied buffs include a matching source unless 'other' is printed", () => {
  const game = readyGame();
  const ally = follower("artifact-friend", 0, { attack: 2, defense: 2, traits: ["Artifact"] });
  game.players[0].board.push(ally);
  const card = replaceHandCard(game, {
    id: "artifact-source",
    name: "Artifact Source",
    class: "Portalcraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    traits: ["Artifact"],
    keywords: ["Fanfare"],
    text: "Fanfare: Give all allied Artifact followers on the field +1/+1."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const source = game.players[0].board.find(unit => unit.cardId === "artifact-source");
  assert.equal(ally.attack, 3);
  assert.equal(ally.defense, 3);
  assert.equal(source.attack, 2);
  assert.equal(source.defense, 2);
  assert.equal(source.maxDefense, 2);
});

test("trait-filtered allied keyword grants affect only matching followers", () => {
  const game = readyGame();
  const pixie = follower("keyword-pixie", 0, { traits: ["Pixie"] });
  const plain = follower("keyword-plain", 0);
  game.players[0].board.push(pixie, plain);
  const spell = replaceHandCard(game, {
    id: "pixie-bane-wide",
    name: "Pixie Bane Wide",
    class: "Forestcraft",
    type: "Spell",
    cost: 0,
    keywords: [],
    text: "Give all allied Pixie followers on the field Bane."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

  assert.equal((pixie.grantedKeywords ?? []).includes("Bane"), true);
  assert.equal((plain.grantedKeywords ?? []).includes("Bane"), false);
  assert.equal(resolvedPlayTrigger(game)?.payload.resolved, true);
});

test("trait-filtered Ward grants include matching source and allies", () => {
  const game = readyGame();
  const ally = follower("puppetry-ally", 0, { traits: ["Puppetry"] });
  const plain = follower("non-puppetry-ally", 0);
  game.players[0].board.push(ally, plain);
  const card = replaceHandCard(game, {
    id: "puppetry-ward-source",
    name: "Puppetry Ward Source",
    class: "Portalcraft",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    traits: ["Puppetry"],
    keywords: ["Fanfare"],
    text: "Fanfare: Give all allied Puppetry followers on the field Ward."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const source = game.players[0].board.find(unit => unit.cardId === "puppetry-ward-source");
  assert.equal((ally.grantedKeywords ?? []).includes("Ward"), true);
  assert.equal((source.grantedKeywords ?? []).includes("Ward"), true);
  assert.equal((plain.grantedKeywords ?? []).includes("Ward"), false);
});

test("all-other allied keyword grants exclude the source follower", () => {
  const game = readyGame();
  const ally = follower("barrier-other-ally", 0);
  game.players[0].board.push(ally);
  const card = replaceHandCard(game, {
    id: "barrier-other-source",
    name: "Barrier Other Source",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Give all other allied followers on the field Barrier."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  const source = game.players[0].board.find(unit => unit.cardId === "barrier-other-source");
  assert.equal(ally.barrierActive, true);
  assert.equal(Boolean(source.barrierActive), false);
});

test("group Rush grant refreshes same-turn followers for follower attacks only", () => {
  const game = readyGame();
  const ally = follower("rush-refresh-ally", 0, { attack: 2, defense: 3 });
  ally.playedTurn = game.turn;
  ally.attacksRemaining = 1;
  ally.hasAttacked = false;
  ally.canAttackFollowers = false;
  ally.canAttackLeader = false;
  const enemy = follower("rush-refresh-enemy", 1, { attack: 1, defense: 3 });
  game.players[0].board.push(ally);
  game.players[1].board.push(enemy);
  const spell = replaceHandCard(game, {
    id: "group-rush",
    name: "Group Rush",
    type: "Spell",
    cost: 0,
    keywords: [],
    text: "Give all allied followers on the field Rush."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

  const attacks = game.listLegalActions(0).filter(action => action.type === "attack" && action.attackerInstanceId === ally.instanceId);
  assert.equal(attacks.some(action => action.targetInstanceId === enemy.instanceId), true);
  assert.equal(attacks.some(action => action.target === "leader" || !action.targetInstanceId), false);
  assert.equal(ally.attacksRemaining, 1);
});

test("group Storm grant refreshes same-turn followers for leader attacks", () => {
  const game = readyGame();
  const ally = follower("storm-refresh-ally", 0, { attack: 2, defense: 3 });
  ally.playedTurn = game.turn;
  ally.attacksRemaining = 1;
  ally.hasAttacked = false;
  ally.canAttackFollowers = false;
  ally.canAttackLeader = false;
  game.players[0].board.push(ally);
  const spell = replaceHandCard(game, {
    id: "group-storm",
    name: "Group Storm",
    type: "Spell",
    cost: 0,
    keywords: [],
    text: "Give all allied followers on the field Storm."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

  const attacks = game.listLegalActions(0).filter(action => action.type === "attack" && action.attackerInstanceId === ally.instanceId);
  assert.equal(attacks.some(action => action.target === "leader" || !action.targetInstanceId), true);
  assert.equal(ally.attacksRemaining, 1);
});

test("group Rush or Storm never restores an already spent attack", () => {
  for (const keyword of ["Rush", "Storm"]) {
    const game = readyGame();
    const ally = follower(`spent-${keyword.toLowerCase()}-ally`, 0, { attack: 2, defense: 3 });
    ally.playedTurn = game.turn;
    ally.attacksRemaining = 0;
    ally.hasAttacked = true;
    ally.canAttackFollowers = false;
    ally.canAttackLeader = false;
    game.players[0].board.push(ally);
    const spell = replaceHandCard(game, {
      id: `spent-${keyword.toLowerCase()}-grant`,
      name: `Spent ${keyword} Grant`,
      type: "Spell",
      cost: 0,
      keywords: [],
      text: `Give all allied followers on the field ${keyword}.`
    });

    game.dispatch({ type: "play-card", player: 0, cardInstanceId: spell.instanceId });

    assert.equal(ally.attacksRemaining, 0);
    assert.equal(game.listLegalActions(0).some(action => action.type === "attack" && action.attackerInstanceId === ally.instanceId), false);
  }
});

test("enemy-wide stat reduction clamps attack and destroys followers at zero defense", () => {
  const game = readyGame();
  const small = follower("small-enemy", 1, { attack: 1, defense: 1 });
  const large = follower("large-enemy", 1, { attack: 5, defense: 5 });
  game.players[1].board.push(small, large);
  const card = replaceHandCard(game, {
    id: "group-debuffer",
    name: "Group Debuffer",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Give all enemy followers on the field -2/-2."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  assert.equal(game.players[1].board.some(unit => unit.instanceId === small.instanceId), false);
  assert.equal(large.attack, 3);
  assert.equal(large.defense, 3);
  assert.equal(large.maxDefense, 3);
  assert.equal(game.players[1].resources.shadows, 1);
  assert.equal(resolvedPlayTrigger(game)?.payload.resolved, true);
});

test("allied Barrier prevents one ability damage instance and is then consumed", () => {
  const game = readyGame();
  const ally = follower("barrier-ally", 0, { attack: 2, defense: 6 });
  game.players[0].board.push(ally);
  const card = replaceHandCard(game, {
    id: "barrier-granter",
    name: "Barrier Granter",
    type: "Follower",
    cost: 0,
    attack: 1,
    defense: 1,
    keywords: ["Fanfare"],
    text: "Fanfare: Give all allied followers on the field Barrier."
  });

  game.dispatch({ type: "play-card", player: 0, cardInstanceId: card.instanceId });

  assert.equal(ally.barrierActive, true);
  assert.equal(game.damageFollower(0, ally.instanceId, 3, { actor: 1, reason: "ability" }), 0);
  assert.equal(ally.defense, 6);
  assert.equal(ally.barrierActive, false);
  assert.equal(game.damageFollower(0, ally.instanceId, 3, { actor: 1, reason: "ability" }), 3);
  assert.equal(ally.defense, 3);
});

test("Barrier also prevents the first combat damage instance", () => {
  const game = readyGame();
  const attacker = follower("barrier-attacker", 0, { attack: 4, defense: 4, keywords: ["Rush"] });
  attacker.playedTurn = game.turn;
  attacker.canAttackFollowers = true;
  attacker.canAttackLeader = false;
  const defender = follower("barrier-defender", 1, { attack: 0, defense: 5 });
  defender.barrierActive = true;
  game.players[0].board.push(attacker);
  game.players[1].board.push(defender);

  game.dispatch({ type: "attack", player: 0, attackerInstanceId: attacker.instanceId, targetInstanceId: defender.instanceId });

  assert.equal(defender.defense, 5);
  assert.equal(defender.barrierActive, false);
  const damage = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.FOLLOWER_DAMAGE && event.payload?.target?.instanceId === defender.instanceId);
  assert.equal(damage?.payload.amount, 0);
  assert.equal(damage?.payload.prevented, 4);
});

test("Super Evolution prevention does not consume an existing Barrier", () => {
  const game = readyGame();
  const protectedUnit = follower("super-barrier", 0, { attack: 2, defense: 5 });
  protectedUnit.superEvolved = true;
  protectedUnit.evolved = true;
  protectedUnit.barrierActive = true;
  game.players[0].board.push(protectedUnit);

  assert.equal(game.damageFollower(0, protectedUnit.instanceId, 3, { actor: 1, reason: "ability" }), 0);
  assert.equal(protectedUnit.defense, 5);
  assert.equal(protectedUnit.barrierActive, true);
});
