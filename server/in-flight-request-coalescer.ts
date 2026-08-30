export class InFlightRequestCoalescer<Key, Value> {
  private readonly requests = new Map<Key, Promise<Value>>();

  run(key: Key, load: () => Promise<Value>): Promise<Value> {
    const existing = this.requests.get(key);
    if (existing) return existing;

    const pending = Promise.resolve().then(load);
    this.requests.set(key, pending);

    void pending
      .finally(() => {
        if (this.requests.get(key) === pending) {
          this.requests.delete(key);
        }
      })
      .catch(() => undefined);

    return pending;
  }
}
