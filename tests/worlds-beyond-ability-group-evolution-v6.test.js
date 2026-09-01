import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  resolveWorldsBeyondGenericEffects,
  stripWorldsBeyondGenericEffectText
} from "../src/core/rulesets/svwb/generic-effects.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: []
  }));
}

function readyGame(seed = "ability-group-evolution-v6") {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed,
    firstPlayer: 0,
    players: [
      { name: "A", deck: fillerDeck("A") },
      { name: "B", deck: fillerDeck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function definition(id, { cost = 1, attack = 1, defense = 1, keywords = [], text = "" } = {}) {
  return { id, name: id, class: "Neutral", type: "Follower", cost, attack, defense, keywords, text, traits: [] };
}

function boardFollower(card, suffix = "board") {
  return {
    instanceId: `${card.id}-${suffix}`,
    owner: 0,
    cardId: card.id,
    card,
    attack: card.attack,
    defense: card.defense,
    maxDefense: card.defense,
    attacksRemaining: 1,
    hasAttacked: false,
    canAttackFollowers: true,
    canAttackLeader: true,
    playedTurn: 0,
    evolved: false,
    superEvolved: false
  };
}

test("group ability-evolution grammars are structural support metadata", () => {
  const texts = [
    "Evolve all unevolved allied followers on the field.",
    "Evolve a random unevolved allied follower on the field with a base cost of 5 or more.",
    "Evolve a random unevolved allied follower on the field that didn't attack this turn.",
    "Evolve another random unevolved allied follower with Ward and give it +1/+1."
  ];
  for (const text of texts) {
    assert.equal(stripWorldsBeyondGenericEffectText(text).replace(/[\s.;,:!?]/g, ""), "");
  }
});

test("Nehan-style all-allied ability evolution includes the source, preserves printed order and spends no Evo points", () => {
  const game = readyGame("all-allied-evolve");
  const source = boardFollower(definition("nehan-style", { attack: 2, defense: 2 }));
  const ally = boardFollower(definition("ally", { attack: 1, defense: 3 }), "ally");
  const already = boardFollower(definition("already", { attack: 4, defense: 4 }), "already");
  already.evolved = true;
  game.registerCardDefinitions([source.card, ally.card, already.card]);
  game.players[0].board.push(source, ally, already);
  const evoBefore = game.players[0].resources.evolutionPoints;
  const eventsBefore = game.events.length;

  const applied = resolveWorldsBeyondGenericEffects(game, {
    text: "Evolve all unevolved allied followers on the field. Deal 2 damage to your leader.",
    playerIndex: 0,
    source
  });

  assert.equal(applied, true);
  assert.equal(source.evolved, true);
  assert.equal(source.attack, 4);
  assert.equal(source.defense, 4);
  assert.equal(ally.evolved, true);
  assert.equal(ally.attack, 3);
  assert.equal(ally.defense, 5);
  assert.equal(already.attack, 4, "already evolved followers are not evolved again");
  assert.equal(game.players[0].resources.evolutionPoints, evoBefore);
  assert.equal(game.players[0].hp, 18);
  const events = game.events.slice(eventsBefore);
  const lastEvolve = events.map(event => event.type).lastIndexOf(BATTLE_EVENT.EVOLVE);
  const leaderDamage = events.findIndex(event => event.type === BATTLE_EVENT.LEADER_DAMAGE);
  assert.ok(lastEvolve >= 0 && leaderDamage > lastEvolve, "all ability Evolves resolve before the later leader damage");
  assert.equal(events.filter(event => event.type === BATTLE_EVENT.EVOLVE).every(event => event.payload?.byAbility === true), true);
});

test("Unfeeling Eld Axe-style random evolution filters on printed base cost", () => {
  const game = readyGame("base-cost-evolve");
  const source = { instanceId: "spell-source", owner: 0, card: { id: "spell", name: "Spell", type: "Spell" } };
  const cheap = boardFollower(definition("cheap", { cost: 4 }), "cheap");
  const eligible = boardFollower(definition("eligible", { cost: 5, attack: 2, defense: 2 }), "eligible");
  game.registerCardDefinitions([cheap.card, eligible.card]);
  game.players[0].board.push(cheap, eligible);

  resolveWorldsBeyondGenericEffects(game, {
    text: "Evolve a random unevolved allied follower on the field with a base cost of 5 or more.",
    playerIndex: 0,
    source
  });

  assert.equal(cheap.evolved, false);
  assert.equal(eligible.evolved, true);
  assert.equal(eligible.attack, 4);
  assert.equal(eligible.defense, 4);
});

test("Galleon-style random evolution excludes followers that attacked this turn", () => {
  const game = readyGame("not-attacked-evolve");
  const source = boardFollower(definition("galleon-style"), "source");
  source.evolved = true;
  const attacked = boardFollower(definition("attacked"), "attacked");
  attacked.hasAttacked = true;
  const ready = boardFollower(definition("ready", { attack: 3, defense: 3 }), "ready");
  game.registerCardDefinitions([source.card, attacked.card, ready.card]);
  game.players[0].board.push(source, attacked, ready);

  resolveWorldsBeyondGenericEffects(game, {
    text: "Evolve a random unevolved allied follower on the field that didn't attack this turn.",
    playerIndex: 0,
    source
  });

  assert.equal(attacked.evolved, false);
  assert.equal(ready.evolved, true);
});

test("Sofina-style another-Ward evolution excludes the source and buffs after the ability Evo", () => {
  const game = readyGame("ward-other-evolve");
  const source = boardFollower(definition("sofina-style", { keywords: ["Ward"], attack: 2, defense: 2 }), "source");
  const ward = boardFollower(definition("ward-ally", { keywords: ["Ward"], attack: 2, defense: 3 }), "ward");
  const plain = boardFollower(definition("plain-ally", { attack: 4, defense: 4 }), "plain");
  game.registerCardDefinitions([source.card, ward.card, plain.card]);
  game.players[0].board.push(source, ward, plain);
  const evoBefore = game.players[0].resources.evolutionPoints;

  resolveWorldsBeyondGenericEffects(game, {
    text: "Evolve another random unevolved allied follower with Ward and give it +1/+1.",
    playerIndex: 0,
    source
  });

  assert.equal(source.evolved, false);
  assert.equal(ward.evolved, true);
  assert.equal(ward.attack, 5, "+2/+2 ability Evo resolves before the printed +1/+1");
  assert.equal(ward.defense, 6);
  assert.equal(ward.maxDefense, 6);
  assert.equal(plain.evolved, false);
  assert.equal(game.players[0].resources.evolutionPoints, evoBefore);
  const buff = [...game.events].reverse().find(event => event.type === BATTLE_EVENT.FOLLOWER_BUFF && event.payload?.card?.instanceId === ward.instanceId);
  assert.equal(buff?.payload?.attack, 1);
  assert.equal(buff?.payload?.defense, 1);
});
