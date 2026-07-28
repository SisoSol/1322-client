import { describe, expect, it } from "vitest";
import { HttpClient } from "../src/http.js";
import { ApiError } from "../src/errors.js";

interface RecordedCall {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: string | undefined;
}

function makeFakeFetch(response: { status: number; body: unknown }) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({
      url: String(input),
      method: init?.method,
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body,
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => JSON.stringify(response.body),
    } as Response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("HttpClient", () => {
  it("sends default headers and GET by default", async () => {
    const { fetchImpl, calls } = makeFakeFetch({ status: 200, body: { ok: true } });
    const client = new HttpClient("https://api.example.test", { fetchImpl, defaultHeaders: { "X-API-Key": "secret" } });

    const result = await client.get<{ ok: boolean }>("/v1/health");

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.example.test/v1/health");
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.headers["X-API-Key"]).toBe("secret");
  });

  it("serializes query params, skipping undefined values", async () => {
    const { fetchImpl, calls } = makeFakeFetch({ status: 200, body: {} });
    const client = new HttpClient("https://api.example.test", { fetchImpl });

    await client.get("/v1/data/tweet/123", { query: { full: true, expanded: undefined } });

    expect(calls[0]!.url).toBe("https://api.example.test/v1/data/tweet/123?full=true");
  });

  it("JSON-encodes the body and sets Content-Type on POST", async () => {
    const { fetchImpl, calls } = makeFakeFetch({ status: 200, body: { success: true } });
    const client = new HttpClient("https://api.example.test", { fetchImpl });

    await client.post("/v1/tracked", { identifiers: "elonmusk", type: "username" });

    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ identifiers: "elonmusk", type: "username" });
  });

  it("uses DELETE for client.delete()", async () => {
    const { fetchImpl, calls } = makeFakeFetch({ status: 200, body: { success: true } });
    const client = new HttpClient("https://api.example.test", { fetchImpl });

    await client.delete("/v1/tracked", { identifiers: "elonmusk" });

    expect(calls[0]!.method).toBe("DELETE");
  });

  it("throws ApiError with status/url/body on a non-2xx response", async () => {
    const { fetchImpl } = makeFakeFetch({ status: 429, body: { error: "rate limited" } });
    const client = new HttpClient("https://api.example.test", { fetchImpl });

    await expect(client.get("/v1/tracked")).rejects.toMatchObject({
      status: 429,
      url: "https://api.example.test/v1/tracked",
      body: { error: "rate limited" },
    });
    await expect(client.get("/v1/tracked")).rejects.toBeInstanceOf(ApiError);
  });

  it("strips trailing slashes from the base URL", async () => {
    const { fetchImpl, calls } = makeFakeFetch({ status: 200, body: {} });
    const client = new HttpClient("https://api.example.test/", { fetchImpl });

    await client.get("/v1/health");

    expect(calls[0]!.url).toBe("https://api.example.test/v1/health");
  });
});
