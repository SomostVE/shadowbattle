import { BATTLE_EVENT } from "../../battle-events.js";
import { crestView } from "./crests.js";

export function resolveWorldsBeyondForestCrestTurnStart(session, playerIndex, crest) {
  if (!crest || session.phase !== "main") return false;
  if (normalize(crest.name) !== "titania, queen of fairies") return false;

  const card = session.findCardDefinition({ name: "Fairy" });
  const generated = card ? addGeneratedCard(session, playerIndex, card, "titania-crest") : null;
  session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
    actor: playerIndex,
    payload: {
      action: "turn-start",
      crest: crestView(crest),
      generated: Boolean(generated),
      generatedCard: "Fairy"
    }
  });
  return true;
}

export function resolveWorldsBeyondForestCrestTurnEnd(session, playerIndex, crest) {
  if (!crest || session.phase !== "main") return false;
  const player = session.getPlayer(playerIndex);
  const combo = Math.max(0, Number(player.cardsPlayedThisTurn) || 0);
  const name = normalize(crest.name);

  if (name === "thestae, anathema of distortion" && combo >= 3) {
    for (const item of player.deck) {
      if (cardType(item) !== "follower") continue;
      item.attackBonus = Number(item.attackBonus ?? 0) + 1;
      item.defenseBonus = Number(item.defenseBonus ?? 0) + 1;
    }
    session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
      actor: playerIndex,
      payload: {
        action: "turn-end",
        crest: crestView(crest),
        combo,
        deckFollowerBuff: { attack: 1, defense: 1 }
      }
    });
    return true;
  }

  if (name === "great hart of the glacial realm" && combo >= 3) {
    const card = session.findCardDefinition({ name: "Deepwood Bounty" });
    const generated = card ? addGeneratedCard(session, playerIndex, card, "great-hart-crest") : null;
    session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
      actor: playerIndex,
      payload: {
        action: "turn-end",
        crest: crestView(crest),
        combo,
        generated: Boolean(generated),
        generatedCard: "Deepwood Bounty"
      }
    });
    return true;
  }

  return false;
}

function addGeneratedCard(session, playerIndex, card, reason) {
  const player = session.getPlayer(playerIndex);
  const instance = {
    instanceId: `generated:${playerIndex}:${session.eventSequence}:${String(card.id ?? card.cardId ?? card.name)}`,
    owner: playerIndex,
    cardId: card.id ?? card.cardId ?? null,
    card,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    spellboost: 0
  };

  if (player.hand.length >= session.ruleset.maxHandSize) {
    player.cemetery.push(instance);
    session.emit(BATTLE_EVENT.CARD_BURNED, {
      actor: playerIndex,
      visibility: "owner",
      payload: { card: session.cardView(instance), reason }
    });
    return null;
  }

  player.hand.push(instance);
  return instance;
}

function cardType(instance) {
  return String(instance?.card?.type ?? instance?.type ?? "").trim().toLowerCase();
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
