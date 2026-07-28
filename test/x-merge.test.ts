import { describe, expect, it } from "vitest";
import { applyDeletion, mergeIncomingTweet } from "../src/platforms/x/merge.js";
import { fullTweet, fullUser, miniTweet, miniUser } from "./fixtures/x.js";

describe("mergeIncomingTweet (additive merge)", () => {
  it("starts a fresh record from the first stage seen (mini)", () => {
    const merged = mergeIncomingTweet(undefined, miniTweet(), "mini");
    expect(merged.id).toBe("1234567890123456789");
    expect(merged.body.text).toBe("short text");
    expect(merged.stages).toEqual(["mini"]);
    expect(merged.metrics).toBeNull(); // mini stage never carries metrics
  });

  it("uses the longest body.text across stages", () => {
    const stage1 = mergeIncomingTweet(undefined, miniTweet({ body: { text: "short", urls: [], mentions: [] } }), "mini");
    const stage2 = mergeIncomingTweet(
      stage1,
      fullTweet({ body: { text: "short but now much longer with more context", urls: [], mentions: [], components: [] } }),
      "update"
    );
    expect(stage2.body.text).toBe("short but now much longer with more context");

    // A later stage with a *shorter* text (e.g. a re-delivered mini event)
    // must not regress the longer text already recorded.
    const stage3 = mergeIncomingTweet(stage2, miniTweet({ body: { text: "short", urls: [], mentions: [] } }), "mini");
    expect(stage3.body.text).toBe("short but now much longer with more context");
  });

  it("unions media arrays without duplicates", () => {
    const stage1 = mergeIncomingTweet(
      undefined,
      miniTweet({ media: { images: ["a.jpg"], videos: [], thumbnails: [], proxied: null } }),
      "mini"
    );
    const stage2 = mergeIncomingTweet(
      stage1,
      fullTweet({ media: { images: ["a.jpg", "b.jpg"], videos: ["c.mp4"], thumbnails: [], proxied: null } }),
      "update"
    );
    expect(stage2.media.images.sort()).toEqual(["a.jpg", "b.jpg"]);
    expect(stage2.media.videos).toEqual(["c.mp4"]);
  });

  it("takes the highest metric values seen across stages", () => {
    const stage1 = mergeIncomingTweet(
      undefined,
      fullTweet({ metrics: { likes: 10, quotes: 1, replies: 2, retweets: 3, advanced: null } }),
      "update"
    );
    const stage2 = mergeIncomingTweet(
      stage1,
      fullTweet({ metrics: { likes: 8, quotes: 5, replies: 2, retweets: 9, advanced: { views: 1000 } } }),
      "full"
    );
    expect(stage2.metrics).toEqual({ likes: 10, quotes: 5, replies: 2, retweets: 9, advanced: { views: 1000 } });
  });

  it("never overwrites a populated field with null (metrics survive a mini-stage event with no metrics)", () => {
    const stage1 = mergeIncomingTweet(
      undefined,
      fullTweet({ metrics: { likes: 42, quotes: 0, replies: 0, retweets: 0, advanced: null } }),
      "update"
    );
    const stage2 = mergeIncomingTweet(stage1, miniTweet(), "mini");
    expect(stage2.metrics).toEqual({ likes: 42, quotes: 0, replies: 0, retweets: 0, advanced: null });
  });

  it("prefers a full TwitterUser author over a mini one once seen, and never regresses", () => {
    const stage1 = mergeIncomingTweet(undefined, miniTweet({ author: miniUser({ handle: "elonmusk" }) }), "mini");
    expect("profile" in stage1.author).toBe(false);

    const stage2 = mergeIncomingTweet(stage1, fullTweet({ author: fullUser() }), "update");
    expect("profile" in stage2.author).toBe(true);

    // A later mini-stage re-delivery must not regress the author back down.
    const stage3 = mergeIncomingTweet(stage2, miniTweet(), "mini");
    expect("profile" in stage3.author).toBe(true);
  });

  it("keeps the deepest subtweet chain and never regresses it to null", () => {
    const level2 = fullTweet({ id: "999" });
    const level1WithChild = fullTweet({ id: "456", subtweet: level2 });

    const stage1 = mergeIncomingTweet(undefined, miniTweet({ subtweet: null }), "mini");
    expect(stage1.subtweet).toBeNull();

    const stage2 = mergeIncomingTweet(stage1, fullTweet({ subtweet: level1WithChild }), "full");
    expect(stage2.subtweet?.id).toBe("456");
    expect(stage2.subtweet?.subtweet?.id).toBe("999");

    // A later event that (per docs) arrives without subtweet info must not
    // wipe out the fullchain we already resolved.
    const stage3 = mergeIncomingTweet(stage2, miniTweet({ subtweet: null }), "mini");
    expect(stage3.subtweet?.id).toBe("456");
    expect(stage3.subtweet?.subtweet?.id).toBe("999");
  });

  it("converges to the same richness regardless of the order stages arrive in", () => {
    const mini = miniTweet({ body: { text: "short", urls: [], mentions: [] } });
    const update = fullTweet({
      body: { text: "a fair bit longer than short", urls: [], mentions: [], components: [] },
      metrics: { likes: 5, quotes: 0, replies: 0, retweets: 0, advanced: null },
    });
    const full = fullTweet({
      body: { text: "a fair bit longer than short, and this is the longest version by far", urls: [], mentions: [], components: [] },
      metrics: { likes: 12, quotes: 3, replies: 1, retweets: 2, advanced: { views: 500 } },
    });

    const forward = mergeIncomingTweet(mergeIncomingTweet(mergeIncomingTweet(undefined, mini, "mini"), update, "update"), full, "full");
    const reversed = mergeIncomingTweet(mergeIncomingTweet(mergeIncomingTweet(undefined, full, "full"), update, "update"), mini, "mini");

    expect(forward.body.text).toBe(full.body.text);
    expect(reversed.body.text).toBe(full.body.text);
    expect(forward.metrics).toEqual(full.metrics);
    expect(reversed.metrics).toEqual(full.metrics);
  });

  it("marks the record deleted without discarding previously merged richness", () => {
    const richState = mergeIncomingTweet(
      undefined,
      fullTweet({
        body: { text: "the real final text", urls: [], mentions: [], components: [] },
        metrics: { likes: 100, quotes: 1, replies: 1, retweets: 1, advanced: null },
      }),
      "full"
    );

    // The deletion payload itself may carry stale (lower) metrics per the docs.
    const deleted = applyDeletion(richState, fullTweet({ metrics: { likes: 90, quotes: 0, replies: 0, retweets: 0, advanced: null } }), 1_700_000_500_000);

    expect(deleted.deletedAt).toBe(1_700_000_500_000);
    expect(deleted.body.text).toBe("the real final text");
    expect(deleted.metrics?.likes).toBe(100); // highest value wins, not the deletion payload's stale count
  });
});
