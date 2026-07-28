import type { WebSocketLike } from "../../src/ws-connection.js";

/**
 * Minimal fake matching the `WebSocketLike` structural interface, used
 * across the test suite to exercise the reconnect engine and per-platform
 * message dispatch without any real network I/O.
 */
export class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];

  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readyState = 0;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close(code = 1000, reason = "manual"): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }

  triggerOpen(): void {
    this.readyState = 1;
    this.onopen?.(undefined);
  }

  triggerMessage(data: string): void {
    this.onmessage?.({ data });
  }

  triggerAbnormalClose(code = 1006, reason = "abnormal"): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: false });
  }

  static latest(): FakeWebSocket {
    const instance = FakeWebSocket.instances.at(-1);
    if (!instance) throw new Error("no FakeWebSocket instance created yet");
    return instance;
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }
}
