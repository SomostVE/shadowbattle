import { BATTLE_EVENT } from "../../battle-events.js";
import { assertWorldsBeyondMainActor } from "./action-guards.js";

const MAX_FUSE_MATERIALS = 4;

export function getWorldsBeyondFuseActions(session, playerIndex) {
  if (session.phase !== "main" || session.activePlayer !== playerIndex || session.winner != null) return [];
  const player = session.getPlayer(playerIndex);
  const actions = [];

  for (const target of player.hand) {
    const requirement = getWorldsBeyondFuseRequirement(target);
    if (!requirement || target.fusedThisTurn) continue;
    const eligible = player.hand.filter(material => isWorldsBeyondFuseMaterial(target, material));
    for (const materials of candidateMaterialSets(target, eligible)) {
      if (!materials.length) continue;
      actions.push({
        type: "fuse",
        player: playerIndex,
        targetInstanceId: target.instanceId,
        materialInstanceIds: materials.map(item => item.instanceId),
        materialNames: materials.map(item => item.card?.name ?? null),
        requirement,
        projectedTransform: projectedTransformName(target, materials)
      });
    }
  }

  return actions;
}

export function resolveWorldsBeyondFuse(session, action, { afterMaterials = null } = {}) {
  const playerIndex = assertWorldsBeyondMainActor(session, action.player);
  const player = session.getPlayer(playerIndex);
  const target = player.hand.find(item => item.instanceId === action.targetInstanceId);
  if (!target) throw new Error("Fuse target is not in the active player's hand");
  if (!getWorldsBeyondFuseRequirement(target)) throw new Error("Selected card has no Fuse ability");
  if (target.fusedThisTurn) throw new Error("This Fuse card has already Fused this turn");

  const requestedIds = Array.isArray(action.materialInstanceIds) ? action.materialInstanceIds : [];
  if (!requestedIds.length) throw new Error("Fuse requires at least one material");
  if (new Set(requestedIds).size !== requestedIds.length) throw new Error("Fuse materials must be unique");
  if (requestedIds.includes(target.instanceId)) throw new Error("A Fuse card cannot Fuse to itself");

  const materials = requestedIds.map(instanceId => player.hand.find(item => item.instanceId === instanceId) ?? null);
  if (materials.some(item => !item)) throw new Error("A Fuse material is no longer in hand");
  const legal = candidateMaterialSets(target, player.hand.filter(item => isWorldsBeyondFuseMaterial(target, item)));
  if (!legal.some(set => sameMaterialSet(set, materials))) throw new Error("Selected Fuse material combination is not legal");

  const nextName = projectedTransformName(target, materials);
  const nextCard = nextName ? session.findCardDefinition({ name: nextName }) : null;
  if (nextName && !nextCard) throw new Error(`Fuse transformation card is missing from the local catalog: ${nextName}`);

  const before = session.cardView(target);
  const beforeName = target.card?.name ?? "Card";
  const materialViews = materials.map(item => session.cardView(item));
  const materialIds = new Set(materials.map(item => item.instanceId));
  player.hand = player.hand.filter(item => !materialIds.has(item.instanceId));
  player.fusedCards.push(...materials);

  target.fusedThisTurn = true;
  target.fusedCards = [...(target.fusedCards ?? []), ...materials.map(materialSummary)];
  target.fusedNames = [...new Set([...(target.fusedNames ?? []), ...materials.map(item => item.card?.name).filter(Boolean)])];
  target.x = target.fusedNames.length;

  session.emit(BATTLE_EVENT.FUSE, {
    actor: playerIndex,
    payload: {
      target: before,
      materials: materialViews,
      materialCount: materials.length,
      fusedZoneCount: player.fusedCards.length
    }
  });

  if (typeof afterMaterials === "function") afterMaterials({ session, playerIndex, target, materials });

  let transformed = false;
  let afterName = beforeName;
  if (nextCard) {
    transformHandInstance(target, nextCard);
    transformed = true;
    afterName = nextCard.name ?? nextName;
    session.emit(BATTLE_EVENT.CARD_TRANSFORM, {
      actor: playerIndex,
      payload: {
        before,
        after: session.cardView(target),
        reason: "fuse"
      }
    });
  }

  return {
    playerIndex,
    target,
    materials,
    transformed,
    beforeName,
    afterName,
    snapshot: session.getSnapshot(playerIndex)
  };
}

export function getWorldsBeyondFuseRequirement(instance) {
  const match = String(instance?.card?.text ?? "").match(/^\s*Fuse\s*:\s*([^\n]+)/im);
  return match ? match[1].trim() : "";
}

export function isWorldsBeyondFuseMaterial(target, material) {
  if (!target || !material || target.instanceId === material.instanceId) return false;
  const requirement = normalize(getWorldsBeyondFuseRequirement(target));
  const card = material.card;
  if (!requirement || !card) return false;
  if (requirement === "forestcraft cards") return normalize(card.class) === "forestcraft";
  if (requirement === "artifact amulets") return normalize(card.type) === "amulet" && hasTrait(card, "Artifact");
  if (requirement === "artifact cards") return hasTrait(card, "Artifact");
  if (requirement === "loot cards") return hasTrait(card, "Loot");
  if (requirement.includes("ominous artifact β") || requirement.includes("ominous artifact γ")) {
    const name = normalize(card.name);
    return name === "ominous artifact β" || name === "ominous artifact γ";
  }
  return false;
}

export function preprocessWorldsBeyondFuseText(source, textValue) {
  let text = String(textValue ?? "");
  const name = normalize(source?.card?.name);
  const fusedCards = source?.fusedCards ?? [];
  const fusedNames = source?.fusedNames ?? [];
  const hasFused = fusedCards.length > 0 || fusedNames.length > 0;

  if (name === "garden's allure") {
    text = text.replace(
      /Draw a card\.\s*If you've Fused to this card, draw 2 instead\.?/i,
      hasFused ? "Draw 2 cards." : "Draw a card."
    );
  }

  if (name === "returning slash") {
    text = text.replace(
      /If you've Fused to this card, draw a card\.?/i,
      hasFused ? "Draw a card." : ""
    );
  }

  if (name === "sinciro, heir to usurpation") {
    const x = new Set(fusedNames.map(normalize)).size;
    text = text.replace(
      /Deal X damage to all enemies\.\s*X is the number of differently named cards Fused to this card\.?/i,
      x > 0 ? `Deal ${x} damage to all enemy followers. Deal ${x} damage to the enemy leader.` : ""
    );
    text = text.replace(
      /Replicate the effects of this card'?s Fanfare ability\.?/i,
      x > 0 ? `Deal ${x} damage to all enemy followers. Deal ${x} damage to the enemy leader.` : ""
    );
  }

  return text.replace(/\s{2,}/g, " ").trim();
}

export function hasWorldsBeyondTrait(card, trait) {
  return hasTrait(card, trait);
}

function candidateMaterialSets(target, eligible) {
  if (!eligible.length) return [];
  const name = normalize(target.card?.name);
  if (["gear of ambition", "gear of remembrance", "garden's allure", "returning slash"].includes(name)) {
    return eligible.map(item => [item]);
  }

  if (name === "ominous artifact α") {
    const fused = new Set((target.fusedNames ?? []).map(normalize));
    const beta = eligible.filter(item => normalize(item.card?.name) === "ominous artifact β" && !fused.has("ominous artifact β"));
    const gamma = eligible.filter(item => normalize(item.card?.name) === "ominous artifact γ" && !fused.has("ominous artifact γ"));
    const sets = [...beta.map(item => [item]), ...gamma.map(item => [item])];
    if (beta.length && gamma.length) sets.push([beta[0], gamma[0]]);
    return sets;
  }

  return enumerateSubsets(eligible, MAX_FUSE_MATERIALS);
}

function enumerateSubsets(items, maxSize) {
  const source = items.slice(0, 8);
  const out = [];
  const limit = 1 << source.length;
  for (let mask = 1; mask < limit; mask += 1) {
    const subset = [];
    for (let index = 0; index < source.length; index += 1) {
      if (mask & (1 << index)) subset.push(source[index]);
    }
    if (subset.length <= maxSize) out.push(subset);
  }
  return out;
}

function projectedTransformName(target, materials) {
  const name = normalize(target.card?.name);
  if (name === "gear of ambition") return "Striker Artifact";
  if (name === "gear of remembrance") return "Fortifier Artifact";
  if (name === "striker artifact" || name === "fortifier artifact") {
    const total = materials.reduce((sum, item) => sum + Math.max(0, Number(item.card?.cost) || 0), 0);
    return total <= 1 ? "Ominous Artifact α" : total === 2 ? "Ominous Artifact β" : "Ominous Artifact γ";
  }
  if (name === "ominous artifact α") {
    const names = new Set([...(target.fusedNames ?? []).map(normalize), ...materials.map(item => normalize(item.card?.name))]);
    if (names.has("ominous artifact β") && names.has("ominous artifact γ")) return "Masterwork Artifact Ω";
  }
  return null;
}

function transformHandInstance(instance, nextCard) {
  instance.card = nextCard;
  instance.cardId = nextCard.id ?? nextCard.cardId ?? instance.cardId;
  instance.spellboost = 0;
  instance.costDelta = 0;
  instance.attackBonus = 0;
  instance.defenseBonus = 0;
  instance.skyboundEvolutions = 0;
  instance.fusedCards = [];
  instance.fusedNames = [];
  instance.fusedThisTurn = false;
  instance.x = initialX(nextCard);
  delete instance.activeText;
  delete instance.alternativeMode;
  delete instance.originalCard;
}

function materialSummary(item) {
  return {
    id: item.card?.id ?? item.cardId ?? null,
    name: item.card?.name ?? null,
    cost: Number(item.card?.cost) || 0,
    class: item.card?.class ?? null,
    type: item.card?.type ?? null,
    traits: [...(item.card?.traits ?? [])]
  };
}

function sameMaterialSet(left, right) {
  if (left.length !== right.length) return false;
  const a = left.map(item => item.instanceId).sort();
  const b = right.map(item => item.instanceId).sort();
  return a.every((value, index) => value === b[index]);
}

function initialX(card) {
  const match = String(card?.text ?? "").match(/X starts at\s*(-?\d+)/i);
  return match ? Number(match[1]) : 0;
}

function hasTrait(card, trait) {
  const wanted = normalize(trait);
  return (card?.traits ?? []).some(value => normalize(value) === wanted);
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
