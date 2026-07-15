/** @deprecated 请使用 notification-center。此文件只保留旧调用兼容映射。 */
import {
  createNotificationExternalChannelId,
  isNotificationCenterFeatureAvailable,
  loadNotificationCenterSettings,
  notificationCenter,
  redactHeaders,
  redactMessage,
  redactSecret,
  redactUrl,
  saveNotificationCenterSettings,
  setNotificationCenterPlugin,
} from "@/features/notification-center";
import type { NotifyBridgeEvent, NotifyBridgeSendOptions, NotifyBridgeSendResult, NotifyBridgeSettings } from "./types";

export * from "./types";
export { redactHeaders, redactMessage, redactSecret, redactUrl };

/** @deprecated 通知中心会在插件初始化时设置实例。 */
export function setNotifyBridgePlugin(plugin: any): void {
  setNotificationCenterPlugin(plugin);
}

/** @deprecated 使用 isNotificationCenterFeatureAvailable。 */
export const isNotifyBridgePremiumAvailable = isNotificationCenterFeatureAvailable;

/** @deprecated 读取通知中心的 external 设置。 */
export async function loadNotifyBridgeSettings(): Promise<NotifyBridgeSettings> {
  const settings = await loadNotificationCenterSettings();
  return { version: 1, ...settings.external };
}

/** @deprecated 保存到通知中心的 external 设置。 */
export async function saveNotifyBridgeSettings(settings: NotifyBridgeSettings): Promise<NotifyBridgeSettings> {
  const center = await loadNotificationCenterSettings();
  const saved = await saveNotificationCenterSettings({
    ...center,
    external: {
      enabled: settings.enabled,
      defaultChannelIds: settings.defaultChannelIds,
      channels: settings.channels,
      rateLimit: settings.rateLimit ?? center.external.rateLimit,
      dedupe: settings.dedupe ?? center.external.dedupe,
    },
  });
  return { version: 1, ...saved.external };
}

export const createNotifyBridgeChannelId = createNotificationExternalChannelId;

function toOccurrenceKey(event: NotifyBridgeEvent): string {
  return event.dedupeKey || event.id || `legacy:${event.source ?? "manual"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

/** @deprecated 使用 notificationCenter.notify。 */
export async function sendNotifyBridgeEvent(event: NotifyBridgeEvent, options: NotifyBridgeSendOptions = {}): Promise<NotifyBridgeSendResult> {
  const result = await notificationCenter.notify({
    id: event.id,
    type: typeof event.extra?.type === "string" ? event.extra.type : "legacy_notify_bridge",
    source: event.source ?? "manual",
    sourceId: event.sourceId,
    title: event.title,
    content: event.content,
    level: event.level,
    createdAt: event.createdAt,
    scheduledAt: event.scheduledAt,
    occurrenceKey: toOccurrenceKey(event),
    url: event.url,
    tags: event.tags,
    extra: event.extra,
  }, {
    targets: options.channelIds?.length
      ? options.channelIds.map((channelId) => ({ kind: "external" as const, channelId }))
      : [{ kind: "external-default" }],
    force: options.force,
    reason: options.reason,
  });
  return {
    ok: result.ok,
    eventId: result.eventId,
    skipped: !result.ok && result.skipped.length > 0,
    message: result.errors[0]?.message,
    delivered: result.delivered.filter((item) => item.targetKind === "external").map((item) => ({ channelId: item.channelId ?? "", channelTitle: item.targetTitle, channelType: "webhook", ok: true, status: item.statusCode, durationMs: item.durationMs, message: item.message })),
    errors: result.errors.filter((item) => item.targetKind === "external").map((item) => ({ channelId: item.channelId ?? "", channelTitle: item.targetTitle, channelType: "webhook", code: "unknown_error", message: item.message ?? "发送失败。" })),
  };
}

export const notifyBridge = {
  send: sendNotifyBridgeEvent,
  test: (channelId: string) => notificationCenter.testExternalChannel(channelId),
};

export function clearNotifyBridgeDedupeCache(): void {
  // 兼容空操作：缓存由通知中心统一维护并在 runtime 销毁时清理。
}
