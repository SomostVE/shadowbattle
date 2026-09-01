import test from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS } from "../src/core/game-catalog.js";
import { GameSession } from "../src/core/game-session.js";
import {
  getWorldsBeyondTargetOptions,
  getWorldsBeyondTriggerSupport
} from "../src/core/rulesets/svwb/effect-resolver.js";
import {
  grantWorldsBeyondKeyword,
  hasWorldsBeyondKeyword,
  removeWorldsBeyondKeyword
} from "../src/core/rulesets/svwb/combat-readiness.js";
import { WORLDS_BEYOND_RULESET } from "../src/core/rulesets/worlds-beyond.js";

function card(id, extra = {}) {
  return {
    id,
    name: id,
    class: "Neutral",
    type: "Follower",
    cost: 1,
    attack: 2,
    defense: 2,
    text: "",
    keywords: [],
    traits: [],
    ...extra
  };
}

function deck(prefix, special = null) {
  const rows = Array.from({ length: 40 }, (_, index) => card(`${prefix}-${index}`));
  if (special) rows[0] = special;
  return rows;
}

function begin(special = null) {
  const game = new GameSession({
    gameId: GAME_IDS.WORLDS_BEYOND,
    seed: "basic-cleanup-v6",
    firstPlayer: 0,
    players: [
      { name: "Human", className: "Neutral", deck: deck("A", special) },
      { name: "CPU", className: "Neutral", deck: deck("B") }
    ]
  });
  game.start();
  game.submitMulligan(0, []);
  game.submitMulligan(1, []);
  game.players[0].resources.pp = 10;
  game.players[0].resources.maxPp = 10;
  return game;
}

function forceBoardFollower(game, playerIndex, source, options = {}) {
  const player = game.players[playerIndex];
  const instance = player.hand.shift() ?? player.deck.shift();
  assert.ok(instance);
  instance.card = source;
  instance.cardId = source.id;
  instance.attack = Number(source.attack ?? 0);
  instance.defense = Number(source.defense ?? 0);
  instance.maxDefense = Number(source.defense ?? 0);
  instance.attacksRemaining = 1;
  instance.canAttackFollowers = true;
  instance.canAttackLeader = true;
  instance.hasAttacked = false;
  instance.playedTurn = game.turn - 1;
  instance.evolved = Boolean(options.evolved);
  instance.superEvolved = Boolean(options.superEvolved);
  player.board.push(instance);
  return instance;
}

function permissivePlayer(className = "Neutral") {
  return {
    index: 0,
    className,
    hp: 20,
    maxHp: 20,
    hand: [],
    board: [],
    cardsPlayedThisTurn: 30,
    spellsPlayedThisTurn: 30,
    resources: {
      pp: 10,
      maxPp: 10,
      shadows: 30,
      rally: 30,
      earthSigils: 30,
      evolutionPoints: 2,
      superEvolutionPoints: 2,
      evolutionAvailable: true,
      superEvolutionAvailable: true,
      crests: []
    }
  };
}

test("all formerly unsupported Basic card texts are structurally recognized", () => {
  const rows = [
    ["play", "Fanfare: Draw a follower."],
    ["engage", "Engage: Select an allied follower on the field and give it Rush."],
    ["play", "Fanfare: Select an allied card on the field and return it to hand. Deal 2 damage to a random enemy follower."],
    ["super-evolve", "Evolve: Select an enemy follower on the field and return it to hand.\n\nSuper-Evolve: Select an enemy follower on the field and return it to hand."],
    ["super-evolve", "Evolve: Draw a card.\n\nSuper-Evolve: Draw all copies of Rusty, Luxcard Trickster and give them Storm."],
    ["play", "Fanfare: Earth Rite (1) - Give this follower +2/+2 and Ward."],
    ["super-evolve", "Evolve: Draw a card.\n\nSuper-Evolve: Select an allied Golem follower on the field, evolve it, and give it +3/+3."],
    ["super-evolve", "Evolve: Select an enemy follower on the field and deal it 4 damage.\n\nSuper-Evolve: Deal damage to all enemy followers instead."],
    ["play", "Fanfare: Select an allied follower on the field and destroy it. Draw 2 cards."],
    ["super-evolve", "Evolve: Summon 2 copies of Ghost.\n\nSuper-Evolve: Give them Drain."],
    ["play", "Fanfare: Select another allied follower on the field and give it +1/+1."],
    ["evolve", "Evolve: Replicate the effects of this card's Fanfare ability.\n\nFanfare: Select another allied follower on the field and give it +1/+1."],
    ["evolve", "Evolve: Select an enemy follower on the field with 3 defense or less and banish it."],
    ["super-evolve", "Evolve: Select an enemy follower on the field with 3 defense or less and banish it.\n\nSuper-Evolve: Banish all enemy followers with 3 defense or less instead."],
    ["super-evolve", "Evolve: Summon a Mecha Cavalier.\n\nSuper-Evolve: Summon 2 instead."],
    ["super-evolve", "Evolve: Restore 2 defense to your leader.\n\nSuper-Evolve: Restore 4 defense instead."],
    ["engage", "Engage: Select an enemy follower on the field and remove Ward from it."]
  ];
  for (const [trigger, text] of rows) {
    const sourceCard = card(`basic-${trigger}-${text.length}`, { text });
    const source = { instanceId: `src-${text.length}`, owner: 0, cardId: sourceCard.id, card: sourceCard };
    const support = getWorldsBeyondTriggerSupport(source, trigger, null, permissivePlayer());
    assert.equal(support.supported, true, `${trigger}: ${support.residual || support.text}`);
  }
});

test("printed Ward can be removed and later granted again", () => {
  const unit = { card: card("warded", { keywords: ["Ward"] }), grantedKeywords: [] };
  assert.equal(hasWorldsBeyondKeyword(unit, "Ward"), true);
  assert.equal(removeWorldsBeyondKeyword(unit, "Ward"), true);
  assert.equal(hasWorldsBeyondKeyword(unit, "Ward"), false);
  assert.equal(grantWorldsBeyondKeyword(unit, "Ward"), true);
  assert.equal(hasWorldsBeyondKeyword(unit, "Ward"), true);
});

test("public card views reflect runtime keyword grants and removals", () => {
  const game = begin();
  const unit = forceBoardFollower(game, 0, card("public-keywords", { keywords: ["Ward", "Barrier"] }));

  assert.equal(grantWorldsBeyondKeyword(unit, "Storm"), true);
  assert.equal(removeWorldsBeyondKeyword(unit, "Ward"), true);
  unit.barrierActive = false;

  const view = game.cardView(unit);
  assert.equal(view.keywords.includes("Storm"), true, "runtime grants must be visible to snapshots and events");
  assert.equal(view.keywords.includes("Ward"), false, "suppressed printed keywords must disappear from the public view");
  assert.equal(view.keywords.includes("Barrier"), false, "a consumed Barrier must not remain visible as active");
});

test("another-allied and defense-threshold target filters use live board state", () => {
  const sourceCard = card("winged", { text: "Fanfare: Select another allied follower on the field and give it +1/+1." });
  const game = begin(sourceCard);
  const source = forceBoardFollower(game, 0, sourceCard);
  const ally = forceBoardFollower(game, 0, card("ally"));
  const alliedTargets = getWorldsBeyondTargetOptions(game, { trigger: "play", playerIndex: 0, source });
  assert.deepEqual(alliedTargets.map(unit => unit.instanceId), [ally.instanceId]);

  const priestCard = card("priest", { text: "Evolve: Select an enemy follower on the field with 3 defense or less and banish it." });
  const priest = forceBoardFollower(game, 0, priestCard);
  const low = forceBoardFollower(game, 1, card("low", { defense: 3 }));
  const high = forceBoardFollower(game, 1, card("high", { defense: 4 }));
  const enemyTargets = getWorldsBeyondTargetOptions(game, { trigger: "evolve", playerIndex: 0, source: priest });
  assert.deepEqual(enemyTargets.map(unit => unit.instanceId), [low.instanceId]);
  assert.ok(!enemyTargets.some(unit => unit.instanceId === high.instanceId));
});

test("ability-driven Evo changes stats but does not activate an Evolve ability", () => {
  const sourceCard = card("ability-evo", { text: "Evolve: Restore 5 defense to your leader." });
  const game = begin(sourceCard);
  const unit = forceBoardFollower(game, 0, sourceCard);
  game.players[0].hp = 10;
  assert.equal(WORLDS_BEYOND_RULESET.evolveFollowerByAbility(game, 0, unit), true);
  assert.equal(unit.evolved, true);
  assert.equal(unit.attack, 4);
  assert.equal(unit.defense, 4);
  assert.equal(game.players[0].hp, 10);
});

test("manual Super Evo runs additive Evo + Super Evo abilities but replacement text replaces Evo", () => {
  const additiveCard = card("additive-super", {
    text: "Evolve: Restore 2 defense to your leader.\n\nSuper-Evolve: Restore 3 defense to your leader."
  });
  const additive = begin(additiveCard);
  const additiveUnit = forceBoardFollower(additive, 0, additiveCard);
  additive.players[0].hp = 10;
  additive.players[0].resources.superEvolutionAvailable = true;
  additive.players[0].resources.superEvolutionPoints = 2;
  const additiveAction = additive.listLegalActions(0).find(action => action.type === "super-evolve" && action.followerInstanceId === additiveUnit.instanceId);
  assert.ok(additiveAction);
  additive.dispatch(additiveAction);
  assert.equal(additive.players[0].hp, 15);

  const replacementCard = card("replacement-super", {
    text: "Evolve: Restore 2 defense to your leader.\n\nSuper-Evolve: Restore 4 defense instead."
  });
  const replacement = begin(replacementCard);
  const replacementUnit = forceBoardFollower(replacement, 0, replacementCard);
  replacement.players[0].hp = 10;
  replacement.players[0].resources.superEvolutionAvailable = true;
  replacement.players[0].resources.superEvolutionPoints = 2;
  const replacementAction = replacement.listLegalActions(0).find(action => action.type === "super-evolve" && action.followerInstanceId === replacementUnit.instanceId);
  assert.ok(replacementAction);
  replacement.dispatch(replacementAction);
  assert.equal(replacement.players[0].hp, 14);
});
