import { BaseClient, type CommonClientOptions, type PlatformId } from "../../types.js";
import type { EventMap } from "../../emitter.js";
import { WsConnectionEngine } from "../../ws-connection.js";
import { ConfigError, NotSupportedError } from "../../errors.js";
import type { UploadMessage, UpgradeMessage, DeletionMessage, YouTubeTrackerMessage } from "./types.js";

const NOT_SUPPORTED_MESSAGE =
  "YouTube management endpoints (track/untrack/list) are not published on https://1322.io/docs at this time -- " +
  "the docs only cover the WebSocket event payloads. Manage tracked channels from the 1322 dashboard, or reach " +
  "out to support@1322.io / https://discord.gg/1322 for API-based management.";

export interface YouTubeClientConfig extends CommonClientOptions {
  platform: "youtube";
  /**
   * The full YouTube tracker WebSocket URL for your account (including any
   * auth query parameter it requires), as issued in your 1322 dashboard.
   * Required: https://1322.io/docs does not publish a fixed base
   * URL/path/auth format for this platform, so it can't be constructed
   * from an `apiKey` the way the other five platforms' clients do.
   */
  wsUrl: string;
  /**
   * Not used to build the WebSocket URL (see `wsUrl`); kept so the config
   * shape stays consistent with the other platforms and so you have a
   * place to store the key if your own code needs it.
   */
  apiKey?: string;
}

export interface YouTubeClientEvents extends EventMap {
  upload: [message: UploadMessage];
  upgrade: [message: UpgradeMessage];
  deletion: [message: DeletionMessage];
}

export class YouTubeClient extends BaseClient<YouTubeClientEvents> {
  readonly platform: PlatformId = "youtube";

  private readonly engine: WsConnectionEngine;

  constructor(config: YouTubeClientConfig) {
    super();
    if (!config.wsUrl) {
      throw new ConfigError(
        'youtube client: `wsUrl` is required. https://1322.io/docs does not publish a fixed WebSocket URL format for YouTube; copy the full URL issued for your account from the 1322 dashboard.'
      );
    }

    this.engine = new WsConnectionEngine({
      resolveUrl: () => config.wsUrl,
      WebSocketImpl: config.WebSocketImpl,
      reconnect: config.reconnect,
      onOpen: () => this.emit("open"),
      onClose: (info) => this.emit("close", info),
      onError: (error) => this.emit("error", error),
      onReconnecting: (info) => this.emit("reconnecting", info),
      onMessage: (data) => this.handleRawMessage(data),
    });
  }

  private handleRawMessage(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      this.emit("error", new Error(`Failed to parse YouTube WebSocket message as JSON: ${(err as Error).message}`));
      return;
    }
    this.emit("message", parsed);

    const message = parsed as YouTubeTrackerMessage;
    switch (message.type) {
      case "upload":
        this.emit("upload", message);
        return;
      case "upgrade":
        this.emit("upgrade", message);
        return;
      case "deletion":
        this.emit("deletion", message);
        return;
      default:
        return;
    }
  }

  async connect(): Promise<void> {
    await this.engine.connect();
  }

  disconnect(): void {
    this.engine.disconnect();
  }

  isConnected(): boolean {
    return this.engine.isConnected();
  }

  // ---- Management API ----
  // Not documented for YouTube -- see NOT_SUPPORTED_MESSAGE.

  list(): never {
    throw new NotSupportedError(NOT_SUPPORTED_MESSAGE);
  }

  track(): never {
    throw new NotSupportedError(NOT_SUPPORTED_MESSAGE);
  }

  untrack(): never {
    throw new NotSupportedError(NOT_SUPPORTED_MESSAGE);
  }
}
