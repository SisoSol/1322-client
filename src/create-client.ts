import { ConfigError } from "./errors.js";
import { XClient, type XClientConfig } from "./platforms/x/client.js";
import { TruthClient, type TruthClientConfig } from "./platforms/truth/client.js";
import { InstagramClient, type InstagramClientConfig } from "./platforms/instagram/client.js";
import { NewsClient, type NewsClientConfig } from "./platforms/news/client.js";
import { BinanceClient, type BinanceClientConfig } from "./platforms/binance/client.js";
import { YouTubeClient, type YouTubeClientConfig } from "./platforms/youtube/client.js";

export type AnyClientConfig =
  | XClientConfig
  | TruthClientConfig
  | InstagramClientConfig
  | NewsClientConfig
  | BinanceClientConfig
  | YouTubeClientConfig;

export type AnyClient = XClient | TruthClient | InstagramClient | NewsClient | BinanceClient | YouTubeClient;

/**
 * Creates a 1322 client for the given platform. The returned client's
 * config, event names, and payload types are all narrowed to that
 * platform -- e.g. `createClient({ platform: "x", ... })` gives you an
 * `XClient` typed for X's events (`tweet`, `tweetFull`, ...), while
 * `createClient({ platform: "truth", ... })` gives you a `TruthClient`
 * typed for Truth Social's (`post`).
 *
 * Every client shares the same shape regardless of platform:
 * `connect()`, `disconnect()`, `isConnected()`, `on`/`off`/`once`, and (where
 * the platform documents it) `track()`/`untrack()`/`list()`.
 */
export function createClient(config: XClientConfig): XClient;
export function createClient(config: TruthClientConfig): TruthClient;
export function createClient(config: InstagramClientConfig): InstagramClient;
export function createClient(config: NewsClientConfig): NewsClient;
export function createClient(config: BinanceClientConfig): BinanceClient;
export function createClient(config: YouTubeClientConfig): YouTubeClient;
export function createClient(config: AnyClientConfig): AnyClient {
  switch (config.platform) {
    case "x":
      return new XClient(config);
    case "truth":
      return new TruthClient(config);
    case "instagram":
      return new InstagramClient(config);
    case "news":
      return new NewsClient(config);
    case "binance":
      return new BinanceClient(config);
    case "youtube":
      return new YouTubeClient(config);
    default: {
      const unknownPlatform = (config as { platform?: unknown }).platform;
      throw new ConfigError(
        `Unknown platform "${String(unknownPlatform)}". Expected one of: x, truth, instagram, youtube, binance, news.`
      );
    }
  }
}
