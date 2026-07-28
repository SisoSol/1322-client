import { ApiError } from "./errors.js";

export type FetchLike = typeof fetch;

export interface RequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * Thin JSON REST helper shared by every platform adapter. Not a general
 * purpose HTTP client -- just enough to call the documented 1322
 * management endpoints and surface failures as `ApiError`.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly defaultHeaders: Record<string, string>;

  constructor(baseUrl: string, opts: { fetchImpl?: FetchLike; defaultHeaders?: Record<string, string> } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    if (opts.fetchImpl) {
      this.fetchImpl = opts.fetchImpl;
    } else {
      if (typeof fetch !== "function") {
        throw new Error(
          "No global fetch() found. Pass `fetchImpl` in the client config, or run on Node 18+ / a browser where fetch is available."
        );
      }
      this.fetchImpl = fetch;
    }
    this.defaultHeaders = opts.defaultHeaders ?? {};
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path.startsWith("http") ? path : `${this.baseUrl}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = { ...this.defaultHeaders, ...options.headers };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const res = await this.fetchImpl(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body,
    });

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      throw new ApiError(`1322 API request failed: ${options.method ?? "GET"} ${url.toString()} -> ${res.status}`, {
        status: res.status,
        url: url.toString(),
        body: parsed,
      });
    }

    return parsed as T;
  }

  get<T>(path: string, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  delete<T>(path: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE", body });
  }
}
