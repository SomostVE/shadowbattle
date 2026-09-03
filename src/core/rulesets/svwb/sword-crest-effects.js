import { BATTLE_EVENT } from "../../battle-events.js";
import { crestView } from "./crests.js";
import { addWorldsBeyondGeneratedCard } from "./generated-cards.js";
import { normalizeLookupValue } from "./lookup-normalization.js";

export function resolveWorldsBeyondSwordCrestTurnEnd(session, playerIndex, crest) {
  if (!crest || session.phase !== "main" || normalizeLookupValue(crest.name) !== "unkei, goldbloom") return false;
  const definition = session.findCardDefinition({ name: "Glittering Gold" });
  const result = definition ? addWorldsBeyondGeneratedCard(session, playerIndex, definition, { reason: "unkei-crest" }) : null;

  session.emit(BATTLE_EVENT.CREST_ACTIVATE, {
    actor: playerIndex,
    payload: {
      action: "turn-end",
      crest: crestView(crest),
      generated: Boolean(result?.added),
      generatedCard: "Glittering Gold"
    }
  });
  return true;
}
