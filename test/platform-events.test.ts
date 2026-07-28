import { beforeEach, describe, expect, it } from "vitest";
import { createClient } from "../src/create-client.js";
import type { WebSocketCtor } from "../src/ws-connection.js";
import { FakeWebSocket } from "./fixtures/fake-ws.js";
import { fullTweet, fullUser, miniTweet } from "./fixtures/x.js";

/** Waits for pending microtasks (resolveUrl/resolveWebSocketImpl awaits) to flush by yielding a real macrotask tick. */
async function waitForSocket(): Promise<FakeWebSocket> {
  for (let i = 0; i < 20; i++) {
    if (FakeWebSocket.instances.length > 0) return FakeWebSocket.latest();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("socket was never constructed");
}

async function connectWithFakeSocket<T extends { connect(): Promise<void> }>(client: T): Promise<FakeWebSocket> {
  const connectPromise = client.connect();
  const socket = await waitForSocket();
  socket.triggerOpen();
  await connectPromise;
  return socket;
}

const WS = FakeWebSocket as unknown as WebSocketCtor;

describe("per-platform event parsing/typing", () => {
  beforeEach(() => {
    FakeWebSocket.reset();
  });

  it("x: dispatches tweet.mini.update / tweet.update / tweet.deleted / profile.update to their typed events, and builds the merged `tweet` event", async () => {
    const client = createClient({ platform: "x", apiKey: "test-key", WebSocketImpl: WS, reconnect: { enabled: false } });
    const socket = await connectWithFakeSocket(client);

    const seenMiniUpdates: unknown[] = [];
    const seenMergedTweets: unknown[] = [];
    const seenProfileUpdates: unknown[] = [];
    const seenDeleted: unknown[] = [];
    client.on("tweetMiniUpdate", (t) => seenMiniUpdates.push(t));
    client.on("tweet", (t) => seenMergedTweets.push(t));
    client.on("profileUpdate", (info) => seenProfileUpdates.push(info));
    client.on("tweetDeleted", (info) => seenDeleted.push(info));

    const tweet = miniTweet({ id: "42", body: { text: "hello world", urls: [], mentions: [] } });
    socket.triggerMessage(JSON.stringify({ id: "evt1", type: "tweet.mini.update", source: "1322", tweet }));

    expect(seenMiniUpdates).toEqual([tweet]);
    expect(seenMergedTweets).toHaveLength(1);
    expect((seenMergedTweets[0] as { body: { text: string } }).body.text).toBe("hello world");

    const user = fullUser();
    socket.triggerMessage(JSON.stringify({ id: "evt2", type: "profile.update", source: "1322", user, before: user }));
    expect(seenProfileUpdates).toEqual([{ user, before: user }]);

    const deletedTweet = fullTweet({ id: "42" });
    socket.triggerMessage(JSON.stringify({ id: "evt3", type: "tweet.deleted", source: "1322", tweet: deletedTweet, deleted_at: 1700000999000 }));
    expect(seenDeleted).toEqual([{ tweet: deletedTweet, deletedAt: 1700000999000 }]);
    expect(client.merges?.get("42")?.deletedAt).toBe(1700000999000);
  });

  it("truth: dispatches raw TruthSocialPost payloads to the `post` event", async () => {
    const client = createClient({
      platform: "truth",
      apiKey: "test-key",
      wsPath: "/truth_abc123",
      WebSocketImpl: WS,
      reconnect: { enabled: false },
    });
    const socket = await connectWithFakeSocket(client);

    const posts: unknown[] = [];
    client.on("post", (p) => posts.push(p));

    const payload = {
      platform: "truth",
      username: "realDonaldTrump",
      display_name: "Donald J. Trump",
      user_avatar: "https://example.test/avatar.jpg",
      user_following: 10,
      user_followers: 1000,
      user_id: "107780257626128497",
      key: "109876543210",
      timestamp: "2026-07-28T12:00:00Z",
      seen_at: "2026-07-28T12:00:00.150Z",
      text: "Example Truth post",
    };
    socket.triggerMessage(JSON.stringify(payload));

    expect(posts).toEqual([payload]);
  });

  it("instagram: dispatches raw InstagramPost payloads to the `post` event", async () => {
    const client = createClient({ platform: "instagram", apiKey: "test-key", WebSocketImpl: WS, reconnect: { enabled: false } });
    const socket = await connectWithFakeSocket(client);

    const posts: unknown[] = [];
    client.on("post", (p) => posts.push(p));

    const payload = {
      platform: "instagram",
      username: "natgeo",
      display_name: "National Geographic",
      user_avatar: "https://example.test/avatar.jpg",
      user_followers: 5_000_000,
      user_id: "1234",
      key: "post-1",
      timestamp: "2026-07-28T12:00:00Z",
      seen_at: "2026-07-28T12:00:00.200Z",
      text: "New reel",
      post_type: "reel",
    };
    socket.triggerMessage(JSON.stringify(payload));

    expect(posts).toEqual([payload]);
  });

  it("news: dispatches WebSocketNewsFeedPayload to the `article` event, using explicit wsPath/wsKey (no dashboard fetch needed)", async () => {
    const client = createClient({
      platform: "news",
      apiKey: "test-key",
      wsPath: "/news_459f182",
      wsKey: "news-ws-key",
      WebSocketImpl: WS,
      reconnect: { enabled: false },
    });
    const socket = await connectWithFakeSocket(client);
    expect(socket.url).toBe("wss://newsfeed.1322.io/news_459f182?key=news-ws-key");

    const articles: unknown[] = [];
    client.on("article", (a) => articles.push(a));

    const payload = {
      feed: "BBC News",
      guid: "https://www.bbc.com/news/articles/abc#0",
      url: "https://www.bbc.com/news/articles/abc",
      title: "Example headline",
      publish_time: "2026-07-28T04:52:35+00:00",
      primary_category: "News",
      categories: ["News", "World"],
      author: "BBC",
      keywords: ["example"],
      description: "desc",
      summary: "summary",
      media: [],
      full_text: "Full article body text here...",
      _event_type: "LIVE_POST",
      _sent_time: "2026-07-28T05:35:21.711178+00:00",
    };
    socket.triggerMessage(JSON.stringify(payload));

    expect(articles).toEqual([payload]);
  });

  it("binance: dispatches `binance.post` and `binance.pin.update` envelope frames to their typed events", async () => {
    const client = createClient({
      platform: "binance",
      apiKey: "test-key",
      wsPath: "/v1/ws",
      wsKey: "binance-ws-key",
      WebSocketImpl: WS,
      reconnect: { enabled: false },
    });
    const socket = await connectWithFakeSocket(client);
    expect(socket.url).toBe("wss://binance.1322.io/v1/ws?key=binance-ws-key");

    const posts: unknown[] = [];
    const pinUpdates: unknown[] = [];
    client.on("post", (p) => posts.push(p));
    client.on("pinUpdate", (p) => pinUpdates.push(p));

    const post = {
      id: "1",
      username: "CZ_Binance",
      is_reply: false,
      coin_pairs: ["BTCUSDT"],
      published_at: "2026-07-28T12:00:00Z",
      detected_at: "2026-07-28T12:00:00.180Z",
    };
    socket.triggerMessage(JSON.stringify({ type: "binance.post", data: post }));
    expect(posts).toEqual([post]);

    const pin = { username: "CZ_Binance", added: [post], detected_at: "2026-07-28T12:00:01Z" };
    socket.triggerMessage(JSON.stringify({ type: "binance.pin.update", data: pin }));
    expect(pinUpdates).toEqual([pin]);
  });

  it("youtube: dispatches upload / upgrade / deletion messages to their typed events", async () => {
    const client = createClient({
      platform: "youtube",
      wsUrl: "wss://example.test/youtube-stream",
      WebSocketImpl: WS,
      reconnect: { enabled: false },
    });
    const socket = await connectWithFakeSocket(client);

    const uploads: unknown[] = [];
    const upgrades: unknown[] = [];
    const deletions: unknown[] = [];
    client.on("upload", (m) => uploads.push(m));
    client.on("upgrade", (m) => upgrades.push(m));
    client.on("deletion", (m) => deletions.push(m));

    const upload = {
      type: "upload",
      subtype: "video",
      channel: { id: "UC123", name: "Example Channel", url: "https://youtube.com/channel/UC123" },
      video: { id: "vid1", url: "https://youtube.com/watch?v=vid1", title: "Example video" },
      images: { seed: "https://example.test/seed.jpg", chosen: "https://example.test/chosen.jpg" },
    };
    socket.triggerMessage(JSON.stringify(upload));
    expect(uploads).toEqual([upload]);

    const upgrade = { type: "upgrade", upgrade: { kind: "image", video_id: "vid1", url: "https://example.test/hq.jpg" } };
    socket.triggerMessage(JSON.stringify(upgrade));
    expect(upgrades).toEqual([upgrade]);

    const deletion = {
      type: "deletion",
      video: { id: "vid1", url: "https://youtube.com/watch?v=vid1" },
      channel: { id: "UC123", name: "Example Channel", url: "https://youtube.com/channel/UC123" },
    };
    socket.triggerMessage(JSON.stringify(deletion));
    expect(deletions).toEqual([deletion]);

    // Management endpoints are intentionally unsupported for YouTube (undocumented).
    expect(() => client.track()).toThrow(/not published/);
    expect(() => client.untrack()).toThrow(/not published/);
    expect(() => client.list()).toThrow(/not published/);
  });
});
