import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WsConnectionEngine, type WebSocketCtor } from "../src/ws-connection.js";
import { FakeWebSocket } from "./fixtures/fake-ws.js";

const latest = FakeWebSocket.latest;

describe("WsConnectionEngine", () => {
  beforeEach(() => {
    FakeWebSocket.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeEngine(overrides: Partial<ConstructorParameters<typeof WsConnectionEngine>[0]> = {}) {
    const events: { open: number; close: unknown[]; reconnecting: { attempt: number; delayMs: number }[]; messages: string[] } = {
      open: 0,
      close: [],
      reconnecting: [],
      messages: [],
    };
    const engine = new WsConnectionEngine({
      resolveUrl: () => "wss://example.test/stream",
      WebSocketImpl: FakeWebSocket as unknown as WebSocketCtor,
      onOpen: () => {
        events.open += 1;
      },
      onClose: (info) => {
        events.close.push(info);
      },
      onReconnecting: (info) => {
        events.reconnecting.push(info);
      },
      onMessage: (data) => {
        events.messages.push(data);
      },
      ...overrides,
    });
    return { engine, events };
  }

  it("resolves connect() once the socket opens", async () => {
    const { engine, events } = makeEngine();
    const connectPromise = engine.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().triggerOpen();
    await connectPromise;
    expect(events.open).toBe(1);
    expect(engine.isConnected()).toBe(true);
  });

  it("rejects connect() if the first attempt closes before ever opening", async () => {
    const { engine } = makeEngine();
    const connectPromise = engine.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().triggerAbnormalClose(1006, "connection refused");
    await expect(connectPromise).rejects.toThrow(/closed before opening/);
  });

  it("delivers messages through onMessage", async () => {
    const { engine, events } = makeEngine();
    const connectPromise = engine.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().triggerOpen();
    await connectPromise;

    latest().triggerMessage('{"hello":"world"}');
    expect(events.messages).toEqual(['{"hello":"world"}']);
  });

  it("schedules a reconnect with the documented backoff after an unexpected close", async () => {
    const { engine, events } = makeEngine();
    const connectPromise = engine.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().triggerOpen();
    await connectPromise;

    latest().triggerAbnormalClose();
    expect(events.reconnecting).toEqual([{ attempt: 0, delayMs: 1000 }]);
    expect(FakeWebSocket.instances).toHaveLength(1); // no new socket yet, still waiting out the delay

    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2); // reconnect attempt fired
  });

  it("increases the delay per consecutive failed attempt, then resets after a successful reopen", async () => {
    const { engine, events } = makeEngine();
    const connectPromise = engine.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().triggerOpen();
    await connectPromise;

    // First drop -> reconnect attempt 0 (1s), fails again immediately.
    latest().triggerAbnormalClose();
    await vi.advanceTimersByTimeAsync(1000);
    latest().triggerAbnormalClose();

    // Second attempt -> attempt 1 (2s), this time it succeeds.
    await vi.advanceTimersByTimeAsync(2000);
    latest().triggerOpen();

    expect(events.reconnecting.map((r) => r.delayMs)).toEqual([1000, 2000]);

    // A later drop should restart the backoff from attempt 0, not continue at 4s.
    latest().triggerAbnormalClose();
    expect(events.reconnecting.at(-1)).toEqual({ attempt: 0, delayMs: 1000 });
  });

  it("does not reconnect after a manual disconnect()", async () => {
    const { engine, events } = makeEngine();
    const connectPromise = engine.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().triggerOpen();
    await connectPromise;

    engine.disconnect();
    expect(events.reconnecting).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(engine.isConnected()).toBe(false);
  });

  it("does not reconnect when reconnect.enabled is false", async () => {
    const { engine, events } = makeEngine({ reconnect: { enabled: false } });
    const connectPromise = engine.connect();
    await vi.advanceTimersByTimeAsync(0);
    latest().triggerOpen();
    await connectPromise;

    latest().triggerAbnormalClose();
    expect(events.reconnecting).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
