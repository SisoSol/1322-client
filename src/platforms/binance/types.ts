// Types transcribed from https://1322.io/docs (Binance Square section).
//
// The docs reference `MediaItem`, `PostPoll`, `PostQuote`, `PostTranslation`,
// `SpaceLiveReplay`, and `PostResolvedLink` as field types on `BinancePost`
// without publishing their internal shape. Rather than guessing, they're
// typed here as opaque objects -- check https://1322.io/docs for updates,
// or inspect a live payload's `message` event to see the real shape.
export type MediaItem = Record<string, unknown>;
export type PostPoll = Record<string, unknown>;
export type PostQuote = Record<string, unknown>;
export type PostTranslation = Record<string, unknown>;
export type SpaceLiveReplay = Record<string, unknown>;
export type PostResolvedLink = Record<string, unknown>;

export interface BinancePost {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  square_uid?: string;
  /** "post" | "video" | "space" | "article" */
  content_type?: string;
  title?: string;
  text?: string;
  web_link?: string;
  share_link?: string;
  is_reply: boolean;
  parent_id?: string;

  // Engagement
  reply_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;

  // Sentiment
  /** "bullish" | "bearish" | "" */
  tendency?: string;
  bullish_ratio?: number;
  bearish_ratio?: number;
  /** e.g. ["BTCUSDT", "ETHUSDT"] */
  coin_pairs?: string[];
  hashtags?: string[];
  mentions?: string[];

  // Rich content
  media?: MediaItem[];
  poll?: PostPoll;
  /** Embedded quote/repost. */
  quote?: PostQuote;
  /** Parent post context. */
  reply_to?: PostQuote;
  translation?: PostTranslation;
  live_replay?: SpaceLiveReplay;
  resolved_links?: PostResolvedLink[];

  /** ISO 8601 */
  published_at: string;
  /** ISO 8601 */
  detected_at: string;
}

export interface PinUpdate {
  username: string;
  display_name?: string;
  avatar_url?: string;
  square_uid?: string;
  /** Newly pinned posts. */
  added?: BinancePost[];
  /** Unpinned posts. */
  removed?: BinancePost[];
  removed_ids?: string[];
  /** Hint only; confirm on Square if needed. */
  note?: string;
  /** RFC3339 event time. */
  detected_at: string;
}

export type WsEventType = "binance.post" | "binance.pin.update";

/** Every WS frame is `{ type, data }`. Branch on `type`. */
export interface WsEnvelope {
  type: WsEventType;
  data: BinancePost | PinUpdate;
}

// ---- Management API (REST) ----

export interface BinanceDashboardResponse {
  status: string;
  tracked: string[];
  current: number;
  max_tracked: number;
  ws_path: string;
  ws_key: string;
}

export interface BinanceTrackedInfo {
  username: string;
  square_uid: string;
  display_name: string;
  avatar_url: string;
  added_at: string;
}

export interface BinanceTrackResponse {
  status: string;
  tracked: BinanceTrackedInfo;
}

export interface BinanceUntrackResponse {
  status: string;
  account: string;
  tracked: string[];
  current: number;
  max_tracked: number;
}
