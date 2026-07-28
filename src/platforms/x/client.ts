import { BaseClient, type CommonClientOptions, type PlatformId } from "../../types.js";
import type { EventMap } from "../../emitter.js";
import { HttpClient } from "../../http.js";
import { WsConnectionEngine, type WebSocketCtor } from "../../ws-connection.js";
import { ConfigError } from "../../errors.js";
import { TweetMergeCache, type MergedTweet, type XStage } from "./merge.js";
import type {
  XWsEvent,
  TwitterMiniTweet,
  TwitterTweet,
  TwitterUser,
  GetTrackedResponse,
  GetKeysResponse,
  TrackedMutationResponse,
  GetTweetResponse,
  ResolveUsernameResponse,
  HealthResponse,
  XIdentifierType,
} from "./types.js";

const NORMAL_WS_BASE = "wss://ws.normal.1322.io/ws/normal";
const ULTIMATE_WS_BASE = "wss://ws.ultimate.1322.io/ws/ultimate";
const DEFAULT_REST_BASE = "https://api.1322.io";

export type XTier = "normal" | "ultimate" | "hybrid";

export interface XClientConfig extends CommonClientOptions {
  platform: "x";
  /** API key for the Normal tier (or the only key you have, for a single-tier client). */
  apiKey: string;
  /** Ultimate-tier API key. Required when `tier` is "ultimate" or "hybrid". */
  ultimateApiKey?: string;
  /** Which stream(s) to connect to. "hybrid" opens both Normal and Ultimate simultaneously per the docs' "Hybrid Clients" guidance, deduplicating by tweet id. Default "normal". */
  tier?: XTier;
  /** Override the REST base URL. Default https://api.1322.io */
  restBaseUrl?: string;
  /** Override the full WebSocket URL. Only valid for a single-tier client (not "hybrid"). */
  wsUrl?: string;
  /** Additive-merge / dedup-by-id cache used to build the `tweet` event. */
  merge?: {
    /** Set false to disable merging and the `tweet` event entirely; you'll still get the raw `tweetMiniUpdate`/`tweetUpdate`/etc events. Default true. */
    enabled?: boolean;
    maxSize?: number;
    ttlMs?: number;
  };
}

export interface XClientEvents extends EventMap {
  tweetMiniUpdate: [tweet: TwitterMiniTweet];
  tweetUpdate: [tweet: TwitterTweet];
  tweetExpanded: [tweet: TwitterTweet];
  tweetFull: [tweet: TwitterTweet];
  tweetDeleted: [info: { tweet: TwitterTweet; deletedAt: number }];
  profileUpdate: [info: { user: TwitterUser; before: TwitterUser }];
  profilePinned: [info: { user: TwitterUser; pinned: TwitterTweet[] }];
  profileUnpinned: [info: { user: TwitterUser; pinned: TwitterTweet[] }];
  followingUpdate: [info: { change: "unfollowed" | "followed"; following: TwitterUser; user: TwitterUser }];
  /**
   * Additively-merged, deduplicated view of a tweet, fired after every stage
   * event (mini/update/expanded/full/deleted) for that tweet id. This is
   * the recommended event for most consumers -- see `TweetMergeCache` for
   * the merge rules.
   */
  tweet: [tweet: MergedTweet];
}

export class XClient extends BaseClient<XClientEvents> {
  readonly platform: PlatformId = "x";

  private readonly config: XClientConfig;
  private readonly http: HttpClient;
  private readonly engines: WsConnectionEngine[];
  private readonly mergeCache: TweetMergeCache | null;

  constructor(config: XClientConfig) {
    super();
    if (!config.apiKey) throw new ConfigError("x client: `apiKey` is required.");
    const tier = config.tier ?? "normal";
    if (tier === "hybrid" && !config.ultimateApiKey) {
      throw new ConfigError('x client: `ultimateApiKey` is required when tier is "hybrid".');
    }
    if (tier === "hybrid" && config.wsUrl) {
      throw new ConfigError('x client: `wsUrl` cannot be used with tier "hybrid" (it opens two connections). Omit it, or use tier "normal"/"ultimate".');
    }
    this.config = config;

    this.http = new HttpClient(config.restBaseUrl ?? DEFAULT_REST_BASE, {
      fetchImpl: config.fetchImpl,
      defaultHeaders: { "X-API-Key": config.apiKey },
    });

    this.mergeCache =
      config.merge?.enabled === false
        ? null
        : new TweetMergeCache({ maxSize: config.merge?.maxSize, ttlMs: config.merge?.ttlMs });

    this.engines = this.buildEngines(tier);
  }

  private buildEngines(tier: XTier): WsConnectionEngine[] {
    const shared = { WebSocketImpl: this.config.WebSocketImpl, reconnect: this.config.reconnect };
    const engines: WsConnectionEngine[] = [];

    if (tier === "normal" || tier === "hybrid") {
      const url = tier === "normal" && this.config.wsUrl ? this.config.wsUrl : `${NORMAL_WS_BASE}?token=${encodeURIComponent(this.config.apiKey)}`;
      engines.push(this.makeEngine(url, shared));
    }
    if (tier === "ultimate" || tier === "hybrid") {
      const key = this.config.ultimateApiKey ?? this.config.apiKey;
      const url = tier === "ultimate" && this.config.wsUrl ? this.config.wsUrl : `${ULTIMATE_WS_BASE}?token=${encodeURIComponent(key)}`;
      engines.push(this.makeEngine(url, shared));
    }
    return engines;
  }

  private makeEngine(url: string, shared: { WebSocketImpl?: WebSocketCtor; reconnect?: XClientConfig["reconnect"] }): WsConnectionEngine {
    return new WsConnectionEngine({
      resolveUrl: () => url,
      WebSocketImpl: shared.WebSocketImpl,
      reconnect: shared.reconnect,
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
      this.emit("error", new Error(`Failed to parse X WebSocket message as JSON: ${(err as Error).message}`));
      return;
    }
    this.emit("message", parsed);

    const event = parsed as XWsEvent;
    switch (event.type) {
      case "tweet.mini.update":
        this.emit("tweetMiniUpdate", event.tweet);
        this.mergeAndEmit(event.tweet.id, event.tweet, "mini");
        return;
      case "tweet.update":
        this.emit("tweetUpdate", event.tweet);
        this.mergeAndEmit(event.tweet.id, event.tweet, "update");
        return;
      case "tweet.update.expanded":
        this.emit("tweetExpanded", event.tweet);
        this.mergeAndEmit(event.tweet.id, event.tweet, "expanded");
        return;
      case "tweet.full":
        this.emit("tweetFull", event.tweet);
        this.mergeAndEmit(event.tweet.id, event.tweet, "full");
        return;
      case "tweet.deleted":
        this.emit("tweetDeleted", { tweet: event.tweet, deletedAt: event.deleted_at });
        if (this.mergeCache) {
          const merged = this.mergeCache.mergeDeletion(event.tweet.id, event.tweet, event.deleted_at);
          this.emit("tweet", merged);
        }
        return;
      case "profile.update":
        this.emit("profileUpdate", { user: event.user, before: event.before });
        return;
      case "profile.pinned.update":
        this.emit("profilePinned", { user: event.user, pinned: event.pinned });
        return;
      case "profile.unpinned.update":
        this.emit("profileUnpinned", { user: event.user, pinned: event.pinned });
        return;
      case "following.update":
        this.emit("followingUpdate", { change: event.change, following: event.following, user: event.user });
        return;
      default:
        // Forward-compatible: unknown event types are still visible via `message`.
        return;
    }
  }

  private mergeAndEmit(id: string, tweet: TwitterTweet | TwitterMiniTweet, stage: XStage): void {
    if (!this.mergeCache) return;
    const merged = this.mergeCache.mergeStage(id, tweet, stage);
    this.emit("tweet", merged);
  }

  async connect(): Promise<void> {
    await Promise.all(this.engines.map((engine) => engine.connect()));
  }

  disconnect(): void {
    for (const engine of this.engines) engine.disconnect();
  }

  isConnected(): boolean {
    return this.engines.every((engine) => engine.isConnected());
  }

  /** Direct access to the merge cache (e.g. to look up a tweet by id, or to clear it). */
  get merges(): TweetMergeCache | null {
    return this.mergeCache;
  }

  // ---- Management API ----

  list(): Promise<GetTrackedResponse> {
    return this.http.get<GetTrackedResponse>("/v1/tracked");
  }

  keys(): Promise<GetKeysResponse> {
    return this.http.get<GetKeysResponse>("/v1/keys");
  }

  track(identifiers: string | string[], type: XIdentifierType = "username"): Promise<TrackedMutationResponse> {
    const joined = Array.isArray(identifiers) ? identifiers.join(",") : identifiers;
    return this.http.post<TrackedMutationResponse>("/v1/tracked", { identifiers: joined, type });
  }

  untrack(identifiers: string | string[], type: XIdentifierType = "username"): Promise<TrackedMutationResponse> {
    const joined = Array.isArray(identifiers) ? identifiers.join(",") : identifiers;
    return this.http.delete<TrackedMutationResponse>("/v1/tracked", { identifiers: joined, type });
  }

  getTweet(id: string, opts: { full?: boolean; expanded?: boolean } = {}): Promise<GetTweetResponse> {
    return this.http.get<GetTweetResponse>(`/v1/data/tweet/${encodeURIComponent(id)}`, {
      query: { full: opts.full, expanded: opts.expanded },
    });
  }

  resolveUsername(username: string): Promise<ResolveUsernameResponse> {
    return this.http.get<ResolveUsernameResponse>(`/v1/resolve/username/${encodeURIComponent(username)}`);
  }

  health(): Promise<HealthResponse> {
    return this.http.get<HealthResponse>("/v1/health");
  }
}
