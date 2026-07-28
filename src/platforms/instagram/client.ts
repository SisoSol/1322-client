import { BaseClient, type CommonClientOptions, type PlatformId } from "../../types.js";
import type { EventMap } from "../../emitter.js";
import { HttpClient } from "../../http.js";
import { WsConnectionEngine } from "../../ws-connection.js";
import { ConfigError } from "../../errors.js";
import type {
  InstagramPost,
  InstagramHealthResponse,
  InstagramLimitsResponse,
  InstagramListResponse,
  InstagramTrackResponse,
  InstagramUntrackResponse,
} from "./types.js";

const DEFAULT_REST_BASE = "https://1322.io";
const DEFAULT_WS_URL = "wss://1322.io/IG";

export interface InstagramClientConfig extends CommonClientOptions {
  platform: "instagram";
  apiKey: string;
  restBaseUrl?: string;
  /** Full WebSocket URL override. Defaults to wss://1322.io/IG?key=<apiKey>. */
  wsUrl?: string;
}

export interface InstagramClientEvents extends EventMap {
  post: [post: InstagramPost];
}

export class InstagramClient extends BaseClient<InstagramClientEvents> {
  readonly platform: PlatformId = "instagram";

  private readonly config: InstagramClientConfig;
  private readonly http: HttpClient;
  private readonly engine: WsConnectionEngine;

  constructor(config: InstagramClientConfig) {
    super();
    if (!config.apiKey) throw new ConfigError("instagram client: `apiKey` is required.");
    this.config = config;

    this.http = new HttpClient(config.restBaseUrl ?? DEFAULT_REST_BASE, {
      fetchImpl: config.fetchImpl,
      defaultHeaders: { "X-API-Key": config.apiKey },
    });

    this.engine = new WsConnectionEngine({
      resolveUrl: () => this.config.wsUrl ?? `${DEFAULT_WS_URL}?key=${encodeURIComponent(this.config.apiKey)}`,
      WebSocketImpl: config.WebSocketImpl,
      reconnect: config.reconnect,
      onOpen: () => this.emit("open"),
      onClose: (info) => this.emit("close", info),
      onError: (error) => this.emit("error", error),
      onReconnecting: (info) => this.emit("reconnecting", info),
      onMessage: (data) => this.handleRawMessage(data),
    });
  }

  private handleRawMessage(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      this.emit("error", new Error(`Failed to parse Instagram WebSocket message as JSON: ${(err as Error).message}`));
      return;
    }
    this.emit("message", parsed);
    this.emit("post", parsed as InstagramPost);
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

  health(): Promise<InstagramHealthResponse> {
    return this.http.get<InstagramHealthResponse>("/v1/health");
  }

  limits(): Promise<InstagramLimitsResponse> {
    return this.http.get<InstagramLimitsResponse>("/v1/limits");
  }

  list(): Promise<InstagramListResponse> {
    return this.http.get<InstagramListResponse>("/v1/list");
  }

  track(username: string): Promise<InstagramTrackResponse> {
    return this.http.post<InstagramTrackResponse>("/v1/track", { username });
  }

  untrack(username: string): Promise<InstagramUntrackResponse> {
    return this.http.post<InstagramUntrackResponse>("/v1/untrack", { username });
  }
}
