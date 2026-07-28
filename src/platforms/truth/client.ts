import { BaseClient, type CommonClientOptions, type PlatformId } from "../../types.js";
import type { EventMap } from "../../emitter.js";
import { HttpClient } from "../../http.js";
import { WsConnectionEngine } from "../../ws-connection.js";
import { ConfigError } from "../../errors.js";
import type {
  TruthSocialPost,
  TruthHealthResponse,
  TruthStatusResponse,
  TruthListResponse,
  TruthLimitsResponse,
  TruthTrackResponse,
  TruthUntrackResponse,
} from "./types.js";

const DEFAULT_REST_BASE = "https://truth.1322.io";
const DEFAULT_WS_HOST = "wss://truth.1322.io";

export interface TruthClientConfig extends CommonClientOptions {
  platform: "truth";
  apiKey: string;
  /**
   * The WebSocket path issued in your dashboard configuration (e.g.
   * "/truth_abc123"). Required unless you pass `wsUrl` directly. Truth
   * Social has no REST endpoint that returns this, unlike News/Binance --
   * it's dashboard-issued, per https://1322.io/docs.
   */
  wsPath?: string;
  /** The WebSocket key from your dashboard configuration. Defaults to `apiKey` if omitted. */
  wsKey?: string;
  /** Full WebSocket URL override; takes precedence over `wsPath`/`wsKey`. */
  wsUrl?: string;
  restBaseUrl?: string;
}

export interface TruthClientEvents extends EventMap {
  post: [post: TruthSocialPost];
}

export class TruthClient extends BaseClient<TruthClientEvents> {
  readonly platform: PlatformId = "truth";

  private readonly config: TruthClientConfig;
  private readonly http: HttpClient;
  private readonly engine: WsConnectionEngine;

  constructor(config: TruthClientConfig) {
    super();
    if (!config.apiKey) throw new ConfigError("truth client: `apiKey` is required.");
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

  private resolveWsUrl(): string {
    if (this.config.wsUrl) return this.config.wsUrl;
    if (!this.config.wsPath) {
      throw new ConfigError(
        'truth client: pass either `wsUrl` or `wsPath` (the WebSocket path from your 1322 dashboard configuration) before calling connect(). Truth Social has no REST endpoint that discovers this automatically.'
      );
    }
    const path = this.config.wsPath.startsWith("/") ? this.config.wsPath : `/${this.config.wsPath}`;
    const key = this.config.wsKey ?? this.config.apiKey;
    return `${DEFAULT_WS_HOST}${path}?key=${encodeURIComponent(key)}`;
  }

  private handleRawMessage(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      this.emit("error", new Error(`Failed to parse Truth Social WebSocket message as JSON: ${(err as Error).message}`));
      return;
    }
    this.emit("message", parsed);
    this.emit("post", parsed as TruthSocialPost);
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

  health(): Promise<TruthHealthResponse> {
    return this.http.get<TruthHealthResponse>("/health");
  }

  status(): Promise<TruthStatusResponse> {
    return this.http.get<TruthStatusResponse>("/v1/status");
  }

  list(): Promise<TruthListResponse> {
    return this.http.get<TruthListResponse>("/v1/list");
  }

  limits(): Promise<TruthLimitsResponse> {
    return this.http.get<TruthLimitsResponse>("/v1/limits");
  }

  track(handle: string): Promise<TruthTrackResponse> {
    return this.http.post<TruthTrackResponse>("/v1/track", { handle });
  }

  untrack(handle: string): Promise<TruthUntrackResponse> {
    return this.http.post<TruthUntrackResponse>("/v1/untrack", { handle });
  }
}
