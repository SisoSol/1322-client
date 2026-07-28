/**
 * Minimal typed event emitter. Deliberately not built on Node's `events`
 * module so the compiled output works unmodified in both Node and
 * browser/bundler targets.
 *
 * `Events` maps an event name to the tuple of arguments its listeners
 * receive, e.g. `{ open: []; error: [Error] }`.
 */
export type EventMap = Record<string, unknown[]>;

export type Listener<Args extends unknown[]> = (...args: Args) => void;

export class TypedEmitter<Events extends EventMap> {
  private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    const set = this.listeners[event] ?? new Set();
    set.add(listener);
    this.listeners[event] = set;
    return this;
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    const wrapped: Listener<Events[K]> = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    this.listeners[event]?.delete(listener);
    return this;
  }

  removeAllListeners<K extends keyof Events>(event?: K): this {
    if (event === undefined) {
      this.listeners = {};
    } else {
      delete this.listeners[event];
    }
    return this;
  }

  listenerCount<K extends keyof Events>(event: K): number {
    return this.listeners[event]?.size ?? 0;
  }

  protected emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const set = this.listeners[event];
    if (!set || set.size === 0) return;
    // Snapshot so a listener that unsubscribes mid-emit doesn't mutate the
    // set being iterated.
    for (const listener of Array.from(set)) {
      listener(...args);
    }
  }
}
