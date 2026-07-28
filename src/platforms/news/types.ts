// Types transcribed from https://1322.io/docs (News Feed section).

export interface NewsMediaAttachment {
  url: string;
  type: "image" | "video";
  caption?: string;
}

export interface WebSocketNewsFeedPayload {
  /** Provider, e.g. "BBC News" | "NYPost" | "Fox News" | ... */
  feed: string;
  /** Unique article ID (typically a URL hash). Use this for deduplication. */
  guid: string;
  url: string;
  title: string;
  publish_time: string;
  modified_time?: string;
  primary_category: string;
  categories: string[];
  author: string;
  keywords: string[];
  description: string;
  summary: string;
  media: NewsMediaAttachment[];
  /** Complete extracted article body text. */
  full_text: string;
  language?: string;
  copyright?: string | null;
  _event_type: "LIVE_POST";
  /** ISO-8601 dispatch timestamp. */
  _sent_time: string;
}

// ---- Management API (REST) ----

export interface NewsDashboardResponse {
  status: string;
  feeds: string[];
  current: number;
  max_feeds: number;
  ws_path: string;
  ws_key: string;
}

export interface NewsSubscribeResponse {
  status: string;
  feed: string;
  feeds: string[];
  current: number;
  max_feeds: number;
}

export interface NewsUnsubscribeResponse {
  status: string;
  feed: string;
  feeds: string[];
  current: number;
  max_feeds: number;
}
