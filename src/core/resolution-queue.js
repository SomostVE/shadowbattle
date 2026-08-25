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
    let steps = 0;

    try {
      while (this.pending.length) {
        steps += 1;
        if (steps > this.maxSteps) {
          this.pending.length = 0;
          throw new Error(`Battle resolution queue exceeded ${this.maxSteps} steps`);
        }

        const entry = this.pending.shift();
        const result = entry.resolver();
        if (result && typeof result.then === "function") {
          this.pending.length = 0;
          throw new Error("Battle resolution queue only accepts synchronous resolvers");
        }
        completed.push(Object.freeze({
          id: entry.id,
          label: entry.label,
          metadata: entry.metadata,
          result
        }));
      }
      return completed;
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
