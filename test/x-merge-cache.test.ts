import { describe, expect, it } from "vitest";
import { TweetMergeCache } from "../src/platforms/x/merge.js";
import { miniTweet } from "./fixtures/x.js";

describe("TweetMergeCache", () => {
  it("dedupes repeated stage events for the same id into a single growing record", () => {
    const cache = new TweetMergeCache();
    cache.mergeStage("1", miniTweet({ id: "1", body: { text: "a", urls: [], mentions: [] } }), "mini");
    cache.mergeStage("1", miniTweet({ id: "1", body: { text: "a longer version", urls: [], mentions: [] } }), "mini");
    expect(cache.size).toBe(1);
    expect(cache.get("1")?.body.text).toBe("a longer version");
  });

  it("evicts the least recently touched entry once maxSize is exceeded", () => {
    let now = 0;
    const cache = new TweetMergeCache({ maxSize: 2, now: () => now });
    cache.mergeStage("1", miniTweet({ id: "1" }), "mini");
    cache.mergeStage("2", miniTweet({ id: "2" }), "mini");
    cache.mergeStage("3", miniTweet({ id: "3" }), "mini"); // evicts "1"

    expect(cache.size).toBe(2);
    expect(cache.get("1")).toBeUndefined();
    expect(cache.get("2")).toBeDefined();
    expect(cache.get("3")).toBeDefined();
  });

  it("re-touching an entry protects it from eviction (LRU, not insertion order)", () => {
    let now = 0;
    const cache = new TweetMergeCache({ maxSize: 2, now: () => now });
    cache.mergeStage("1", miniTweet({ id: "1" }), "mini");
    cache.mergeStage("2", miniTweet({ id: "2" }), "mini");
    cache.mergeStage("1", miniTweet({ id: "1", body: { text: "updated", urls: [], mentions: [] } }), "mini"); // touch "1" again
    cache.mergeStage("3", miniTweet({ id: "3" }), "mini"); // should evict "2", not "1"

    expect(cache.get("1")).toBeDefined();
    expect(cache.get("2")).toBeUndefined();
    expect(cache.get("3")).toBeDefined();
  });

  it("expires entries after ttlMs and does not return stale data", () => {
    let now = 0;
    const cache = new TweetMergeCache({ ttlMs: 1000, now: () => now });
    cache.mergeStage("1", miniTweet({ id: "1" }), "mini");
    expect(cache.get("1")).toBeDefined();

    now = 999;
    expect(cache.get("1")).toBeDefined();

    now = 1001;
    expect(cache.get("1")).toBeUndefined();
    expect(cache.size).toBe(0); // expired entries are purged on access
  });

  it("refreshes the TTL every time a stage is merged in", () => {
    let now = 0;
    const cache = new TweetMergeCache({ ttlMs: 1000, now: () => now });
    cache.mergeStage("1", miniTweet({ id: "1" }), "mini");

    now = 900;
    cache.mergeStage("1", miniTweet({ id: "1" }), "mini"); // refresh

    now = 1500; // would have expired under the original TTL, but was refreshed at t=900
    expect(cache.get("1")).toBeDefined();
  });

  it("clear() empties the cache and delete() removes a single entry", () => {
    const cache = new TweetMergeCache();
    cache.mergeStage("1", miniTweet({ id: "1" }), "mini");
    cache.mergeStage("2", miniTweet({ id: "2" }), "mini");

    expect(cache.delete("1")).toBe(true);
    expect(cache.get("1")).toBeUndefined();
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);
  });
});
