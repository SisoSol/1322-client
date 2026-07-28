import type { ReconnectOptions } from "./reconnect.js";
import type { WebSocketCtor } from "./ws-connection.js";
import type { FetchLike } from "./http.js";
import type { EventMap } from "./emitter.js";
import { TypedEmitter } from "./emitter.js";

export type PlatformId = "x" | "truth" | "instagram" | "youtube" | "binance" | "news";

/** Options shared by every platform's client config. */
export interface CommonClientOptions {
  /** Reconnect/backoff overrides. See `ReconnectOptions` for defaults. */
  reconnect?: Partial<ReconnectOptions>;
  /** Override the `fetch` implementation used for REST calls (defaults to global `fetch`). */
  fetchImpl?: FetchLike;
  /** Override the WebSocket constructor used for the live stream (defaults to global `WebSocket`, falling back to the `ws` package on Node). */
  WebSocketImpl?: WebSocketCtor;
}

export interface CloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
}

export interface ReconnectingInfo {
  /** 0-indexed reconnect attempt number (0 = first retry). */
  attempt: number;
  /** How long the client will wait before this attempt, in ms. */
  delayMs: number;
}

/**
 * Events every client emits regardless of platform, in addition to its own
 * typed data events (`tweet`, `post`, `article`, ...).
 */
export interface BaseClientEvents extends EventMap {
  /** The WebSocket connection is open and ready. */
  open: [];
  /** The WebSocket connection closed. If `reconnect` is enabled and this wasn't a manual `disconnect()`, a reconnect is already scheduled. */
  close: [info: CloseInfo];
  /** A connection or parsing error. Non-fatal -- the reconnect loop keeps running unless you call `disconnect()`. */
  error: [error: Error];
  /** A reconnect attempt has been scheduled after an unexpected close. */
  reconnecting: [info: ReconnectingInfo];
  /** Every message received on the WebSocket, already `JSON.parse`d, before platform-specific typed dispatch. Useful for debugging or handling event types this package doesn't have a dedicated event for yet. */
  message: [raw: unknown];
}

/**
 * Base class every platform client extends. Owns the typed event emitter;
 * connection lifecycle (`connect` / `disconnect` / `isConnected`) is
 * implemented per platform because the underlying transport setup differs
 * (some platforms need a REST call to discover their WebSocket path before
 * they can connect at all).
 */
export abstract class BaseClient<Events extends EventMap> extends TypedEmitter<Events & BaseClientEvents> {
  abstract readonly platform: PlatformId;
  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract isConnected(): boolean;
}
