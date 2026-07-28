// Types transcribed from https://1322.io/docs (Instagram section).

export interface InstagramMediaAttachment {
  /** Backward-compatible type. Video COVER frames stay 'image' here so existing clients keep working. */
  kind: "image" | "video";
  /** Precise type + recommended discriminator (use media_role). */
  kind_v2?: "image" | "video_cover" | "video";
  media_role?: "image" | "video_cover" | "video";
  /** True only for a video's preview/cover frame. */
  is_video_cover?: boolean;
  /** Index within media[]. */
  media_index: number;
  /** Original IG carousel index (video + its cover share it). */
  carousel_index?: number;
  /** Ordinal among video items. */
  video_index?: number;
  /** On a video: matching cover item in media[]. */
  cover_media_index?: number;
  /** On a video: URL of the matching cover image. */
  cover_url?: string;
  /** On a cover: matching video item in media[]. */
  covers_video_media_index?: number;
  /** On a cover: URL of the matching video file. */
  covers_video_url?: string;
  /** CDN/proxy URL (images via wsrv.nl; video via igmedia.1322.io). */
  url: string;
  width?: number;
  height?: number;
  /** ISO-8601 UTC. */
  created_at: string;
}

export interface InstagramPost {
  platform: "instagram";
  username: string;
  display_name: string;
  user_avatar: string;
  user_followers: number;
  user_id: string;
  /** Post id. */
  key: string;
  timestamp: string;
  seen_at: string;
  text: string;
  post_type: "post" | "reel" | "story" | "carousel";
  media_count?: number;
  hashtags?: string[];
  /** Includes coauthor usernames even when not @-mentioned. */
  mentions?: string[];
  media?: InstagramMediaAttachment[];
  /** Coauthor present, or owner != tracked account. */
  is_collab?: boolean;
  /** Other accounts on the collab (excludes tracked). */
  collab_with?: string[];
  /** Pinned to the tracked account's profile. */
  is_pinned?: boolean;
  /** Paid / branded-content flag from IG. */
  is_paid_partnership?: boolean;
  /** Place tag when the post has one. */
  location?: {
    name: string;
    lat?: number;
    lng?: number;
  };
}

// ---- Management API (REST) ----

export interface InstagramHealthResponse {
  ok: boolean;
}

export interface InstagramLimitsResponse {
  status: string;
  max_tracked: number;
  current: number;
  rpm: number;
}

export interface InstagramListResponse {
  status: string;
  tracked: string[];
  current: number;
  max_tracked: number;
}

export interface InstagramTrackResponse {
  status: string;
  message: string;
  tracked: string[];
  current: number;
  max_tracked: number;
}

export interface InstagramUntrackResponse {
  status: string;
  message: string;
  tracked: string[];
  current: number;
  max_tracked: number;
}

/** Error codes documented for POST /v1/track. */
export type InstagramTrackErrorCode = "list_full" | "already_tracked" | "invalid_user" | "storage_error";
