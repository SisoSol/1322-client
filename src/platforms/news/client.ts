import { BaseClient, type CommonClientOptions, type PlatformId } from "../../types.js";
import type { EventMap } from "../../emitter.js";
import { HttpClient } from "../../http.js";
import { WsConnectionEngine } from "../../ws-connection.js";
import { ConfigError } from "../../errors.js";
import type { WebSocketNewsFeedPayload, NewsDashboardResponse, NewsSubscribeResponse, NewsUnsubscribeResponse } from "./types.js";

const DEFAULT_REST_BASE = "https://newsfeed.1322.io";
const DEFAULT_WS_HOST = "wss://newsfeed.1322.io";

export interface NewsClientConfig extends CommonClientOptions {
  platform: "news";
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

export interface NewsClientEvents extends EventMap {
  article: [article: WebSocketNewsFeedPayload];
}

export class NewsClient extends BaseClient<NewsClientEvents> {
  readonly platform: PlatformId = "news";

  private readonly config: NewsClientConfig;
  private readonly http: HttpClient;
  private readonly engine: WsConnectionEngine;

  constructor(config: NewsClientConfig) {
    super();
    if (!config.apiKey) throw new ConfigError("news client: `apiKey` is required.");
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
      this.emit("error", new Error(`Failed to parse News WebSocket message as JSON: ${(err as Error).message}`));
      return;
    }
    this.emit("message", parsed);
    this.emit("article", parsed as WebSocketNewsFeedPayload);
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

  dashboard(): Promise<NewsDashboardResponse> {
    return this.http.get<NewsDashboardResponse>("/v1/dashboard");
  }

  async list(): Promise<string[]> {
    return (await this.dashboard()).feeds;
  }

  track(feed: string): Promise<NewsSubscribeResponse> {
    return this.http.post<NewsSubscribeResponse>("/v1/subscribe", { feed });
  }

  untrack(feed: string): Promise<NewsUnsubscribeResponse> {
    return this.http.post<NewsUnsubscribeResponse>("/v1/unsubscribe", { feed });
  }
}
