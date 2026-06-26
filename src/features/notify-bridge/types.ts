export type NotifyBridgeLevel = "info" | "success" | "warning" | "error" | "urgent";

export type NotifyBridgeSource =
  | "task"
  | "anniversary"
  | "diary"
  | "ai"
  | "mcp"
  | "manual"
  | "system"
  | string;

export interface NotifyBridgeEvent {
  id?: string;
  title: string;
  content: string;
  level?: NotifyBridgeLevel;
  source?: NotifyBridgeSource;
  sourceId?: string;
  url?: string;
  createdAt?: string;
  scheduledAt?: string;
  dedupeKey?: string;
  tags?: string[];
  extra?: Record<string, unknown>;
}

export type NotifyBridgeChannelType = "webhook" | "feishu";

export interface NotifyBridgeBaseChannel {
  id: string;
  title: string;
  type: NotifyBridgeChannelType;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  timeoutMs?: number;
}

export interface NotifyBridgeWebhookChannel extends NotifyBridgeBaseChannel {
  type: "webhook";
  method: "POST";
  url: string;
  headers?: Record<string, string>;
  bodyTemplateMode?: "default" | "customJson";
  customJsonTemplate?: string;
}

export interface NotifyBridgeFeishuChannel extends NotifyBridgeBaseChannel {
  type: "feishu";
  webhookUrl: string;
  secret?: string;
  messageFormat?: "text" | "post";
}

export type NotifyBridgeChannel =
  | NotifyBridgeWebhookChannel
  | NotifyBridgeFeishuChannel;

export interface NotifyBridgeSettings {
  version: 1;
  enabled: boolean;
  defaultChannelIds: string[];
  channels: NotifyBridgeChannel[];
  rateLimit?: {
    enabled: boolean;
    minIntervalMs: number;
  };
  dedupe?: {
    enabled: boolean;
    windowMs: number;
  };
}

export type NotifyBridgeErrorCode =
  | "notify_bridge_premium_required"
  | "notify_bridge_disabled"
  | "no_enabled_channels"
  | "channel_not_found"
  | "channel_disabled"
  | "secret_decrypt_failed"
  | "invalid_webhook_url"
  | "invalid_template_json"
  | "request_timeout"
  | "http_error"
  | "feishu_error"
  | "network_error"
  | "deduped"
  | "rate_limited"
  | "unknown_error";

export interface NotifyBridgeSendOptions {
  channelIds?: string[];
  force?: boolean;
  reason?: string;
}

export interface NotifyBridgeDeliveryResult {
  channelId: string;
  channelTitle: string;
  channelType: NotifyBridgeChannelType;
  ok: boolean;
  status?: number;
  durationMs?: number;
  message?: string;
}

export interface NotifyBridgeSendError {
  channelId: string;
  channelTitle: string;
  channelType: NotifyBridgeChannelType;
  code: NotifyBridgeErrorCode;
  message: string;
}

export interface NotifyBridgeSendResult {
  ok: boolean;
  eventId: string;
  skipped?: boolean;
  message?: string;
  delivered: NotifyBridgeDeliveryResult[];
  errors: NotifyBridgeSendError[];
}

export interface NotifyBridgeChannelSendResult {
  ok: boolean;
  status?: number;
  durationMs: number;
  message?: string;
  code?: NotifyBridgeErrorCode;
}
