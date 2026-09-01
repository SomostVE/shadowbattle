import { BATTLE_EVENT } from "../../battle-events.js";
import { hasWorldsBeyondTrait } from "./fuse.js";

export function accountWorldsBeyondFollowerEntryHistory(session, event) {
  if (!session || event?.type !== BATTLE_EVENT.FOLLOWER_ENTER) return false;
  const owner = Number(event.actor);
  if (owner !== 0 && owner !== 1) return false;

  const view = event.payload?.card ?? {};
  const definition = session.findCardDefinition({ id: view.cardId ?? null })
    ?? session.findCardDefinition({ name: view.name ?? null });
  if (!definition || normalize(definition.type) !== "follower" || !hasWorldsBeyondTrait(definition, "Artifact")) return false;

  const name = String(definition.name ?? view.name ?? "").trim();
  if (!name) return false;
  const player = session.getPlayer(owner);
  if (!player.resources) player.resources = {};
  const history = Array.isArray(player.resources.artifactFollowerNamesEntered)
    ? player.resources.artifactFollowerNamesEntered
    : [];
  const wanted = normalize(name);
  if (history.some(value => normalize(value) === wanted)) {
    player.resources.artifactFollowerNamesEntered = history;
    return false;
  }

  player.resources.artifactFollowerNamesEntered = [...history, name];
  return true;
}

export function getWorldsBeyondDestroyedFollowerOccurrences(session, playerIndex) {
  const owner = Number(playerIndex);
  if (owner !== 0 && owner !== 1) return [];
  const occurrences = [];
  for (const event of session?.events ?? []) {
    if (event?.type !== BATTLE_EVENT.FOLLOWER_DESTROYED) continue;
    if (Number(event.payload?.owner) !== owner) continue;
    const view = event.payload?.card ?? {};
    const definition = session.findCardDefinition({ id: view.cardId ?? null })
      ?? session.findCardDefinition({ name: view.name ?? null });
    if (!definition || normalize(definition.type) !== "follower") continue;
    occurrences.push({
      event,
      definition,
      baseCost: Math.max(0, Number(definition.cost) || 0),
      name: String(definition.name ?? view.name ?? "").trim()
    });
  }
  return occurrences;
}

export function countWorldsBeyondDifferentlyNamedArtifactEntries(player) {
  const names = Array.isArray(player?.resources?.artifactFollowerNamesEntered)
    ? player.resources.artifactFollowerNamesEntered
    : [];
  return new Set(names.map(normalize).filter(Boolean)).size;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
