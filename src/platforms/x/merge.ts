// Implements the "Additive Merge" strategy documented at
// https://1322.io/docs (X WebSocket guide): tweets arrive progressively as
// tweet.mini.update -> tweet.update -> tweet.update.expanded -> tweet.full,
// each stage enriching the previous one. To display the richest available
// version at any point, merge stages by tweet.id:
//   - use the longest body.text
//   - union all media arrays
//   - keep the deepest subtweet chain
//   - take the highest metric values
//   - never overwrite a populated field with null/empty
//
// This module is pure (no I/O, no timers) so it's fully unit-testable.

import type {
  TwitterMiniTweet,
  TwitterMiniUser,
  TwitterTweet,
  TwitterUser,
  TweetBodyComponent,
  TwitterUrlEntity,
  TwitterMentionEntity,
} from "./types.js";

export type XStage = "mini" | "update" | "expanded" | "full";

export interface MergedMedia {
  images: string[];
  videos: string[];
  thumbnails: string[];
  proxied: { images: string[]; thumbnails: string[] } | null;
}

/**
 * The running merged view of a tweet across every stage seen so far. Shaped
 * like `TwitterTweet` (the richest possible payload) but every optional/
 * nullable field only ever becomes non-null once some stage actually
 * supplies it -- it is never regressed back to null.
 */
export interface MergedTweet {
  id: string;
  type: TwitterMiniTweet["type"];
  created_at: number;
  author: TwitterUser | TwitterMiniUser;
  subtweet: MergedTweet | null;
  reply: TwitterMiniTweet["reply"];
  quoted: TwitterMiniTweet["quoted"];
  body: {
    text: string;
    urls: TwitterUrlEntity[];
    mentions: TwitterMentionEntity[];
    components: TweetBodyComponent[];
  };
  media: MergedMedia;
  grok: TwitterTweet["grok"] | null;
  card: TwitterTweet["card"] | null;
  poll: TwitterTweet["poll"] | null;
  article: TwitterTweet["article"] | null;
  metrics: TwitterTweet["metrics"] | null;
  community: TwitterTweet["community"] | undefined;
  /** Set once a `tweet.deleted` event is merged in for this id. */
  deletedAt: number | null;
  /** Every stage that has contributed data to this record, in arrival order. */
  stages: XStage[];
}

function isFullUser(user: TwitterUser | TwitterMiniUser): user is TwitterUser {
  return "profile" in user && "metrics" in user;
}

/** Prefer the richer author snapshot; never regress from a full profile back to a mini one. */
function mergeAuthor(existing: TwitterUser | TwitterMiniUser | undefined, incoming: TwitterUser | TwitterMiniUser): TwitterUser | TwitterMiniUser {
  if (!existing) return incoming;
  if (isFullUser(existing) && !isFullUser(incoming)) return existing;
  return incoming;
}

function subtweetDepth(node: MergedTweet | TwitterMiniTweet | TwitterTweet | null): number {
  let depth = 0;
  let cursor: { subtweet: unknown } | null = node as { subtweet: unknown } | null;
  while (cursor) {
    depth += 1;
    const next = cursor.subtweet;
    cursor = next && typeof next === "object" ? (next as { subtweet: unknown }) : null;
  }
  return depth;
}

function toMergedNode(node: TwitterMiniTweet | TwitterTweet, stage: XStage): MergedTweet {
  const isFull = "metrics" in node;
  const full = isFull ? (node as TwitterTweet) : undefined;
  return {
    id: node.id,
    type: node.type,
    created_at: node.created_at,
    author: node.author,
    subtweet: node.subtweet ? toMergedNode(node.subtweet, stage) : null,
    reply: node.reply,
    quoted: node.quoted,
    body: {
      text: node.body.text,
      urls: node.body.urls,
      mentions: node.body.mentions,
      components: full ? full.body.components : [],
    },
    media: {
      images: node.media.images,
      videos: node.media.videos,
      thumbnails: node.media.thumbnails,
      proxied: node.media.proxied
        ? {
            images: node.media.proxied.images,
            thumbnails: full ? (full.media.proxied?.thumbnails ?? []) : [],
          }
        : null,
    },
    grok: full?.grok ?? null,
    card: full?.card ?? null,
    poll: full?.poll ?? null,
    article: full?.article ?? null,
    metrics: full?.metrics ?? null,
    community: full?.community,
    deletedAt: null,
    stages: [stage],
  };
}

function unionUnique(a: string[], b: string[]): string[] {
  const seen = new Set(a);
  const out = a.slice();
  for (const item of b) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function mergeMedia(existing: MergedMedia, incoming: TwitterMiniTweet["media"] | TwitterTweet["media"]): MergedMedia {
  const incomingProxied = incoming.proxied
    ? {
        images: incoming.proxied.images,
        thumbnails: "thumbnails" in incoming.proxied ? incoming.proxied.thumbnails : [],
      }
    : null;
  return {
    images: unionUnique(existing.images, incoming.images),
    videos: unionUnique(existing.videos, incoming.videos),
    thumbnails: unionUnique(existing.thumbnails, incoming.thumbnails),
    // Never overwrite a populated proxied block with null; union when both present.
    proxied:
      existing.proxied && incomingProxied
        ? {
            images: unionUnique(existing.proxied.images, incomingProxied.images),
            thumbnails: unionUnique(existing.proxied.thumbnails, incomingProxied.thumbnails),
          }
        : (existing.proxied ?? incomingProxied),
  };
}

function mergeMetrics(existing: TwitterTweet["metrics"] | null, incoming: TwitterTweet["metrics"] | null): TwitterTweet["metrics"] | null {
  if (!incoming) return existing;
  if (!existing) return incoming;
  return {
    likes: Math.max(existing.likes, incoming.likes),
    quotes: Math.max(existing.quotes, incoming.quotes),
    replies: Math.max(existing.replies, incoming.replies),
    retweets: Math.max(existing.retweets, incoming.retweets),
    advanced:
      existing.advanced && incoming.advanced
        ? { views: Math.max(existing.advanced.views, incoming.advanced.views) }
        : (existing.advanced ?? incoming.advanced),
  };
}

function mergeSubtweet(existing: MergedTweet | null, incomingRaw: TwitterMiniTweet["subtweet"] | TwitterTweet["subtweet"], stage: XStage): MergedTweet | null {
  if (!incomingRaw) return existing; // never overwrite a populated chain with null
  const incoming = toMergedNode(incomingRaw, stage);
  if (!existing) return incoming;
  // Keep whichever chain is deeper; on a tie, merge the two roots (same id
  // expected) so richer per-stage fields at the top node still combine.
  const existingDepth = subtweetDepth(existing);
  const incomingDepth = subtweetDepth(incomingRaw);
  if (incomingDepth > existingDepth) return incoming;
  if (incomingDepth < existingDepth) return existing;
  return mergeMergedTweet(existing, incomingRaw, stage);
}

/** Shared merge body for both root-level and nested (subtweet) merges. */
function mergeMergedTweet(existing: MergedTweet, incoming: TwitterMiniTweet | TwitterTweet, stage: XStage): MergedTweet {
  const isFull = "metrics" in incoming;
  const full = isFull ? (incoming as TwitterTweet) : undefined;

  return {
    id: existing.id,
    type: incoming.type,
    created_at: existing.created_at || incoming.created_at,
    author: mergeAuthor(existing.author, incoming.author),
    subtweet: mergeSubtweet(existing.subtweet, incoming.subtweet, stage),
    reply: existing.reply ?? incoming.reply,
    quoted: existing.quoted ?? incoming.quoted,
    body: {
      // Longest body text wins.
      text: incoming.body.text.length > existing.body.text.length ? incoming.body.text : existing.body.text,
      urls: unionByKey(existing.body.urls, incoming.body.urls, (u) => u.url),
      mentions: unionByKey(existing.body.mentions, incoming.body.mentions, (m) => m.id),
      components: full && full.body.components.length > existing.body.components.length ? full.body.components : existing.body.components,
    },
    media: mergeMedia(existing.media, incoming.media),
    grok: full?.grok ?? existing.grok,
    card: full?.card ?? existing.card,
    poll: full?.poll ?? existing.poll,
    article: full?.article ?? existing.article,
    metrics: mergeMetrics(existing.metrics, full?.metrics ?? null),
    community: full?.community ?? existing.community,
    deletedAt: existing.deletedAt,
    stages: existing.stages.includes(stage) ? existing.stages : [...existing.stages, stage],
  };
}

function unionByKey<T>(a: T[], b: T[], key: (item: T) => string): T[] {
  const seen = new Set(a.map(key));
  const out = a.slice();
  for (const item of b) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/**
 * Merge one incoming stage payload into the existing merged record for the
 * same tweet id (or start a new record if `existing` is undefined). Pure
 * and order-tolerant: merging stages in any order converges to the same
 * richness (later merges of an already-seen stage are idempotent no-ops
 * for that stage's own data).
 */
export function mergeIncomingTweet(existing: MergedTweet | undefined, incoming: TwitterMiniTweet | TwitterTweet, stage: XStage): MergedTweet {
  if (!existing) return toMergedNode(incoming, stage);
  return mergeMergedTweet(existing, incoming, stage);
}

/** Applies a `tweet.deleted` event on top of whatever merged state exists (or starts one from the deleted payload if this is the first event seen for the id). */
export function applyDeletion(existing: MergedTweet | undefined, tweet: TwitterTweet, deletedAt: number): MergedTweet {
  const base = mergeIncomingTweet(existing, tweet, "full");
  return { ...base, deletedAt };
}

export interface TweetMergeCacheOptions {
  /** Maximum number of tweet ids to retain. Oldest entries are evicted first. Default 200. */
  maxSize?: number;
  /** Time-to-live per entry in ms, refreshed on every merge. Default 5 minutes. */
  ttlMs?: number;
  /** Clock override for tests. */
  now?: () => number;
}

/**
 * Bounded, TTL-expiring cache of `MergedTweet` records keyed by tweet id.
 * This is the "dedup by id" mechanism referenced in the docs: every stage
 * event for the same tweet id lands on the same cache entry instead of
 * producing a duplicate downstream event with stale/incomplete data.
 */
export class TweetMergeCache {
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, { tweet: MergedTweet; expiresAt: number }>();

  constructor(options: TweetMergeCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 200;
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  get(id: string): MergedTweet | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(id);
      return undefined;
    }
    return entry.tweet;
  }

  private touch(id: string, tweet: MergedTweet): void {
    // Delete-then-set moves the key to the end of Map's iteration order,
    // giving us cheap least-recently-used eviction below.
    this.entries.delete(id);
    this.entries.set(id, { tweet, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }

  mergeStage(id: string, incoming: TwitterMiniTweet | TwitterTweet, stage: XStage): MergedTweet {
    const merged = mergeIncomingTweet(this.get(id), incoming, stage);
    this.touch(id, merged);
    return merged;
  }

  mergeDeletion(id: string, tweet: TwitterTweet, deletedAt: number): MergedTweet {
    const merged = applyDeletion(this.get(id), tweet, deletedAt);
    this.touch(id, merged);
    return merged;
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }
}
