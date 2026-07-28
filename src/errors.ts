/** Base class for every error this package throws. */
export class OneThreeTwoTwoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OneThreeTwoTwoError";
  }
}

/** Thrown when a client is configured incorrectly (missing required fields, bad combination of options). */
export class ConfigError extends OneThreeTwoTwoError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Thrown when calling a method that a platform does not support, or does not
 * publicly document. See the "Platform capability matrix" section of the
 * README for exactly what is available per platform.
 */
export class NotSupportedError extends OneThreeTwoTwoError {
  constructor(message: string) {
    super(message);
    this.name = "NotSupportedError";
  }
}

/** Thrown when a REST call to the 1322 API returns a non-2xx response. */
export class ApiError extends OneThreeTwoTwoError {
  readonly status: number;
  readonly url: string;
  readonly body: unknown;

  constructor(message: string, opts: { status: number; url: string; body: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.url = opts.url;
    this.body = opts.body;
  }
}
