/** @deprecated 仅供 notification-center 读取旧设置并执行一次性迁移。 */
import { DEFAULT_NOTIFY_BRIDGE_SETTINGS } from "./constants";
import type {
  NotifyBridgeChannel,
  NotifyBridgeFeishuChannel,
  NotifyBridgeSettings,
  NotifyBridgeWebhookChannel,
} from "./types";

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function normalizeId(value: unknown, fallback: string): string {
  const safe = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
    : "";
  return safe || fallback;
}

function normalizeHeaders(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const safeKey = key.trim();
    if (!safeKey || /[\r\n]/.test(safeKey) || typeof value !== "string" || /[\r\n]/.test(value)) continue;
    headers[safeKey] = value;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function normalizeLegacyChannel(raw: unknown, index = 0): NotifyBridgeChannel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.type !== "webhook" && value.type !== "feishu") return null;
  const now = new Date().toISOString();
  const base = {
    id: normalizeId(value.id, `notify-channel-${index + 1}`),
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : "未命名渠道",
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
    timeoutMs: clamp(value.timeoutMs, 10000, 1000, 60000),
  };
  if (value.type === "webhook") {
    return {
      ...base,
      type: "webhook",
      method: "POST",
      url: typeof value.url === "string" ? value.url.trim() : "",
      headers: normalizeHeaders(value.headers),
      bodyTemplateMode: value.bodyTemplateMode === "customJson" ? "customJson" : "default",
      customJsonTemplate: typeof value.customJsonTemplate === "string" ? value.customJsonTemplate : undefined,
    } satisfies NotifyBridgeWebhookChannel;
  }
  return {
    ...base,
    type: "feishu",
    webhookUrl: typeof value.webhookUrl === "string" ? value.webhookUrl.trim() : "",
    secret: typeof value.secret === "string" ? value.secret.trim() : undefined,
    messageFormat: value.messageFormat === "post" ? "post" : "text",
  } satisfies NotifyBridgeFeishuChannel;
}

export function normalizeNotifyBridgeSettings(raw: unknown): NotifyBridgeSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return structuredClone(DEFAULT_NOTIFY_BRIDGE_SETTINGS);
  const value = raw as Record<string, unknown>;
  const channels = Array.isArray(value.channels)
    ? value.channels.map(normalizeLegacyChannel).filter((item): item is NotifyBridgeChannel => item !== null)
    : [];
  const knownIds = new Set(channels.map((channel) => channel.id));
  const rateLimit = value.rateLimit && typeof value.rateLimit === "object" ? value.rateLimit as Record<string, unknown> : {};
  const dedupe = value.dedupe && typeof value.dedupe === "object" ? value.dedupe as Record<string, unknown> : {};
  return {
    version: 1,
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    defaultChannelIds: Array.isArray(value.defaultChannelIds)
      ? value.defaultChannelIds.filter((id): id is string => typeof id === "string" && knownIds.has(id))
      : [],
    channels,
    rateLimit: { enabled: typeof rateLimit.enabled === "boolean" ? rateLimit.enabled : true, minIntervalMs: clamp(rateLimit.minIntervalMs, 1000, 0, 60000) },
    dedupe: { enabled: typeof dedupe.enabled === "boolean" ? dedupe.enabled : true, windowMs: clamp(dedupe.windowMs, 60000, 1000, 3600000) },
  };
}
