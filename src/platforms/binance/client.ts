import { BaseClient, type CommonClientOptions, type PlatformId } from "../../types.js";
import type { EventMap } from "../../emitter.js";
import { HttpClient } from "../../http.js";
import { WsConnectionEngine } from "../../ws-connection.js";
import { ConfigError } from "../../errors.js";
import type { BinancePost, PinUpdate, WsEnvelope, BinanceDashboardResponse, BinanceTrackResponse, BinanceUntrackResponse } from "./types.js";

const DEFAULT_REST_BASE = "https://binance.1322.io";
const DEFAULT_WS_HOST = "wss://binance.1322.io";

export interface BinanceClientConfig extends CommonClientOptions {
  platform: "binance";
  apiKey: string;
  /**
   * WebSocket path + key. Optional -- if omitted, `connect()` fetches them
   * automatically from `GET /v1/dashboard` before opening the socket, per
   * https://1322.io/docs.
   */
  wsPath?: string;
  wsKey?: string;
  /** Full WebSocket URL override; takes precedence over `wsPath`/`wsKey`. */
  wsUrl?: string;
  restBaseUrl?: string;
}

export interface BinanceClientEvents extends EventMap {
  post: [post: BinancePost];
  pinUpdate: [update: PinUpdate];
}

export class BinanceClient extends BaseClient<BinanceClientEvents> {
  readonly platform: PlatformId = "binance";

  private readonly config: BinanceClientConfig;
  private readonly http: HttpClient;
  private readonly engine: WsConnectionEngine;

  constructor(config: BinanceClientConfig) {
    super();
    if (!config.apiKey) throw new ConfigError("binance client: `apiKey` is required.");
    this.config = config;

    this.http = new HttpClient(config.restBaseUrl ?? DEFAULT_REST_BASE, {
      fetchImpl: config.fetchImpl,
      defaultHeaders: { "X-Api-Key": config.apiKey },
    });

    this.engine = new WsConnectionEngine({
      resolveUrl: () => this.resolveWsUrl(),
      WebSocketImpl: config.WebSocketImpl,
      reconnect: config.reconnect,
      onOpen: () => this.emit("open"),
      onClose: (info) => this.emit("close", info),
      onError: (error) => this.emit("error", error),
      onReconnecting: (info) => this.emit("reconnecting", info),
      onMessage: (data) => this.handleRawMessage(data),
    });
  }

  private async resolveWsUrl(): Promise<string> {
    if (this.config.wsUrl) return this.config.wsUrl;

    let path = this.config.wsPath;
    let key = this.config.wsKey;
    if (!path || !key) {
      const dashboard = await this.dashboard();
      path = path ?? dashboard.ws_path;
      key = key ?? dashboard.ws_key;
    }
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${DEFAULT_WS_HOST}${normalizedPath}?key=${encodeURIComponent(key)}`;
  }

  private handleRawMessage(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      this.emit("error", new Error(`Failed to parse Binance Square WebSocket message as JSON: ${(err as Error).message}`));
      return;
    }
    this.emit("message", parsed);

    const envelope = parsed as WsEnvelope;
    if (envelope.type === "binance.post") {
      this.emit("post", envelope.data as BinancePost);
    } else if (envelope.type === "binance.pin.update") {
      this.emit("pinUpdate", envelope.data as PinUpdate);
    }
  }

  async connect(): Promise<void> {
    await this.engine.connect();
  }

  disconnect(): void {
    this.engine.disconnect();
  }

  isConnected(): boolean {
    return this.engine.isConnected();
  }

  // ---- Management API ----

  dashboard(): Promise<BinanceDashboardResponse> {
    return this.http.get<BinanceDashboardResponse>("/v1/dashboard");
  }

  async list(): Promise<string[]> {
    return (await this.dashboard()).tracked;
  }

  track(username: string): Promise<BinanceTrackResponse> {
    return this.http.post<BinanceTrackResponse>("/v1/track", { username });
  }

  untrack(username: string): Promise<BinanceUntrackResponse> {
    return this.http.post<BinanceUntrackResponse>("/v1/untrack", { username });
  }
}
