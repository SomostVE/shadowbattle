import { BATTLE_EVENT, BATTLE_VISIBILITY } from "../../battle-events.js";
import { crestView } from "./crests.js";

export function resolveWorldsBeyondSwordCrestTurnEnd(session, playerIndex, crest) {
  if (!crest || session.phase !== "main" || normalize(crest.name) !== "unkei, goldbloom") return false;
  const definition = session.findCardDefinition({ name: "Glittering Gold" });
  const generated = definition ? addGeneratedCard(session, playerIndex, definition) : false;

  session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
    actor: playerIndex,
    payload: {
      action: "turn-end",
      crest: crestView(crest),
      generated,
      generatedCard: "Glittering Gold"
    }
  });
  return true;
}

function addGeneratedCard(session, playerIndex, card) {
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
      visibility: BATTLE_VISIBILITY.OWNER,
      payload: { card: session.cardView(instance), reason: "unkei-crest" }
    });
    return false;
  }
  player.hand.push(instance);
  return true;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
