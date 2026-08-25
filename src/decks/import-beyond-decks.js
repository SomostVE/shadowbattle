import { GAME_IDS } from "../core/game-catalog.js";
import { createDeckRecord } from "./storage.js";

export const BEYOND_DECKS_WORKSPACE_KEY = "shadowverse-deck-assistant:v2";

export function importBeyondDeckExport(payload, { name = "Imported Beyond Decks deck" } = {}) {
  if (!payload || typeof payload !== "object") throw new Error("Beyond Decks import must be a JSON object");
  if (!Array.isArray(payload.deck)) throw new Error("Beyond Decks export is missing deck entries");
  return createDeckRecord({
    gameId: GAME_IDS.WORLDS_BEYOND,
    name,
    craft: payload.class ?? null,
    format: payload.format ?? "Unlimited",
    includeNeutral: payload.includeNeutral ?? true,
    entries: payload.deck,
    marks: payload.marks ?? payload.deckMarks ?? [],
    source: `beyond-decks-export-v${payload.version ?? "unknown"}`,
    savedAt: payload.exportedAt ?? new Date().toISOString()
  });
}

export function importBeyondDecksWorkspace(workspace, { includeCurrent = true } = {}) {
  if (!workspace || typeof workspace !== "object") throw new Error("Beyond Decks workspace is invalid");
  const results = [];
  const preferences = workspace.preferences ?? {};

  if (includeCurrent && Array.isArray(workspace.deck) && workspace.deck.length) {
    results.push(createDeckRecord({
      gameId: GAME_IDS.WORLDS_BEYOND,
      name: "Beyond Decks · Current",
      craft: preferences.selectedClass ?? null,
      format: preferences.format ?? "Unlimited",
      includeNeutral: preferences.includeNeutral ?? true,
      entries: workspace.deck,
      marks: workspace.deckMarks ?? [],
      source: "beyond-decks-local-workspace"
    }));
  }

  for (const [fallbackName, variant] of Object.entries(workspace.savedDecks ?? {})) {
    if (!variant || !Array.isArray(variant.deck)) continue;
    results.push(createDeckRecord({
      gameId: GAME_IDS.WORLDS_BEYOND,
      name: variant.name ?? fallbackName,
      craft: variant.class ?? preferences.selectedClass ?? null,
      format: variant.format ?? preferences.format ?? "Unlimited",
      includeNeutral: variant.includeNeutral ?? preferences.includeNeutral ?? true,
      entries: variant.deck,
      marks: variant.marks ?? [],
      source: "beyond-decks-local-saved-deck",
      savedAt: variant.savedAt ?? new Date().toISOString()
    }));
  }

  return results;
}

export function readBeyondDecksLocalWorkspace(storage = globalThis.localStorage) {
  if (!storage?.getItem) return null;
  const raw = storage.getItem(BEYOND_DECKS_WORKSPACE_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}
