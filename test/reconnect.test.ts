import { describe, expect, it } from "vitest";
import { computeBackoffDelay, resolveReconnectOptions, DEFAULT_RECONNECT_OPTIONS } from "../src/reconnect.js";

describe("computeBackoffDelay", () => {
  it("matches the documented sequence: 1s, 2s, 4s, 8s, 16s, capped at 30s", () => {
    const delays = [0, 1, 2, 3, 4, 5, 6, 7].map((attempt) => computeBackoffDelay(attempt));
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it("never exceeds maxDelayMs no matter how large the attempt number is", () => {
    const opts = resolveReconnectOptions();
    expect(computeBackoffDelay(20, opts)).toBe(opts.maxDelayMs);
    expect(computeBackoffDelay(1000, opts)).toBe(opts.maxDelayMs);
  });

  it("is monotonically non-decreasing as attempt increases", () => {
    let previous = -Infinity;
    for (let attempt = 0; attempt < 15; attempt++) {
      const delay = computeBackoffDelay(attempt);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });

  it("respects custom initialDelayMs / maxDelayMs / factor", () => {
    const opts = resolveReconnectOptions({ initialDelayMs: 500, maxDelayMs: 4000, factor: 3 });
    expect(computeBackoffDelay(0, opts)).toBe(500);
    expect(computeBackoffDelay(1, opts)).toBe(1500);
    expect(computeBackoffDelay(2, opts)).toBe(4000); // 500*9=4500, capped to 4000
    expect(computeBackoffDelay(3, opts)).toBe(4000);
  });

  it("defaults to the documented policy when no overrides are given", () => {
    expect(DEFAULT_RECONNECT_OPTIONS).toEqual({
      enabled: true,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      factor: 2,
      jitter: 0,
    });
  });

  it("throws on a negative or non-finite attempt", () => {
    expect(() => computeBackoffDelay(-1)).toThrow(RangeError);
    expect(() => computeBackoffDelay(Number.NaN)).toThrow(RangeError);
    expect(() => computeBackoffDelay(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  describe("jitter", () => {
    it("returns the exact capped delay when jitter is 0 (default)", () => {
      const opts = resolveReconnectOptions({ jitter: 0 });
      expect(computeBackoffDelay(3, opts)).toBe(8000);
    });

    it("stays within +/- jitter fraction of the capped delay", () => {
      const opts = resolveReconnectOptions({ jitter: 0.2 });
      const capped = 8000;
      // Deterministic random stub: 0 -> minimum, 0.5 -> exact, 1 -> maximum.
      expect(computeBackoffDelay(3, opts, () => 0)).toBeCloseTo(capped - capped * 0.2, 5);
      expect(computeBackoffDelay(3, opts, () => 0.5)).toBeCloseTo(capped, 5);
      expect(computeBackoffDelay(3, opts, () => 1)).toBeCloseTo(capped + capped * 0.2, 5);
    });

    it("never lets jitter push the delay above maxDelayMs or below zero", () => {
      const opts = resolveReconnectOptions({ initialDelayMs: 20000, maxDelayMs: 30000, factor: 2, jitter: 0.9 });
      // attempt 5 would be uncapped-huge; capped value is 30000, jitter could
      // in principle push it to 30000 * 1.9 without the re-clamp.
      expect(computeBackoffDelay(5, opts, () => 1)).toBeLessThanOrEqual(30000);
      expect(computeBackoffDelay(0, opts, () => 0)).toBeGreaterThanOrEqual(0);
    });
  });
});
