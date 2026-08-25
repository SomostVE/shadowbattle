const EFFECT_COMMAND_LOGS = new WeakMap();

export function createEffectCommand(type, payload = {}, metadata = {}) {
  const normalizedType = String(type ?? "").trim();
  if (!normalizedType) throw new Error("Effect command requires a type");
  if (!isRecord(payload)) throw new Error("Effect command payload must be an object");
  if (!isRecord(metadata)) throw new Error("Effect command metadata must be an object");
  return deepFreeze({
    type: normalizedType,
    payload: { ...payload },
    metadata: { ...metadata }
  });
}

export function isEffectCommand(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.type === "string" &&
    value.type.trim() &&
    isRecord(value.payload) &&
    isRecord(value.metadata)
  );
}

export function resolveEffectCommands(session, commands = []) {
  if (!Array.isArray(commands)) throw new Error("Effect commands must be an array");
  if (!commands.length) return [];
  if (!session?.resolutionQueue) throw new Error("Effect commands require a GameSession resolution queue");
  if (typeof session.ruleset?.resolveEffectCommand !== "function") {
    throw new Error(`Ruleset ${session?.ruleset?.id ?? "unknown"} does not resolve effect commands`);
  }

  const results = [];
  for (const command of commands) {
    if (!isEffectCommand(command)) throw new Error("Invalid effect command");
    recordEffectCommand(session, command);
    const id = session.resolutionQueue.enqueue(
      `effect:${command.type}`,
      () => session.ruleset.resolveEffectCommand(session, command),
      { effectType: command.type, ...command.metadata }
    );
    const completed = session.resolutionQueue.drain();
    const resolved = completed.find(entry => entry.id === id);
    results.push(resolved?.result ?? null);
  }
  return results;
}

export function getEffectCommandLog(session) {
  return [...(EFFECT_COMMAND_LOGS.get(session) ?? [])];
}

function recordEffectCommand(session, command) {
  const log = EFFECT_COMMAND_LOGS.get(session) ?? [];
  const entry = deepFreeze({
    sequence: log.length,
    turn: Number(session?.turn ?? 0),
    eventSequence: Number(session?.eventSequence ?? 0),
    command
  });
  log.push(entry);
  EFFECT_COMMAND_LOGS.set(session, log);
  return entry;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
