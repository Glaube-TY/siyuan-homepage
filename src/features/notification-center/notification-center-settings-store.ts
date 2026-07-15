import { z } from "zod";
import {
  decryptSecretCipherText,
  encryptSecretPlainText,
  isEncryptedSecret,
} from "@/features/kb/services/settings/kb-sensitive-secret-crypto";
import {
  DEFAULT_NOTIFICATION_CENTER_SETTINGS,
  NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT,
  NOTIFICATION_CENTER_SETTINGS_KEY,
} from "./constants";
import {
  assertNotificationCenterFeatureAvailable,
  getNotificationCenterPlugin,
  isNotificationCenterFeatureAvailable,
  setNotificationCenterPlugin,
} from "./notification-center-plugin";
import { notificationLockName, withNotificationLock } from "./notification-center-locks";
import { readJSON, writeJSON } from "./notification-center-storage";
import type {
  NotificationCenterSettings,
  NotificationExternalChannel,
  NotificationFeishuChannel,
  NotificationWebhookChannel,
} from "./types";
import { broadcastNotificationCenterEvent } from "./notification-center-events";

export { setNotificationCenterPlugin, getNotificationCenterPlugin, isNotificationCenterFeatureAvailable };

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function normalizeId(value: unknown, fallback: string): string {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
    : "";
  return normalized || fallback;
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

export function normalizeNotificationExternalChannel(raw: unknown, index = 0): NotificationExternalChannel | null {
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
    } satisfies NotificationWebhookChannel;
  }
  return {
    ...base,
    type: "feishu",
    webhookUrl: typeof value.webhookUrl === "string" ? value.webhookUrl.trim() : "",
    secret: typeof value.secret === "string" ? value.secret.trim() : undefined,
    messageFormat: value.messageFormat === "post" ? "post" : "text",
  } satisfies NotificationFeishuChannel;
}

export function normalizeNotificationCenterSettings(raw: unknown): NotificationCenterSettings {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const desktop = value.desktop && typeof value.desktop === "object" ? value.desktop as Record<string, unknown> : {};
  const mobile = value.mobile && typeof value.mobile === "object" ? value.mobile as Record<string, unknown> : {};
  const external = value.external && typeof value.external === "object" ? value.external as Record<string, unknown> : {};
  const rateLimit = external.rateLimit && typeof external.rateLimit === "object" ? external.rateLimit as Record<string, unknown> : {};
  const dedupe = external.dedupe && typeof external.dedupe === "object" ? external.dedupe as Record<string, unknown> : {};
  const channels = Array.isArray(external.channels)
    ? external.channels.map(normalizeNotificationExternalChannel).filter((item): item is NotificationExternalChannel => item !== null)
    : [];
  const defaultChannelIds = Array.isArray(external.defaultChannelIds)
    ? [...new Set(external.defaultChannelIds.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    : [];
  const migration = value.migration && typeof value.migration === "object"
    ? value.migration as NotificationCenterSettings["migration"]
    : undefined;
  return {
    version: 1,
    desktop: {
      enabled: typeof desktop.enabled === "boolean" ? desktop.enabled : false,
      timeoutMs: clamp(desktop.timeoutMs, 7000, 1000, 60000),
      maxContentChars: clamp(desktop.maxContentChars, 500, 50, 5000),
      errorStyleForErrorLevel: typeof desktop.errorStyleForErrorLevel === "boolean" ? desktop.errorStyleForErrorLevel : true,
    },
    mobile: {
      enabled: typeof mobile.enabled === "boolean" ? mobile.enabled : false,
      timeoutType: mobile.timeoutType === "never" ? "never" : "default",
      planningHorizonDays: clamp(mobile.planningHorizonDays, 30, 1, 90),
    },
    external: {
      enabled: typeof external.enabled === "boolean" ? external.enabled : false,
      defaultChannelIds,
      channels,
      rateLimit: {
        enabled: typeof rateLimit.enabled === "boolean" ? rateLimit.enabled : true,
        minIntervalMs: clamp(rateLimit.minIntervalMs, 1000, 0, 60000),
      },
      dedupe: {
        enabled: typeof dedupe.enabled === "boolean" ? dedupe.enabled : true,
        windowMs: clamp(dedupe.windowMs, 60000, 1000, 3600000),
      },
    },
    migration,
  };
}

const externalWebhookChannelSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.literal("webhook"),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  timeoutMs: z.number().optional(),
  method: z.literal("POST"),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  bodyTemplateMode: z.enum(["default", "customJson"]).optional(),
  customJsonTemplate: z.string().optional(),
});

const externalFeishuChannelSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.literal("feishu"),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  timeoutMs: z.number().optional(),
  webhookUrl: z.string(),
  secret: z.string().optional(),
  messageFormat: z.enum(["text", "post"]).optional(),
});

const notificationCenterSettingsSchema: z.ZodSchema<NotificationCenterSettings> = z.object({
  version: z.literal(1),
  desktop: z.object({
    enabled: z.boolean(),
    timeoutMs: z.number(),
    maxContentChars: z.number(),
    errorStyleForErrorLevel: z.boolean(),
  }),
  mobile: z.object({
    enabled: z.boolean(),
    timeoutType: z.enum(["default", "never"]),
    planningHorizonDays: z.number(),
  }),
  external: z.object({
    enabled: z.boolean(),
    defaultChannelIds: z.array(z.string()),
    channels: z.array(z.union([externalWebhookChannelSchema, externalFeishuChannelSchema])),
    rateLimit: z.object({ enabled: z.boolean(), minIntervalMs: z.number() }),
    dedupe: z.object({ enabled: z.boolean(), windowMs: z.number() }),
  }),
  migration: z.object({
    version: z.literal(1),
    migratedAt: z.string(),
    notifyBridgeSettingsMigrated: z.boolean(),
    oldHistoryMigrated: z.boolean(),
    error: z.string().optional(),
  }).optional(),
});

async function encryptChannel(channel: NotificationExternalChannel): Promise<NotificationExternalChannel> {
  const copy = structuredClone(channel);
  if (copy.type === "webhook") {
    copy.url = copy.url ? await encryptSecretPlainText(copy.url) : "";
    if (copy.headers) {
      for (const [key, value] of Object.entries(copy.headers)) {
        copy.headers[key] = value ? await encryptSecretPlainText(value) : "";
      }
    }
  } else {
    copy.webhookUrl = copy.webhookUrl ? await encryptSecretPlainText(copy.webhookUrl) : "";
    copy.secret = copy.secret ? await encryptSecretPlainText(copy.secret) : undefined;
  }
  return copy;
}

async function decryptSecret(value: string, field: string): Promise<string> {
  if (!value || !isEncryptedSecret(value)) return value;
  try {
    return await decryptSecretCipherText(value);
  } catch {
    throw Object.assign(new Error("发送失败：密钥无法解密，请重新填写渠道密钥。"), { code: "secret_decrypt_failed", field });
  }
}

export async function decryptNotificationExternalChannel(channel: NotificationExternalChannel): Promise<NotificationExternalChannel> {
  const copy = structuredClone(channel);
  if (copy.type === "webhook") {
    copy.url = await decryptSecret(copy.url, "webhook.url");
    if (copy.headers) {
      for (const [key, value] of Object.entries(copy.headers)) copy.headers[key] = await decryptSecret(value, `webhook.headers.${key}`);
    }
  } else {
    copy.webhookUrl = await decryptSecret(copy.webhookUrl, "feishu.webhookUrl");
    if (copy.secret) copy.secret = await decryptSecret(copy.secret, "feishu.secret");
  }
  return copy;
}

export async function loadNotificationCenterSettings(): Promise<NotificationCenterSettings> {
  const raw = await readNotificationCenterSettingsFile();
  if (raw === null) return structuredClone(DEFAULT_NOTIFICATION_CENTER_SETTINGS);
  return raw;
}

export async function readNotificationCenterSettingsFile(): Promise<NotificationCenterSettings | null> {
  const raw = await readJSON(NOTIFICATION_CENTER_SETTINGS_KEY, notificationCenterSettingsSchema);
  return raw === null ? null : normalizeNotificationCenterSettings(raw);
}

function validateSavedSettings(settings: NotificationCenterSettings, original: NotificationCenterSettings): void {
  if (settings.version !== 1) throw new Error("通知中心设置保存后版本校验失败。");
  if (typeof settings.desktop.enabled !== "boolean") throw new Error("桌面通知总开关保存后校验失败。");
  if (typeof settings.mobile.enabled !== "boolean") throw new Error("移动通知总开关保存后校验失败。");
  if (typeof settings.external.enabled !== "boolean") throw new Error("外联通知总开关保存后校验失败。");
  if (!Array.isArray(settings.external.channels)) throw new Error("外联渠道列表保存后校验失败。");
  if (settings.external.channels.length !== original.external.channels.length) throw new Error("外联渠道数量保存后校验失败。");
  for (const channel of settings.external.channels) {
    const id = channel.id;
    if (!id || typeof id !== "string") throw new Error("外联渠道 ID 保存后校验失败。");
    if (channel.type !== "webhook" && channel.type !== "feishu") throw new Error(`外联渠道 ${id} 类型保存后校验失败。`);
    if (typeof channel.enabled !== "boolean") throw new Error(`外联渠道 ${id} 状态保存后校验失败。`);
  }
  if (!Array.isArray(settings.external.defaultChannelIds)) throw new Error("默认渠道 ID 保存后校验失败。");
  for (const channel of original.external.channels) {
    const saved = settings.external.channels.find((item) => item.id === channel.id);
    if (!saved) throw new Error(`外联渠道 ${channel.id} 保存后丢失。`);
    if (saved.type === "webhook") {
      const savedWebhook = saved as NotificationWebhookChannel;
      if ((channel as NotificationWebhookChannel).url && !savedWebhook.url) throw new Error(`Webhook 渠道 ${channel.id} 地址保存后校验失败。`);
    } else {
      const savedFeishu = saved as NotificationFeishuChannel;
      if ((channel as NotificationFeishuChannel).webhookUrl && !savedFeishu.webhookUrl) throw new Error(`飞书渠道 ${channel.id} 地址保存后校验失败。`);
      if ((channel as NotificationFeishuChannel).secret && !savedFeishu.secret) throw new Error(`飞书渠道 ${channel.id} 密钥保存后校验失败。`);
    }
  }
}

async function saveNotificationCenterSettingsChecked(settings: NotificationCenterSettings): Promise<NotificationCenterSettings> {
  const normalized = normalizeNotificationCenterSettings(settings);
  const encrypted = { ...normalized, external: { ...normalized.external, channels: await Promise.all(normalized.external.channels.map(encryptChannel)) } };
  const saved = await writeJSON(NOTIFICATION_CENTER_SETTINGS_KEY, encrypted, notificationCenterSettingsSchema);
  const verified = normalizeNotificationCenterSettings(saved);
  validateSavedSettings(verified, normalized);
  window.dispatchEvent(new CustomEvent(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, {
    detail: { version: 1, desktop: verified.desktop.enabled, mobile: verified.mobile.enabled, external: verified.external.enabled },
  }));
  broadcastNotificationCenterEvent(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, { version: 1 });
  return verified;
}

function notificationSettingsLockName(): string {
  return notificationLockName("settings", NOTIFICATION_CENTER_SETTINGS_KEY);
}

export function saveNotificationCenterSettings(settings: NotificationCenterSettings): Promise<NotificationCenterSettings> {
  assertNotificationCenterFeatureAvailable();
  return withNotificationLock(notificationSettingsLockName(), () => saveNotificationCenterSettingsChecked(settings));
}

export function saveNotificationCenterSettingsForMigration(settings: NotificationCenterSettings): Promise<NotificationCenterSettings> {
  return withNotificationLock(notificationSettingsLockName(), () => saveNotificationCenterSettingsChecked(settings));
}

export function updateNotificationCenterMobileSettings(
  mobile: NotificationCenterSettings["mobile"],
): Promise<NotificationCenterSettings["mobile"]> {
  assertNotificationCenterFeatureAvailable();
  return withNotificationLock(notificationSettingsLockName(), async () => {
    const latest = await readNotificationCenterSettingsFile()
      ?? structuredClone(DEFAULT_NOTIFICATION_CENTER_SETTINGS);
    const expected = normalizeNotificationCenterSettings({ ...latest, mobile }).mobile;
    await saveNotificationCenterSettingsChecked({ ...latest, mobile: expected });
    const verified = await readNotificationCenterSettingsFile();
    if (verified === null) throw new Error("移动通知设置保存后读取为空。");
    if (
      verified.mobile.enabled !== expected.enabled
      || verified.mobile.timeoutType !== expected.timeoutType
      || verified.mobile.planningHorizonDays !== expected.planningHorizonDays
    ) {
      throw new Error("移动通知设置保存后校验失败。");
    }
    if (
      JSON.stringify(verified.desktop) !== JSON.stringify(latest.desktop)
      || JSON.stringify(verified.external) !== JSON.stringify(latest.external)
      || JSON.stringify(verified.migration) !== JSON.stringify(latest.migration)
    ) {
      throw new Error("移动通知设置保存影响了其他通知配置，已停止后续操作。");
    }
    return verified.mobile;
  });
}

export function createNotificationExternalChannelId(type: NotificationExternalChannel["type"]): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${type}-${suffix}`;
}
