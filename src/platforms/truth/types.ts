// Types transcribed from https://1322.io/docs (Truth Social section).

export interface TruthSocialMediaAttachment {
  kind: "image" | "video" | "gifv" | "audio" | string;
  url: string;
  poster_url: string;
  created_at: string;
  /** own = attached directly to this post; quoted = from the quoted post; nested_quoted = from a quote-of-a-quote. */
  source?: "own" | "quoted" | "nested_quoted";
}

export interface TruthSocialAuthor {
  /** Original user_id, useful for dedupe. */
  id?: string;
  username: string;
  display_name?: string;
  /** Proxied avatar URL (same proxy as user_avatar). */
  avatar?: string;
}

export interface TruthSocialQuoted {
  key: string;
  text: string;
  url?: string;
  /** Original author of the quoted post. */
  author?: TruthSocialAuthor;
  /** Nested quote support: a quote of a quote. */
  quoted?: {
    key: string;
    text: string;
    url?: string;
    author?: TruthSocialAuthor;
  };
}

export interface TruthSocialPost {
  platform: "truth";
  /** On retruths/quotes this is the outer actor. */
  username: string;
  display_name: string;
  user_avatar: string;
  user_following: number;
  user_followers: number;
  user_id: string;
  /** Unique post ID (Mastodon-style snowflake). Use this for deduplication. */
  key: string;
  timestamp: string;
  /** ISO-8601 timestamp of when 1322 first detected the post. */
  seen_at: string;
  text: string;
  is_quote?: boolean;
  quoted?: TruthSocialQuoted;
  is_retruth?: boolean;
  retruth_of_id?: string;
  /** Original author of a retruth. The outer `username` stays the retruther. */
  retruth_of?: TruthSocialAuthor;
  card?: {
    url: string;
    title?: string;
    description?: string;
    image?: string;
  };
  media?: TruthSocialMediaAttachment[];
}

// ---- Management API (REST) ----

export interface TruthHealthResponse {
  status: string;
}

export interface TruthStatusResponse {
  posts_processed: number;
  errors_total: number;
  status: string;
}

export interface TruthTrackedAccount {
  handle: string;
  display_name: string;
  added_by: string;
  added_at: string;
}

export type TruthListResponse = TruthTrackedAccount[];

export interface TruthLimitsResponse {
  current_tracked: number;
  max_tracked: number;
  rpm: number;
  tracked: string[];
}

export interface TruthTrackResponse {
  status: string;
  account: string;
  uid: string;
  display_name: string;
  tracked: string[];
  current_tracked: number;
  max_tracked: number;
}

export interface TruthUntrackResponse {
  status: string;
  account: string;
  tracked: string[];
  current_tracked: number;
  max_tracked: number;
}
