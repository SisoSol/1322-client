# 1322-client

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE) [![Built for 1322.io](https://img.shields.io/badge/built%20for-1322.io-3b82f6?style=flat-square)](https://1322.io)

Unified TypeScript/JavaScript client for the [1322](https://1322.io) real-time
social monitoring API. One `createClient()` call, one consistent
`connect()` / `on()` / `track()` shape, across all six platforms 1322
covers: **X (Twitter), Truth Social, Instagram, YouTube, Binance Square, and
News**.

1322 already publishes six separate single-platform example repos (one
WebSocket client each, in Node/Python). This package replaces "pick the repo
for your platform and copy the script" with an installable client: proper
types for every event and REST payload, automatic reconnect with the
documented backoff, and -- for X specifically -- the additive-merge/dedup
logic the docs recommend you implement yourself.

Full endpoint and payload reference: **[1322.io/docs](https://1322.io/docs)**.

## Install

Not yet published to npm (see [Status](#status) below). Install straight from
GitHub, which works today:

```bash
npm install git+https://github.com/SisoSol/1322-client.git
```

(The shorter `npm install github:SisoSol/1322-client` form works too, but npm
resolves it to an SSH git URL by default -- it'll fail with a confusing
`Permission denied (publickey)` error on any machine without an SSH key
registered on GitHub. The `git+https://` form above always works.)

Once published to npm:

```bash
npm install 1322-client
```

Requires Node.js 18+. Ships both ESM and CommonJS builds with bundled
`.d.ts` types.

## Quick start

```ts
import { createClient } from "1322-client";

const client = createClient({ platform: "x", apiKey: "YOUR_API_KEY_HERE" });

client.on("tweet", (tweet) => {
  console.log(`@${tweet.author.handle}: ${tweet.body.text}`);
});

await client.connect();
```

`platform` selects which of the six clients you get back, and TypeScript
narrows the config fields, event names, and payload types to match --
`client.on("tweet", ...)` only exists (and is only typed as a merged X tweet)
when `platform: "x"`.

## Platform capability matrix

Every client exposes the same shape: `connect()`, `disconnect()`,
`isConnected()`, `on()` / `off()` / `once()`, and the lifecycle events `open`,
`close`, `error`, `reconnecting`, `message`. What differs per platform is the
data events and the management (`track()` / `untrack()` / `list()`) methods,
because that's what the underlying 1322 API actually looks like per platform
-- see [1322.io/docs](https://1322.io/docs) for the authoritative contract
each of these maps to.

| Platform | `platform` value | Data events | `track()` / `untrack()` / `list()` |
| --- | --- | --- | --- |
| X / Twitter | `"x"` | `tweetMiniUpdate`, `tweetUpdate`, `tweetExpanded`, `tweetFull`, `tweetDeleted`, `profileUpdate`, `profilePinned`, `profileUnpinned`, `followingUpdate`, and merged `tweet` | Yes (`GET/POST/DELETE /v1/tracked`) |
| Truth Social | `"truth"` | `post` | Yes (`POST /v1/track`, `/v1/untrack`, `GET /v1/list`) |
| Instagram | `"instagram"` | `post` | Yes (`POST /v1/track`, `/v1/untrack`, `GET /v1/list`) |
| News | `"news"` | `article` | Yes, as subscribe/unsubscribe to named feeds |
| Binance Square | `"binance"` | `post`, `pinUpdate` | Yes (`POST /v1/track`, `/v1/untrack`) |
| YouTube | `"youtube"` | `upload`, `upgrade`, `deletion` | **No** -- see [YouTube](#youtube) below |

## Examples

Every example below uses a placeholder key. Never commit a real one -- copy
[`.env.example`](.env.example) to `.env` and load your keys from environment
variables instead.

### X / Twitter

```ts
import { createClient } from "1322-client";

const client = createClient({
  platform: "x",
  apiKey: "YOUR_API_KEY_HERE",
  tier: "normal", // "normal" | "ultimate" | "hybrid" (see below)
});

// The additive-merged, deduplicated view of a tweet -- recommended for most
// consumers. Fires again every time a richer stage (mini -> update ->
// expanded -> full) arrives for the same tweet id.
client.on("tweet", (tweet) => {
  console.log(tweet.id, tweet.body.text, tweet.media.images);
});

// Or handle each documented stage/event individually:
client.on("tweetDeleted", ({ tweet, deletedAt }) => {
  console.log(`deleted: ${tweet.id} at ${new Date(deletedAt).toISOString()}`);
});

client.on("reconnecting", ({ attempt, delayMs }) => {
  console.log(`reconnecting (attempt ${attempt}) in ${delayMs}ms`);
});

await client.connect();

// Management API
await client.track(["elonmusk", "twitter"]); // comma-joined, resolved server-side
await client.list();
```

`tier: "hybrid"` opens both the Normal and Ultimate WebSocket streams at once
(pass `ultimateApiKey`) and deduplicates tweets between them by id, per the
"Hybrid Clients" guidance in the docs.

### Truth Social

```ts
import { createClient } from "1322-client";

const client = createClient({
  platform: "truth",
  apiKey: "YOUR_API_KEY_HERE",
  // Path + key are issued per-account in your 1322 dashboard configuration
  // -- there is no REST endpoint that discovers them, unlike News/Binance.
  wsPath: "YOUR_WS_PATH_HERE",
});

client.on("post", (post) => {
  console.log(`@${post.username}: ${post.text}`);
});

await client.connect();
await client.track("realDonaldTrump");
```

### Instagram

```ts
import { createClient } from "1322-client";

const client = createClient({ platform: "instagram", apiKey: "YOUR_API_KEY_HERE" });

client.on("post", (post) => {
  console.log(`${post.post_type} from @${post.username}: ${post.text}`);
});

await client.connect();
await client.track("natgeo");
```

### News

```ts
import { createClient } from "1322-client";

const client = createClient({ platform: "news", apiKey: "YOUR_API_KEY_HERE" });

client.on("article", (article) => {
  console.log(`[${article.feed}] ${article.title}`);
});

// wsPath/wsKey are optional -- if omitted, connect() fetches them from
// GET /v1/dashboard automatically before opening the socket.
await client.connect();
await client.track("BBC News"); // subscribes to the named feed
```

### Binance Square

```ts
import { createClient } from "1322-client";

const client = createClient({ platform: "binance", apiKey: "YOUR_API_KEY_HERE" });

client.on("post", (post) => {
  console.log(`@${post.username}: ${post.text ?? post.title} ${post.coin_pairs?.join(",") ?? ""}`);
});

client.on("pinUpdate", (update) => {
  console.log(`pin change for @${update.username}`);
});

await client.connect(); // wsPath/wsKey auto-fetched from GET /v1/dashboard if omitted
await client.track("CZ_Binance");
```

### YouTube

```ts
import { createClient } from "1322-client";

const client = createClient({
  platform: "youtube",
  // https://1322.io/docs does not publish a fixed base URL, path format, or
  // auth scheme for the YouTube WebSocket the way it does for the other
  // five platforms -- copy the exact URL issued for your account from the
  // 1322 dashboard. track()/untrack()/list() are unavailable for the same
  // reason; manage tracked channels from the dashboard.
  wsUrl: "YOUR_YOUTUBE_WS_URL_HERE",
});

client.on("upload", (msg) => console.log(`new ${msg.subtype}: ${msg.video.title}`));
client.on("upgrade", (msg) => console.log(`thumbnail upgraded: ${msg.upgrade.video_id}`));
client.on("deletion", (msg) => console.log(`removed: ${msg.video.id}`));

await client.connect();
```

## Reconnect behavior

Every client reconnects automatically after an unexpected disconnect, using
the exponential backoff documented at
[1322.io/docs](https://1322.io/docs): **1s, 2s, 4s, 8s, 16s, capped at 30s.**
No events are queued while disconnected -- you may miss events while offline,
same as the raw WebSocket. `connect()` resolves once the socket has opened
for the first time; later drops reconnect in the background and emit
`reconnecting` / `open` / `close`, without needing you to await anything
again.

```ts
const client = createClient({
  platform: "x",
  apiKey: "YOUR_API_KEY_HERE",
  reconnect: {
    enabled: true, // set false to disable auto-reconnect entirely
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    factor: 2,
    jitter: 0, // e.g. 0.2 for +/-20% jitter, useful when running many instances
  },
});
```

Call `client.disconnect()` to close the connection and stop reconnecting.

## X additive merge and dedup

The X WebSocket sends a tweet in progressively richer stages
(`tweet.mini.update` -> `tweet.update` -> `tweet.update.expanded` ->
`tweet.full`), each one enriching the last, per the docs' "Additive Merge"
guidance. This package implements that merge for you: every stage for the
same tweet id is combined into one `MergedTweet` record --

- the longest `body.text` wins
- media arrays are unioned
- the deepest `subtweet` chain is kept
- metrics take the highest value seen
- a populated field is never overwritten with `null`

-- and emitted as the `tweet` event. The merge is order-tolerant (useful for
`tier: "hybrid"`, where the same tweet id can arrive on both streams) and
runs against a bounded, TTL-expiring cache (`merge: { maxSize, ttlMs }` in
the config; defaults to 200 entries / 5 minutes) so long-running processes
don't leak memory. Disable it with `merge: { enabled: false }` if you'd
rather handle the raw per-stage events yourself.

```ts
import { TweetMergeCache, mergeIncomingTweet } from "1322-client";

// Both are exported directly if you want the merge logic without the WebSocket client.
```

## Status

This package is feature-complete and tested but **not yet published to
npm** -- install with `npm install git+https://github.com/SisoSol/1322-client.git`
in the meantime (see [Install](#install)). The package name is the unscoped
`1322-client`; a scoped `@1322/client` alias may be published later if a
`1322` npm organization is set up, but unscoped works today without any
extra account setup.

## Development

```bash
npm install
npm run build      # tsup -> dist/ (ESM + CJS + .d.ts)
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

Tests cover reconnect backoff math, the WebSocket reconnect engine (fake
socket + fake timers, no network), the X additive-merge/dedup logic, per-platform
event parsing against real doc-derived payload shapes, the REST helper, and
config validation. They intentionally do not hit the live 1322 API -- there's
no way to test against real X/Truth/Instagram/etc. data without a paid API
key, so live-network behavior isn't covered by this suite.

## Related

- [1322.io](https://1322.io) -- the product this package is a client for
- [1322.io/docs](https://1322.io/docs) -- full endpoint and payload reference
- [1322.io/pricing](https://1322.io/pricing) -- plans start at $150/month (YouTube) and $250/month (X)
- Single-platform example scripts: [social-monitor-examples](https://github.com/SisoSol/social-monitor-examples), [binance-square-realtime](https://github.com/SisoSol/binance-square-realtime)

## License

MIT, see [LICENSE](LICENSE).
