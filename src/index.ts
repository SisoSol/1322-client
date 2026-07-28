/**
 * 1322-client -- unified TypeScript/JavaScript client for the 1322
 * real-time social monitoring API (X/Twitter, Truth Social, Instagram,
 * YouTube, Binance Square, News). See https://1322.io/docs for the
 * canonical API reference this package implements against.
 */

export { createClient, type AnyClient, type AnyClientConfig } from "./create-client.js";

export { ConfigError, NotSupportedError, ApiError, OneThreeTwoTwoError } from "./errors.js";
export { computeBackoffDelay, resolveReconnectOptions, DEFAULT_RECONNECT_OPTIONS, type ReconnectOptions } from "./reconnect.js";
export { TypedEmitter, type EventMap, type Listener } from "./emitter.js";
export type { WebSocketLike, WebSocketCtor } from "./ws-connection.js";
export type { FetchLike } from "./http.js";
export { BaseClient, type PlatformId, type CommonClientOptions, type CloseInfo, type ReconnectingInfo, type BaseClientEvents } from "./types.js";

export { XClient, type XClientConfig, type XClientEvents, type XTier } from "./platforms/x/client.js";
export { TruthClient, type TruthClientConfig, type TruthClientEvents } from "./platforms/truth/client.js";
export { InstagramClient, type InstagramClientConfig, type InstagramClientEvents } from "./platforms/instagram/client.js";
export { NewsClient, type NewsClientConfig, type NewsClientEvents } from "./platforms/news/client.js";
export { BinanceClient, type BinanceClientConfig, type BinanceClientEvents } from "./platforms/binance/client.js";
export { YouTubeClient, type YouTubeClientConfig, type YouTubeClientEvents } from "./platforms/youtube/client.js";

// Full type surface per platform (event payload shapes, REST response
// shapes), re-exported under a namespace each so names like `TrackResponse`
// that repeat across platforms don't collide.
export * as XTypes from "./platforms/x/types.js";
export * as TruthTypes from "./platforms/truth/types.js";
export * as InstagramTypes from "./platforms/instagram/types.js";
export * as NewsTypes from "./platforms/news/types.js";
export * as BinanceTypes from "./platforms/binance/types.js";
export * as YouTubeTypes from "./platforms/youtube/types.js";

export { TweetMergeCache, mergeIncomingTweet, applyDeletion, type MergedTweet, type XStage, type TweetMergeCacheOptions } from "./platforms/x/merge.js";
