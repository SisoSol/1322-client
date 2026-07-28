/**
 * Reconnect policy. Defaults match the behavior documented at
 * https://1322.io/docs for the X/Twitter WebSocket ("exponential backoff
 * 1s, 2s, 4s, 8s... capped at 30s"); every platform's WS in this package
 * reuses the same policy since none of the docs specify a different one.
 */
export interface ReconnectOptions {
  /** Whether to automatically reconnect after an unexpected close. Default true. */
  enabled: boolean;
  /** Delay before the first reconnect attempt, in ms. Default 1000. */
  initialDelayMs: number;
  /** Delay ceiling; backoff never exceeds this, in ms. Default 30000. */
  maxDelayMs: number;
  /** Multiplier applied per attempt. Default 2 (doubling). */
  factor: number;
  /**
   * Optional random jitter fraction in [0, 1). 0 (default) reproduces the
   * exact documented sequence (1s, 2s, 4s, 8s, ...). A value like 0.2 adds
   * up to +/-20% jitter to each delay to avoid thundering-herd reconnects
   * when running many client instances.
   */
  jitter: number;
}

export const DEFAULT_RECONNECT_OPTIONS: ReconnectOptions = {
  enabled: true,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
  jitter: 0,
};

export function resolveReconnectOptions(overrides?: Partial<ReconnectOptions>): ReconnectOptions {
  return { ...DEFAULT_RECONNECT_OPTIONS, ...overrides };
}

/**
 * Pure backoff calculation: delay(attempt) = min(initialDelayMs * factor^attempt, maxDelayMs).
 * `attempt` is 0-indexed (0 = delay before the first reconnect try).
 *
 * With the documented defaults this produces 1000, 2000, 4000, 8000, 16000,
 * 30000, 30000, ... exactly matching "1s, 2s, 4s, 8s... capped at 30s".
 *
 * `random` is injectable purely for deterministic testing of the jitter path;
 * it defaults to Math.random and callers never need to pass it.
 */
export function computeBackoffDelay(
  attempt: number,
  options: ReconnectOptions = DEFAULT_RECONNECT_OPTIONS,
  random: () => number = Math.random
): number {
  if (!Number.isFinite(attempt) || attempt < 0) {
    throw new RangeError(`attempt must be a non-negative finite number, got ${attempt}`);
  }
  const { initialDelayMs, maxDelayMs, factor, jitter } = options;
  const raw = initialDelayMs * Math.pow(factor, attempt);
  const capped = Math.min(raw, maxDelayMs);

  if (!jitter) return capped;

  // Jitter is applied as +/- (jitter * capped), then re-clamped into
  // [0, maxDelayMs] so it can never push the delay past the documented cap
  // or below zero.
  const spread = capped * jitter;
  const jittered = capped + (random() * 2 - 1) * spread;
  return Math.max(0, Math.min(jittered, maxDelayMs));
}
