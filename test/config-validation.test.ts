import { describe, expect, it } from "vitest";
import { createClient } from "../src/create-client.js";
import { ConfigError } from "../src/errors.js";

describe("config validation", () => {
  it("x: requires apiKey", () => {
    // @ts-expect-error -- intentionally omitting a required field to test the runtime guard
    expect(() => createClient({ platform: "x" })).toThrow(ConfigError);
  });

  it('x: requires ultimateApiKey when tier is "hybrid"', () => {
    expect(() => createClient({ platform: "x", apiKey: "k", tier: "hybrid" })).toThrow(/ultimateApiKey/);
  });

  it('x: rejects `wsUrl` combined with tier "hybrid" (ambiguous which stream it targets)', () => {
    expect(() =>
      createClient({ platform: "x", apiKey: "k", ultimateApiKey: "u", tier: "hybrid", wsUrl: "wss://example.test" })
    ).toThrow(/wsUrl/);
  });

  it("truth: requires apiKey", () => {
    // @ts-expect-error -- intentionally omitting a required field to test the runtime guard
    expect(() => createClient({ platform: "truth" })).toThrow(ConfigError);
  });

  it("truth: connect() rejects when neither wsUrl nor wsPath is configured", async () => {
    const client = createClient({ platform: "truth", apiKey: "k" });
    await expect(client.connect()).rejects.toThrow(/wsPath/);
  });

  it("instagram: requires apiKey", () => {
    // @ts-expect-error -- intentionally omitting a required field to test the runtime guard
    expect(() => createClient({ platform: "instagram" })).toThrow(ConfigError);
  });

  it("news: requires apiKey", () => {
    // @ts-expect-error -- intentionally omitting a required field to test the runtime guard
    expect(() => createClient({ platform: "news" })).toThrow(ConfigError);
  });

  it("binance: requires apiKey", () => {
    // @ts-expect-error -- intentionally omitting a required field to test the runtime guard
    expect(() => createClient({ platform: "binance" })).toThrow(ConfigError);
  });

  it("youtube: requires wsUrl (no documented default transport)", () => {
    // @ts-expect-error -- intentionally omitting a required field to test the runtime guard
    expect(() => createClient({ platform: "youtube" })).toThrow(/wsUrl/);
  });

  it("rejects an unknown platform at runtime", () => {
    // @ts-expect-error -- intentionally passing an invalid platform to test the runtime guard
    expect(() => createClient({ platform: "mastodon", apiKey: "k" })).toThrow(/Unknown platform/);
  });
});
