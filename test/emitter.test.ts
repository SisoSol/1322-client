import { describe, expect, it, vi } from "vitest";
import { TypedEmitter, type EventMap } from "../src/emitter.js";

interface TestEvents extends EventMap {
  greet: [name: string];
  ping: [];
}

class Emitter extends TypedEmitter<TestEvents> {
  fire<K extends keyof TestEvents>(event: K, ...args: TestEvents[K]): void {
    this.emit(event, ...args);
  }
}

describe("TypedEmitter", () => {
  it("calls listeners registered with on()", () => {
    const emitter = new Emitter();
    const spy = vi.fn();
    emitter.on("greet", spy);
    emitter.fire("greet", "world");
    expect(spy).toHaveBeenCalledWith("world");
  });

  it("calls a once() listener exactly one time", () => {
    const emitter = new Emitter();
    const spy = vi.fn();
    emitter.once("greet", spy);
    emitter.fire("greet", "a");
    emitter.fire("greet", "b");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("a");
  });

  it("stops calling a listener after off()", () => {
    const emitter = new Emitter();
    const spy = vi.fn();
    emitter.on("ping", spy);
    emitter.off("ping", spy);
    emitter.fire("ping");
    expect(spy).not.toHaveBeenCalled();
  });

  it("supports multiple independent listeners per event", () => {
    const emitter = new Emitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on("ping", a);
    emitter.on("ping", b);
    emitter.fire("ping");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("removeAllListeners(event) clears only that event", () => {
    const emitter = new Emitter();
    const greetSpy = vi.fn();
    const pingSpy = vi.fn();
    emitter.on("greet", greetSpy);
    emitter.on("ping", pingSpy);
    emitter.removeAllListeners("greet");
    emitter.fire("greet", "x");
    emitter.fire("ping");
    expect(greetSpy).not.toHaveBeenCalled();
    expect(pingSpy).toHaveBeenCalledTimes(1);
  });

  it("listenerCount reflects registrations and removals", () => {
    const emitter = new Emitter();
    expect(emitter.listenerCount("ping")).toBe(0);
    const spy = vi.fn();
    emitter.on("ping", spy);
    expect(emitter.listenerCount("ping")).toBe(1);
    emitter.off("ping", spy);
    expect(emitter.listenerCount("ping")).toBe(0);
  });

  it("a listener unsubscribing itself mid-emit does not break the current emit pass", () => {
    const emitter = new Emitter();
    const calls: string[] = [];
    const self: (name: string) => void = (name) => {
      calls.push(`self:${name}`);
      emitter.off("greet", self);
    };
    const other = (name: string) => calls.push(`other:${name}`);
    emitter.on("greet", self);
    emitter.on("greet", other);
    emitter.fire("greet", "1");
    expect(calls).toEqual(["self:1", "other:1"]);
    emitter.fire("greet", "2");
    expect(calls).toEqual(["self:1", "other:1", "other:2"]);
  });
});
