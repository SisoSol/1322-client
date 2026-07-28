import type { TwitterMiniTweet, TwitterMiniUser, TwitterTweet, TwitterUser } from "../../src/platforms/x/types.js";

export function miniUser(overrides: Partial<TwitterMiniUser> = {}): TwitterMiniUser {
  return { id: "44196397", handle: "elonmusk", ...overrides };
}

export function fullUser(overrides: Partial<TwitterUser> = {}): TwitterUser {
  return {
    id: "44196397",
    handle: "elonmusk",
    private: false,
    verified: true,
    sensitive: false,
    restricted: false,
    joined_at: 1234567890000,
    profile: {
      name: "Elon Musk",
      location: null,
      avatar: "https://pbs.twimg.com/profile.jpg",
      banner: null,
      pinned: [],
      url: null,
      description: { text: "", urls: [] },
    },
    metrics: { likes: 0, media: 0, tweets: 0, friends: 0, followers: 210_000_000, following: 100 },
    ...overrides,
  };
}

export function miniTweet(overrides: Partial<TwitterMiniTweet> = {}): TwitterMiniTweet {
  return {
    id: "1234567890123456789",
    type: "TWEET",
    created_at: 1_700_000_000_000,
    author: miniUser(),
    subtweet: null,
    reply: null,
    quoted: null,
    body: { text: "short text", urls: [], mentions: [] },
    media: { images: [], videos: [], thumbnails: [], proxied: null },
    ...overrides,
  };
}

export function fullTweet(overrides: Partial<TwitterTweet> = {}): TwitterTweet {
  return {
    id: "1234567890123456789",
    type: "TWEET",
    created_at: 1_700_000_000_000,
    author: fullUser(),
    subtweet: null,
    reply: null,
    quoted: null,
    body: { text: "short text", urls: [], mentions: [], components: [] },
    media: { images: [], videos: [], thumbnails: [], proxied: null },
    grok: null,
    card: null,
    poll: null,
    article: null,
    metrics: { likes: 0, quotes: 0, replies: 0, retweets: 0, advanced: null },
    ...overrides,
  };
}
