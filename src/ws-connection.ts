import { computeBackoffDelay, resolveReconnectOptions, type ReconnectOptions } from "./reconnect.js";

/**
 * Structural subset of the browser `WebSocket` / `ws` package client APIs
 * that this package actually uses. Using property-assignment handlers
 * (`onopen =`, not `addEventListener`) keeps this compatible with both
 * without an adapter layer, since both implementations support it.
 */
export interface WebSocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  readyState: number;
  close(code?: number, reason?: string): void;
}

export type WebSocketCtor = new (url: string) => WebSocketLike;

let cachedWsModuleCtor: WebSocketCtor | undefined;

/**
 * Resolves the WebSocket constructor to use: an explicitly injected one
 * (tests, custom transports), then the platform global (browsers, and
 * Node versions that expose one), then a lazy `import("ws")` for Node
 * runtimes that don't have a global WebSocket (Node 18/20 without the
 * experimental flag). The dynamic import means bundlers targeting the
 * browser never need to resolve the `ws` package at all.
 */
export async function resolveWebSocketImpl(explicit?: WebSocketCtor): Promise<WebSocketCtor> {
  if (explicit) return explicit;

  const globalCtor = (globalThis as { WebSocket?: unknown }).WebSocket;
  if (typeof globalCtor === "function") {
    return globalCtor as unknown as WebSocketCtor;
  }

  if (!cachedWsModuleCtor) {
    const mod = await import("ws");
    cachedWsModuleCtor = (mod.default ?? mod) as unknown as WebSocketCtor;
  }
  return cachedWsModuleCtor;
}

export interface WsEngineOptions {
  /** Produces the URL to connect (or reconnect) to. Called before every attempt. */
  resolveUrl: () => Promise<string> | string;
  WebSocketImpl?: WebSocketCtor;
  reconnect?: Partial<ReconnectOptions>;
  onOpen?: () => void;
  onMessage: (data: string) => void;
  onClose?: (info: { code: number; reason: string; wasClean: boolean }) => void;
  onError?: (error: Error) => void;
  onReconnecting?: (info: { attempt: number; delayMs: number }) => void;
}

/**
 * Resilient WebSocket connection with the exponential-backoff reconnect
 * documented at https://1322.io/docs. Handles exactly one logical
 * connection; platforms that need two simultaneous streams (X hybrid tier)
 * run two instances.
 */
export class WsConnectionEngine {
  private readonly opts: WsEngineOptions;
  private readonly reconnectOpts: ReconnectOptions;
  private socket: WebSocketLike | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private everOpened = false;

  constructor(opts: WsEngineOptions) {
    this.opts = opts;
    this.reconnectOpts = resolveReconnectOptions(opts.reconnect);
  }

  /**
   * Connects, resolving once the socket has opened for the first time.
   * Rejects only if the very first attempt fails (bad URL, connection
   * refused, etc.) -- once a connection has been established at least once,
   * later drops are retried in the background per the reconnect policy and
   * never reject a promise (there is nothing to reject; the caller isn't
   * awaiting them).
   */
  connect(): Promise<void> {
    this.closedByUser = false;
    if (this.everOpened) {
      // Already connected (or reconnecting) from an earlier call; no-op.
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.attemptConnect(resolve, reject);
    });
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close(1000, "client disconnect");
    this.socket = null;
  }

  isConnected(): boolean {
    // 1 === WebSocket.OPEN in both the browser and `ws`.
    return this.socket !== null && this.socket.readyState === 1;
  }

  private async attemptConnect(
    firstConnectResolve?: () => void,
    firstConnectReject?: (err: Error) => void
  ): Promise<void> {
    let url: string;
    try {
      url = await this.opts.resolveUrl();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.opts.onError?.(error);
      if (firstConnectReject && !this.everOpened) {
        firstConnectReject(error);
        return;
      }
      this.scheduleReconnect();
      return;
    }

    let Ctor: WebSocketCtor;
    try {
      Ctor = await resolveWebSocketImpl(this.opts.WebSocketImpl);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.opts.onError?.(error);
      if (firstConnectReject && !this.everOpened) {
        firstConnectReject(error);
        return;
      }
      this.scheduleReconnect();
      return;
    }

    if (this.closedByUser) return;

    const socket = new Ctor(url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.everOpened = true;
      this.opts.onOpen?.();
      firstConnectResolve?.();
    };

    socket.onmessage = (event) => {
      const data = typeof event.data === "string" ? event.data : String(event.data);
      this.opts.onMessage(data);
    };

    socket.onerror = () => {
      // Browser/`ws` error events carry little structured info; the
      // subsequent onclose is what actually drives reconnect decisions.
      this.opts.onError?.(new Error("WebSocket error"));
    };

    socket.onclose = (event) => {
      this.socket = null;
      this.opts.onClose?.(event);

      if (this.closedByUser) return;

      if (!this.everOpened && firstConnectReject) {
        firstConnectReject(new Error(`WebSocket closed before opening (code ${event.code}: ${event.reason || "no reason"})`));
        return;
      }

      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || !this.reconnectOpts.enabled) return;

    const delayMs = computeBackoffDelay(this.attempt, this.reconnectOpts);
    this.opts.onReconnecting?.({ attempt: this.attempt, delayMs });
    this.attempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.attemptConnect();
    }, delayMs);
  }
}
