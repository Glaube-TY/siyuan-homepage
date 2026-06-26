import {
  decryptSecretCipherText,
  encryptSecretPlainText,
  isEncryptedSecret,
  setKbSensitiveSecretCryptoPlugin,
} from "@/features/kb/services/settings/kb-sensitive-secret-crypto";
import {
  DEFAULT_NOTIFY_BRIDGE_SETTINGS,
  NOTIFY_BRIDGE_DEFAULT_TIMEOUT_MS,
  NOTIFY_BRIDGE_MAX_TIMEOUT_MS,
  NOTIFY_BRIDGE_MIN_TIMEOUT_MS,
  NOTIFY_BRIDGE_SETTINGS_KEY,
} from "./constants";
import type {
  NotifyBridgeChannel,
  NotifyBridgeFeishuChannel,
  NotifyBridgeSettings,
  NotifyBridgeWebhookChannel,
} from "./types";

let pluginInstance: any = null;

export function setNotifyBridgePlugin(plugin: any): void {
  pluginInstance = plugin;
  setKbSensitiveSecretCryptoPlugin(plugin);
}

export function isNotifyBridgePremiumAvailable(): boolean {
  return Boolean(pluginInstance?.ADVANCED);
}

function getPlugin(): any {
  if (!pluginInstance) {
    throw new Error("Notify Bridge 尚未初始化。");
  }
  return pluginInstance;
}

function clampTimeout(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NOTIFY_BRIDGE_DEFAULT_TIMEOUT_MS;
  return Math.max(NOTIFY_BRIDGE_MIN_TIMEOUT_MS, Math.min(NOTIFY_BRIDGE_MAX_TIMEOUT_MS, Math.round(parsed)));
}

function normalizeId(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const safe = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe || fallback;
}

function normalizeHeaders(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = key.trim();
    if (!k || k.includes("\r") || k.includes("\n")) continue;
    if (typeof value !== "string" || value.includes("\r") || value.includes("\n")) continue;
    headers[k] = value;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function normalizeNotifyBridgeChannel(raw: unknown, index = 0): NotifyBridgeChannel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const type = value.type === "feishu" ? "feishu" : value.type === "webhook" ? "webhook" : null;
  if (!type) return null;

  const now = new Date().toISOString();
  const base = {
    id: normalizeId(value.id, `notify-channel-${index + 1}`),
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : "未命名渠道",
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
    timeoutMs: clampTimeout(value.timeoutMs),
  };

  if (type === "webhook") {
    return {
      ...base,
      type,
      method: "POST",
      url: typeof value.url === "string" ? value.url.trim() : "",
      headers: normalizeHeaders(value.headers),
      bodyTemplateMode: value.bodyTemplateMode === "customJson" ? "customJson" : "default",
      customJsonTemplate: typeof value.customJsonTemplate === "string" ? value.customJsonTemplate : undefined,
    } satisfies NotifyBridgeWebhookChannel;
  }

  return {
    ...base,
    type,
    webhookUrl: typeof value.webhookUrl === "string" ? value.webhookUrl.trim() : "",
    secret: typeof value.secret === "string" ? value.secret.trim() : undefined,
    messageFormat: value.messageFormat === "post" ? "post" : "text",
  } satisfies NotifyBridgeFeishuChannel;
}

export function normalizeNotifyBridgeSettings(raw: unknown): NotifyBridgeSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_NOTIFY_BRIDGE_SETTINGS, channels: [], defaultChannelIds: [] };
  }
  const value = raw as Record<string, unknown>;
  const channels = Array.isArray(value.channels)
    ? value.channels.map(normalizeNotifyBridgeChannel).filter((item): item is NotifyBridgeChannel => item !== null)
    : [];
  const channelIds = new Set(channels.map((channel) => channel.id));
  const defaultChannelIds = Array.isArray(value.defaultChannelIds)
    ? value.defaultChannelIds.filter((id): id is string => typeof id === "string" && channelIds.has(id))
    : [];
  const rateLimit = value.rateLimit && typeof value.rateLimit === "object"
    ? value.rateLimit as Record<string, unknown>
    : {};
  const dedupe = value.dedupe && typeof value.dedupe === "object"
    ? value.dedupe as Record<string, unknown>
    : {};

  return {
    version: 1,
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    defaultChannelIds,
    channels,
    rateLimit: {
      enabled: typeof rateLimit.enabled === "boolean" ? rateLimit.enabled : true,
      minIntervalMs: Math.max(0, Math.min(60000, Math.round(Number(rateLimit.minIntervalMs) || 1000))),
    },
    dedupe: {
      enabled: typeof dedupe.enabled === "boolean" ? dedupe.enabled : true,
      windowMs: Math.max(1000, Math.min(3600000, Math.round(Number(dedupe.windowMs) || 60000))),
    },
  };
}

async function encryptChannelSecrets(channel: NotifyBridgeChannel): Promise<NotifyBridgeChannel> {
  const copy = JSON.parse(JSON.stringify(channel)) as NotifyBridgeChannel;
  if (copy.type === "webhook") {
    copy.url = copy.url ? await encryptSecretPlainText(copy.url) : "";
    if (copy.headers) {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(copy.headers)) {
        headers[key] = value ? await encryptSecretPlainText(value) : "";
      }
      copy.headers = headers;
    }
  } else {
    copy.webhookUrl = copy.webhookUrl ? await encryptSecretPlainText(copy.webhookUrl) : "";
    copy.secret = copy.secret ? await encryptSecretPlainText(copy.secret) : undefined;
  }
  return copy;
}

async function decryptRequiredSecret(value: string, field: string): Promise<string> {
  if (!value) return "";
  if (!isEncryptedSecret(value)) return value;
  try {
    return await decryptSecretCipherText(value);
  } catch {
    throw Object.assign(new Error("发送失败：密钥无法解密，请重新填写 Webhook 地址或签名密钥。"), {
      code: "secret_decrypt_failed",
      field,
    });
  }
}

export async function decryptNotifyBridgeChannelSecrets(channel: NotifyBridgeChannel): Promise<NotifyBridgeChannel> {
  const copy = JSON.parse(JSON.stringify(channel)) as NotifyBridgeChannel;
  if (copy.type === "webhook") {
    copy.url = await decryptRequiredSecret(copy.url, "webhook.url");
    if (copy.headers) {
      for (const [key, value] of Object.entries(copy.headers)) {
        copy.headers[key] = await decryptRequiredSecret(value, `webhook.headers.${key}`);
      }
    }
  } else {
    copy.webhookUrl = await decryptRequiredSecret(copy.webhookUrl, "feishu.webhookUrl");
    if (copy.secret) {
      copy.secret = await decryptRequiredSecret(copy.secret, "feishu.secret");
    }
  }
  return copy;
}

export async function loadNotifyBridgeSettings(): Promise<NotifyBridgeSettings> {
  try {
    const raw = await getPlugin().loadData(NOTIFY_BRIDGE_SETTINGS_KEY);
    return normalizeNotifyBridgeSettings(raw);
  } catch {
    return { ...DEFAULT_NOTIFY_BRIDGE_SETTINGS, channels: [], defaultChannelIds: [] };
  }
}

export async function loadNotifyBridgeRuntimeSettings(): Promise<NotifyBridgeSettings> {
  const settings = await loadNotifyBridgeSettings();
  const channels = await Promise.all(settings.channels.map(decryptNotifyBridgeChannelSecrets));
  return { ...settings, channels };
}

export async function saveNotifyBridgeSettings(settings: NotifyBridgeSettings): Promise<NotifyBridgeSettings> {
  const normalized = normalizeNotifyBridgeSettings(settings);
  const encryptedChannels = await Promise.all(normalized.channels.map(encryptChannelSecrets));
  const encryptedSettings = { ...normalized, channels: encryptedChannels };
  await getPlugin().saveData(NOTIFY_BRIDGE_SETTINGS_KEY, encryptedSettings);
  const safeSettings = normalizeNotifyBridgeSettings(encryptedSettings);
  window.dispatchEvent(new CustomEvent("notify-bridge-settings-changed", {
    detail: {
      version: safeSettings.version,
      enabled: safeSettings.enabled,
      channelCount: safeSettings.channels.length,
    },
  }));
  return safeSettings;
}

export function createNotifyBridgeChannelId(type: NotifyBridgeChannel["type"]): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${type}-${random}`;
}
