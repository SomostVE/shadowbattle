import { BATTLE_EVENT } from "../../battle-events.js";
import { crestView } from "./crests.js";
import { addWorldsBeyondGeneratedCard } from "./generated-cards.js";
import { normalizeLookupValue } from "./lookup-normalization.js";
import { cardType } from "./runtime-card-state.js";

export function resolveWorldsBeyondForestCrestTurnStart(session, playerIndex, crest) {
  if (!crest || session.phase !== "main") return false;
  if (normalizeLookupValue(crest.name) !== "titania, queen of fairies") return false;

  const card = session.findCardDefinition({ name: "Fairy" });
  const result = card ? addWorldsBeyondGeneratedCard(session, playerIndex, card, { reason: "titania-crest" }) : null;
  session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
    actor: playerIndex,
    payload: {
      action: "turn-start",
      crest: crestView(crest),
      generated: Boolean(result?.added),
      generatedCard: "Fairy"
    }
  });
  return true;
}

export function resolveWorldsBeyondForestCrestTurnEnd(session, playerIndex, crest) {
  if (!crest || session.phase !== "main") return false;
  const player = session.getPlayer(playerIndex);
  const combo = Math.max(0, Number(player.cardsPlayedThisTurn) || 0);
  const name = normalizeLookupValue(crest.name);

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
    const result = card ? addWorldsBeyondGeneratedCard(session, playerIndex, card, { reason: "great-hart-crest" }) : null;
    session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
      actor: playerIndex,
      payload: {
        action: "turn-end",
        crest: crestView(crest),
        combo,
        generated: Boolean(result?.added),
        generatedCard: "Deepwood Bounty"
      }
    });
    return true;
  }

  return false;
}
