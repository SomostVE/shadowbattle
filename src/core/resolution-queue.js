export class BattleResolutionQueue {
  constructor({ maxSteps = 512 } = {}) {
    this.maxSteps = Math.max(1, Number(maxSteps) || 512);
    this.pending = [];
    this.processing = false;
    this.nextId = 0;
  }

  enqueue(label, resolver, metadata = {}) {
    if (typeof resolver !== "function") throw new Error("Battle resolution requires a resolver function");
    const entry = Object.freeze({
      id: this.nextId++,
      label: String(label ?? "resolution"),
      resolver,
      metadata: Object.freeze({ ...metadata })
    });
    this.pending.push(entry);
    return entry.id;
  }

  drain() {
    if (this.processing) return [];
    this.processing = true;
    const completed = [];
    let cursor = 0;
    let clearPending = false;

    try {
      while (cursor < this.pending.length) {
        if (cursor >= this.maxSteps) {
          clearPending = true;
          throw new Error(`Battle resolution queue exceeded ${this.maxSteps} steps`);
        }

        const entry = this.pending[cursor++];
        const result = entry.resolver();
        if (result && typeof result.then === "function") {
          clearPending = true;
          throw new Error("Battle resolution queue only accepts synchronous resolvers");
        }
        completed.push(Object.freeze({
          id: entry.id,
          label: entry.label,
          metadata: entry.metadata,
          result
        }));
      }
      this.pending.length = 0;
      return completed;
    } catch (error) {
      if (clearPending) this.pending.length = 0;
      else if (cursor > 0) this.pending.splice(0, cursor);
      throw error;
    } finally {
      this.processing = false;
    }
  }

  get size() {
    return this.pending.length;
  }

  getState() {
    return Object.freeze({
      pending: this.pending.length,
      processing: this.processing,
      nextId: this.nextId,
      maxSteps: this.maxSteps
    });
  }
}
