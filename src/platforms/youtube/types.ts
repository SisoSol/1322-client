// Types transcribed from https://1322.io/docs (YouTube section). Unlike the
// other five platforms, the YouTube docs page only publishes the event
// payload shapes (triple event model: upload, upgrade, deletion) -- it does
// not publish a base REST URL, a WebSocket URL/path format, or any
// management (track/untrack/list) endpoints. See `YouTubeClientConfig` and
// `YouTubeClient` in ./client.ts for how this package handles that gap.

export interface UploadMessage {
  type: "upload";
  subtype: "video" | "short";
  channel: {
    id: string | null;
    name: string;
    url: string | null;
  };
  video: {
    id: string;
    url: string;
    title: string | null;
    metadata?: {
      duration_seconds?: number;
      category?: string;
    };
  };
  images: {
    seed: string | null;
    /** Best available thumb. */
    chosen: string | null;
  };
}

export interface UpgradeMessage {
  type: "upgrade";
  upgrade: {
    kind: "image";
    video_id: string;
    /** New HQ thumbnail. */
    url: string;
  };
}

export interface DeletionMessage {
  type: "deletion";
  video: {
    /** The deleted video's ID. */
    id: string;
    /** Original video URL. */
    url: string;
  };
  channel: {
    id: string | null;
    name: string;
    url: string | null;
  };
}

export type YouTubeTrackerMessage = UploadMessage | UpgradeMessage | DeletionMessage;
