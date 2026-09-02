import { BATTLE_EVENT } from "../../battle-events.js";
import { effectiveCardType } from "./runtime-card-state.js";

const OPTIONAL_ALLIED_CARD = /Select another allied card on the field\.\s*If you selected one,\s*destroy it and\s*(?:(deal)\s+(\d+)\s+damage to a random enemy follower|(draw)\s+(\d+)\s+cards?)\.?/i;

export function getWorldsBeyondOptionalAlliedCardSpec(source, textValue = null) {
  const text = String(textValue ?? source?.activeText ?? source?.card?.text ?? "");
  const match = OPTIONAL_ALLIED_CARD.exec(text);
  if (!match) return null;
  const damage = Boolean(match[1]);
  return {
    kind: "optional-allied-card-destroy",
    optional: true,
    excludeSource: true,
    followUpKind: damage ? "random-enemy-follower-damage" : "draw",
    amount: Math.max(0, Number(damage ? match[2] : match[4]) || 0),
    text: match[0].trim()
  };
}

export function getWorldsBeyondOptionalAlliedCardOptions(player, source, spec) {
  if (!spec) return [null];
  return [
    null,
    ...(player?.board ?? []).filter(card => !spec.excludeSource || card.instanceId !== source?.instanceId)
  ];
}

export function validateWorldsBeyondOptionalAlliedCardSelection(player, source, spec, targetInstanceId) {
  if (!spec) {
    if (targetInstanceId) throw new Error("This action does not require an optional allied-card selection");
    return null;
  }
  if (!targetInstanceId) return null;
  const target = (player?.board ?? []).find(card =>
    card.instanceId === targetInstanceId
    && (!spec.excludeSource || card.instanceId !== source?.instanceId)
  ) ?? null;
  if (!target) throw new Error("Selected allied card is not a legal optional target");
  return target;
}

export function resolveWorldsBeyondOptionalAlliedCardSelection(session, {
  playerIndex,
  source,
  spec,
  targetInstanceId = null,
  trigger = "play",
  destroyFollower = null,
  destroyAmulet = null
} = {}) {
  if (!spec) return { applied: false, selected: false, target: null };
  const player = session.getPlayer(playerIndex);
  const target = validateWorldsBeyondOptionalAlliedCardSelection(player, source, spec, targetInstanceId);

  session.emit(BATTLE_EVENT.ABILITY_TRIGGER, {
    actor: playerIndex,
    payload: {
      trigger,
      card: session.cardView(source),
      text: spec.text,
      originalText: spec.text,
      resolved: true,
      applied: Boolean(target),
      target: target ? session.cardView(target) : null,
      targetKind: spec.kind,
      targetSide: "allied",
      targetRequired: false,
      targetAvailable: getWorldsBeyondOptionalAlliedCardOptions(player, source, spec).length > 1,
      targetSkipped: !target
    }
  });

  if (!target) return { applied: false, selected: false, target: null };

  if (effectiveCardType(target) === "follower") {
    destroyFollower?.(session, playerIndex, target.instanceId, {
      actor: playerIndex,
      source,
      reason: "optional-allied-card-selection",
      byAbility: true,
      abilityDestroy: true
    });
  } else if (effectiveCardType(target) === "amulet") {
    destroyAmulet?.(session, playerIndex, target.instanceId, {
      actor: playerIndex,
      source,
      reason: "optional-allied-card-selection"
    });
  }

  if (spec.followUpKind === "draw") {
    session.draw(playerIndex, spec.amount, { reason: "optional-allied-card-selection" });
  } else if (spec.followUpKind === "random-enemy-follower-damage") {
    damageRandomEnemyFollower(session, playerIndex, source, spec.amount, destroyFollower);
  }

  return { applied: true, selected: true, target };
}

export function stripWorldsBeyondOptionalAlliedCardText(textValue) {
  const text = String(textValue ?? "");
  if (!OPTIONAL_ALLIED_CARD.test(text)) return text;
  OPTIONAL_ALLIED_CARD.lastIndex = 0;
  const cleaned = text.replace(OPTIONAL_ALLIED_CARD, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return /^[.;,:!?]*$/.test(cleaned) ? "" : cleaned;
}

function damageRandomEnemyFollower(session, playerIndex, source, amount, destroyFollower) {
  const enemyIndex = 1 - playerIndex;
  const followers = session.getPlayer(enemyIndex).board.filter(card => effectiveCardType(card) === "follower");
  if (!followers.length || amount <= 0) return false;
  const target = followers[Math.floor(session.rng() * followers.length)] ?? followers[0];
  session.damageFollower(enemyIndex, target.instanceId, amount, {
    actor: playerIndex,
    source,
    reason: "optional-allied-card-selection",
    resolveDeath: false
  });
  const live = session.findBoardCard(enemyIndex, target.instanceId);
  if (live && Number(live.defense ?? 0) <= 0) {
    destroyFollower?.(session, enemyIndex, live.instanceId, {
      actor: playerIndex,
      source,
      reason: "optional-allied-card-selection",
      byAbility: true
    });
  }
  return true;
}
