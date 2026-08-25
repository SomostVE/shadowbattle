import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_EVENT } from "../src/core/battle-events.js";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import { gainWorldsBeyondCrest } from "../src/core/rulesets/svwb/crests.js";

function fillerDeck(prefix) {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    class: "Neutral",
    type: "Follower",
    cost: 9,
    attack: 1,
    defense: 1,
    keywords: [],
    traits: [],
    text: ""
  }));
}

function readyGame() {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "crest-last-words-test",
    firstPlayer: 0,
    players: [{ name: "A", deck: fillerDeck("A") }, { name: "B", deck: fillerDeck("B") }]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  return game;
}

function expireOnNextOwnTurn(game, crest) {
  crest.countdown = 1;
  crest.gainedTurn = 0;
  game.endTurn(0);
  if (game.phase === "main") game.endTurn(1);
}

function followerCard(id, name, { attack = 3, defense = 3, text = "", keywords = [] } = {}) {
  return { id, name, class: "Havencraft", type: "Follower", cost: 4, attack, defense, text, keywords, traits: [] };
}

test("Maddening Benison Crest deals 10 to its owner when Countdown expires", () => {
  const game = readyGame();
  game.players[0].hp = 10;
  const card = { id: 8801, name: "Maddening Benison", class: "Havencraft", type: "Spell", cost: 1, text: "", keywords: [], traits: [] };
  const crest = gainWorldsBeyondCrest(game, 0, card.name, card).crest;
  expireOnNextOwnTurn(game, crest);

  assert.equal(game.players[0].hp, 0);
  assert.equal(game.winner, 1);
  assert.equal(game.players[0].resources.crests.some(item => item.name === card.name), false);
  const events = game.getEvents({ viewer: 0 });
  const activation = events.find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === card.name);
  assert.equal(activation?.payload.action, "last-words");
  assert.equal(activation?.payload.selfDamage, 10);
});

test("Zoe Crest summons Zoe and evolves her by ability on expiration", () => {
  const game = readyGame();
  const card = followerCard(8802, "Zoe, Dazzling Hope", { attack: 3, defense: 3 });
  const crest = gainWorldsBeyondCrest(game, 0, card.name, card).crest;
  expireOnNextOwnTurn(game, crest);

  const zoe = game.players[0].board.find(unit => unit.card?.name === card.name);
  assert.ok(zoe);
  assert.equal(zoe.evolved, true);
  assert.equal(zoe.attack, 5);
  assert.equal(zoe.defense, 5);
  assert.equal(zoe.canAttackFollowers, true);
  assert.equal(game.players[0].resources.rally, 1);
  const events = game.getEvents({ viewer: 0 });
  assert.equal(events.some(event => event.type === BATTLE_EVENT.FOLLOWER_ENTER && event.payload.card?.name === card.name), true);
  assert.equal(events.some(event => event.type === BATTLE_EVENT.EVOLVE && event.payload.card?.name === card.name && event.payload.reason === "crest-last-words"), true);
});

test("Lapis Crest summons Lapis with Storm on expiration", () => {
  const game = readyGame();
  const card = followerCard(8803, "Lapis, Shining Seraph", { attack: 4, defense: 4 });
  const crest = gainWorldsBeyondCrest(game, 0, card.name, card).crest;
  expireOnNextOwnTurn(game, crest);

  const lapis = game.players[0].board.find(unit => unit.card?.name === card.name);
  assert.ok(lapis);
  assert.equal(lapis.canAttackFollowers, true);
  assert.equal(lapis.canAttackLeader, true);
  assert.equal(game.players[0].resources.rally, 1);
  const activation = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === card.name);
  assert.equal(activation?.payload.storm, true);
});

test("Zoe and Lapis Crests consume their Countdown without summoning into a full field", () => {
  for (const [id, name] of [[8804, "Zoe, Dazzling Hope"], [8805, "Lapis, Shining Seraph"]]) {
    const game = readyGame();
    for (let index = 0; index < 5; index += 1) {
      const card = followerCard(`full-${index}`, `Full ${index}`, { attack: 1, defense: 1 });
      game.players[0].board.push({
        instanceId: `full-${index}`,
        owner: 0,
        cardId: card.id,
        card,
        attack: 1,
        defense: 1,
        maxDefense: 1,
        attacksRemaining: 0,
        canAttackFollowers: false,
        canAttackLeader: false
      });
    }
    const card = followerCard(id, name);
    const crest = gainWorldsBeyondCrest(game, 0, card.name, card).crest;
    expireOnNextOwnTurn(game, crest);
    assert.equal(game.players[0].board.length, 5);
    assert.equal(game.players[0].resources.crests.some(item => item.name === name), false);
    const activation = game.getEvents({ viewer: 0 }).find(event => event.type === BATTLE_EVENT.CREST_ACTIVATE && event.payload.crest?.name === name);
    assert.equal(activation?.payload.fieldFull, true);
    assert.equal(activation?.payload.summoned, false);
  }
});
