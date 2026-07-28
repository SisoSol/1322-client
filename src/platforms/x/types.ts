// Types transcribed from https://1322.io/docs (X / Twitter section). Field
// comments are kept close to the source docs so this file can double as a
// reference.

export interface WebsocketWorkerEvent {
  /** Unique ID for this event. Can be used for debouncing/deduplication across multiple connections. */
  id: string;
  /** The type of event being sent. */
  type: string;
  /** Always "1322", identifies the event origin. */
  source: "1322";
}

/** When verified is an object (instead of boolean), it carries badge tier and optional org linkage. */
export interface VerificationBadge {
  /** none=unverified, blue=standard checkmark, gold=organization. */
  type: "none" | "blue" | "gold";
  label: null | {
    description: string;
    badge: string | null;
    url: string | null;
  };
}

export interface TwitterMiniUser {
  id: string;
  handle: string;
  name?: string;
  avatar?: string;
  verified?: boolean | VerificationBadge;
  profile?: { name: string; avatar: string | null };
  metrics?: { following: number; followers: number };
}

/** Complete/detailed version of a Twitter/X user's profile. */
export interface TwitterUser {
  id: string;
  handle: string;
  private: boolean;
  verified: boolean | VerificationBadge;
  sensitive: boolean;
  restricted: boolean;
  /** UNIX timestamp (ms) of when the user joined Twitter. */
  joined_at: number;
  profile: {
    name: string;
    location: null | string;
    avatar: null | string;
    banner: null | string;
    pinned: string[];
    url: null | { name: string; url: string; tco: string };
    description: {
      text: string;
      urls: { name: string; url: string; tco: string }[];
    };
  };
  metrics: {
    likes: number;
    media: number;
    tweets: number;
    friends: number;
    followers: number;
    following: number;
  };
}

export interface TwitterUrlEntity {
  name: string;
  url: string;
  tco: string;
}

export interface TwitterMentionEntity {
  id: string;
  name: string;
  handle: string;
}

/** Brief/compressed version of a Twitter/X post -- the first event for any tweet. */
export interface TwitterMiniTweet {
  id: string;
  type: "TWEET" | "RETWEET" | "QUOTE" | "REPLY";
  created_at: number;
  author: TwitterMiniUser;
  subtweet: null | TwitterMiniTweet;
  reply: null | { id: string; handle: string };
  quoted: null | { id: string; handle: string };
  body: {
    text: string;
    urls: TwitterUrlEntity[];
    mentions: TwitterMentionEntity[];
  };
  media: {
    images: string[];
    videos: string[];
    thumbnails: string[];
    proxied: null | { images: string[] };
  };
}

export type TweetArticleComponent =
  | { type: "divider" }
  | {
      type: "text";
      variant: "header-one" | "header-two" | "paragraph" | "blockquote" | "ordered-list" | "unordered-list" | "latex-box" | "markdown-box";
      lines: {
        text: string;
        styles: { from: number; to: number; text: "bold" | "italics" | "strikethrough" }[];
        urls: { from: number; to: number; url: string }[];
      }[];
    }
  | { type: "media"; variant: "image" | "gif" | "video"; url: string; thumbnail: string; caption: null | string }
  | { type: "tweet"; tweet: { id: string; url: string; object: null | TwitterTweet } };

export type TweetBodyComponent =
  | { type: "text"; text: string; bold: boolean; italics: boolean }
  | { type: "image"; url: string }
  | { type: "video"; url: string };

/** Complete/detailed/rich version of a Twitter/X post. */
export interface TwitterTweet {
  id: string;
  type: "TWEET" | "RETWEET" | "QUOTE" | "REPLY";
  created_at: number;
  author: TwitterUser;
  subtweet: null | TwitterTweet;
  reply: null | { id: string; handle: string };
  quoted: null | { id: string; handle: string };
  body: {
    text: string;
    urls: TwitterUrlEntity[];
    mentions: TwitterMentionEntity[];
    components: TweetBodyComponent[];
  };
  media: {
    images: string[];
    videos: string[];
    thumbnails: string[];
    proxied: null | { images: string[]; thumbnails: string[] };
  };
  grok: null | {
    id: string;
    conversation: { from: "USER" | "AGENT"; message: string; images: string[] }[];
  };
  card: null | { url: string; image: string; title: string; description: string };
  poll: null | {
    ends_at: number;
    updated_at: number;
    choices: { label: string; count: number }[];
  };
  article: null | {
    id: string;
    title: string;
    thumbnail: null | string;
    created_at: number;
    updated_at: number;
    body: { text: string; components: TweetArticleComponent[] };
  };
  metrics: {
    likes: number;
    quotes: number;
    replies: number;
    retweets: number;
    advanced: null | { views: number };
  };
  /** Present when the tweet belongs to a community (fetched with ?full=true). */
  community?: { id: string; name: string; url: string };
}

export interface MiniTweetUpdate extends WebsocketWorkerEvent {
  type: "tweet.mini.update";
  tweet: TwitterMiniTweet;
}

export interface TweetUpdate extends WebsocketWorkerEvent {
  type: "tweet.update";
  tweet: TwitterTweet;
}

export interface TweetUpdateExpanded extends WebsocketWorkerEvent {
  type: "tweet.update.expanded";
  tweet: TwitterTweet;
}

export interface TweetFull extends WebsocketWorkerEvent {
  type: "tweet.full";
  /** Fullchain: subtweet forms a recursive chain of full tweets. */
  tweet: TwitterTweet;
}

export interface DeletedTweet extends WebsocketWorkerEvent {
  type: "tweet.deleted";
  /** Metrics may be outdated (likes, replies, retweets, etc). */
  tweet: TwitterTweet;
  deleted_at: number;
}

export interface ProfileUpdate extends WebsocketWorkerEvent {
  type: "profile.update";
  user: TwitterUser;
  before: TwitterUser;
}

export interface FollowingUpdate extends WebsocketWorkerEvent {
  type: "following.update";
  change: "unfollowed" | "followed";
  following: TwitterUser;
  user: TwitterUser;
}

export interface ProfilePinnedUpdate extends WebsocketWorkerEvent {
  type: "profile.pinned.update";
  user: TwitterUser;
  pinned: TwitterTweet[];
}

export interface ProfileUnpinnedUpdate extends WebsocketWorkerEvent {
  type: "profile.unpinned.update";
  user: TwitterUser;
  pinned: TwitterTweet[];
}

/** Discriminated union of every event the X WebSocket can send, keyed on `type`. */
export type XWsEvent =
  | MiniTweetUpdate
  | TweetUpdate
  | TweetUpdateExpanded
  | TweetFull
  | DeletedTweet
  | ProfileUpdate
  | FollowingUpdate
  | ProfilePinnedUpdate
  | ProfileUnpinnedUpdate;

// ---- Management API (REST) ----

export interface TrackedAccount {
  createdAt: string;
  twitterId: string;
  twitterUsername: string;
}

export interface GetTrackedResponse {
  success: true;
  tier: "normal" | "ultimate";
  page: number;
  trackedAccounts: TrackedAccount[];
}

export interface ApiKeyInfo {
  tier: "normal" | "ultimate";
  key: string;
  trackedCount: number;
  totalLimit: number;
}

export interface GetKeysResponse {
  plan: string;
  keys: ApiKeyInfo[];
}

export interface TrackedMutationResult {
  identifier: string;
  twitterUsername?: string;
  twitterId?: string;
  trackedAccount?: TrackedAccount;
  reason?: string;
}

export interface TrackedMutationResponse {
  success: boolean;
  message: string;
  tier: "normal" | "ultimate";
  results: {
    successful: TrackedMutationResult[];
    skipped: TrackedMutationResult[];
    failed: TrackedMutationResult[];
  };
}

export interface GetTweetResponse {
  success: true;
  tweet: TwitterTweet;
}

export interface ResolveUsernameResponse {
  username: string;
  twitterId: string;
  displayName: string;
  followers: number;
  status: string;
}

export interface HealthResponse {
  status: string;
}

export type XIdentifierType = "username" | "id";
