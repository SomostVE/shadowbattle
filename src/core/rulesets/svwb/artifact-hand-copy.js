import { BATTLE_EVENT } from "../../battle-events.js";
import { hasWorldsBeyondKeyword } from "./combat-readiness.js";
import { createWorldsBeyondExactCopyInstance } from "./generated-cards.js";
import { cardHasTrait, cardType } from "./runtime-card-state.js";
import { costOf } from "./v5/battle-engine-v5-state.js";

const CORE_SELECTION = /Select\s+(\d+)\s+Artifact followers in your hand that cost\s+(\d+)\s+or less(?:,\s*|\s+and\s+)summon an exact copy of each/i;
const DELAYED_DESTROY = /give the exact copies\s+["“]At the end of your opponent's turn, destroy this card\.["”]/i;

export function getWorldsBeyondArtifactHandCopySpec(source, textValue = null) {
  const text = String(textValue ?? source?.activeText ?? source?.card?.text ?? "");
  const match = CORE_SELECTION.exec(text);
  if (!match) return null;
  const count = Math.max(0, Number(match[1]) || 0);
  const maxCost = Math.max(0, Number(match[2]) || 0);
  if (!count) return null;
  const name = normalize(source?.card?.name);
  return {
    kind: "artifact-hand-exact-copy",
    count,
    maxCost,
    selectionMode: name === "ralmia, sonic boom" ? "available-up-to" : "exact",
    grantOpponentTurnEndDestroy: DELAYED_DESTROY.test(text),
    text: handCopyEffectText(text)
  };
}

export function getWorldsBeyondArtifactHandCopyCandidates(player, source, spec) {
  if (!spec) return [];
  return (player?.hand ?? []).filter(instance =>
    instance?.instanceId !== source?.instanceId
    && cardType(instance) === "follower"
    && cardHasTrait(instance?.card, "Artifact")
    && costOf(instance) <= spec.maxCost
  );
}

export function getWorldsBeyondArtifactHandCopySelections(player, source, spec) {
  if (!spec) return [null];
  const candidates = getWorldsBeyondArtifactHandCopyCandidates(player, source, spec);
  const selectionCount = spec.selectionMode === "available-up-to"
    ? Math.min(spec.count, candidates.length)
    : spec.count;
  if (spec.selectionMode === "exact" && candidates.length < selectionCount) return [];
  if (selectionCount === 0) return [[]];
  return combinations(candidates, selectionCount);
}

export function validateWorldsBeyondArtifactHandCopySelection(player, source, spec, selectedInstanceIds) {
  if (!spec) {
    if ((selectedInstanceIds ?? []).length) throw new Error("This action does not require an Artifact hand selection");
    return [];
  }
  const ids = Array.isArray(selectedInstanceIds) ? selectedInstanceIds : [];
  if (new Set(ids).size !== ids.length) throw new Error("Artifact hand selections must be unique");
  const candidates = getWorldsBeyondArtifactHandCopyCandidates(player, source, spec);
  const candidateById = new Map(candidates.map(item => [item.instanceId, item]));
  const required = spec.selectionMode === "available-up-to" ? Math.min(spec.count, candidates.length) : spec.count;
  if (ids.length !== required) throw new Error(`This ability requires ${required} Artifact hand selection${required === 1 ? "" : "s"}`);
  const selected = ids.map(id => candidateById.get(id) ?? null);
  if (selected.some(item => !item)) throw new Error("Selected Artifact follower is not a legal hand candidate");
  return selected;
}

export function resolveWorldsBeyondArtifactHandCopySelection(session, {
  playerIndex,
  source,
  spec,
  selectedInstanceIds = []
} = {}) {
  if (!spec) return { applied: false, summoned: [] };
  const player = session.getPlayer(playerIndex);
  const selected = validateWorldsBeyondArtifactHandCopySelection(player, source, spec, selectedInstanceIds);

  session.emit(BATTLE_EVENT.ABILITY_TRIGGER, {
    actor: playerIndex,
    payload: {
      trigger: "play",
      card: session.cardView(source),
      text: spec.text,
      originalText: spec.text,
      resolved: true,
      applied: selected.length > 0,
      handCopySelectionKind: spec.kind,
      handCopySelectionCount: selected.length,
      handCopySelectionMax: spec.count
    }
  });

  const summoned = [];
  for (const handSource of selected) {
    if (player.board.length >= session.ruleset.maxBoardSize) break;
    const copy = createWorldsBeyondExactCopyInstance(session, playerIndex, handSource);
    if (!copy) continue;
    prepareSummonedFollower(copy, session.turn);
    if (spec.grantOpponentTurnEndDestroy) copy.destroyAtOpponentTurnEnd = true;
    player.board.push(copy);
    session.emit(BATTLE_EVENT.FOLLOWER_ENTER, {
      actor: playerIndex,
      payload: {
        card: session.cardView(copy),
        position: player.board.length - 1,
        reason: "exact-copy"
      }
    });
    summoned.push(copy);
  }

  return { applied: summoned.length > 0, summoned };
}

export function stripWorldsBeyondArtifactHandCopyText(textValue) {
  const text = String(textValue ?? "");
  const specMatch = CORE_SELECTION.exec(text);
  if (!specMatch) return text;
  const start = specMatch.index;
  let end = start + specMatch[0].length;
  const tail = text.slice(end);
  const delayed = tail.match(/^\s*,?\s*and\s+give the exact copies\s+["“]At the end of your opponent's turn, destroy this card\.["”]\s*\.?/i);
  if (delayed) end += delayed[0].length;
  const cleaned = `${text.slice(0, start)} ${text.slice(end)}`
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return /^[.;,:!?]*$/.test(cleaned) ? "" : cleaned;
}

function handCopyEffectText(textValue) {
  const text = String(textValue ?? "");
  const match = CORE_SELECTION.exec(text);
  if (!match) return "";
  let value = match[0];
  const tail = text.slice((match.index ?? 0) + match[0].length);
  const delayed = tail.match(/^\s*,?\s*and\s+give the exact copies\s+["“]At the end of your opponent's turn, destroy this card\.["”]\s*\.?/i);
  if (delayed) value += delayed[0];
  return value.trim().replace(/\s+/g, " ");
}

function combinations(items, count) {
  const result = [];
  const visit = (start, picked) => {
    if (picked.length === count) {
      result.push([...picked]);
      return;
    }
    for (let index = start; index <= items.length - (count - picked.length); index += 1) {
      picked.push(items[index]);
      visit(index + 1, picked);
      picked.pop();
    }
  };
  visit(0, []);
  return result;
}

function prepareSummonedFollower(instance, turn) {
  const attack = Number(instance.card?.attack ?? 0) + Number(instance.attackBonus ?? 0);
  const defense = Number(instance.card?.defense ?? 0) + Number(instance.defenseBonus ?? 0);
  instance.attack = attack;
  instance.defense = defense;
  instance.maxDefense = defense;
  instance.playedTurn = turn;
  instance.evolved = false;
  instance.superEvolved = false;
  instance.attacksRemaining = 1;
  instance.hasAttacked = false;
  instance.canAttackFollowers = hasWorldsBeyondKeyword(instance, "Rush") || hasWorldsBeyondKeyword(instance, "Storm");
  instance.canAttackLeader = hasWorldsBeyondKeyword(instance, "Storm");
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
