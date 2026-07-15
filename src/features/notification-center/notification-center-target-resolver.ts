import {
  getNotificationDeviceId,
  isDesktopNotificationRuntime,
  isMobileNotificationRuntime,
} from "./notification-center-device";
import { loadNotificationCenterSettings } from "./notification-center-settings-store";
import type {
  NotificationCenterSettings,
  NotificationDeliveryError,
  NotificationDeliveryTarget,
  NotificationResolvedTarget,
  NotificationTargetOption,
} from "./types";

export function normalizeNotificationDeliveryTargets(value: unknown): NotificationDeliveryTarget[] {
  if (!Array.isArray(value)) return [];
  const result: NotificationDeliveryTarget[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    let target: NotificationDeliveryTarget | undefined;
    if (item.kind === "desktop") target = { kind: "desktop" };
    else if (item.kind === "mobile") target = { kind: "mobile" };
    else if (item.kind === "external-default") target = { kind: "external-default" };
    else if (item.kind === "external" && typeof item.channelId === "string" && item.channelId.trim()) {
      target = { kind: "external", channelId: item.channelId.trim() };
    }
    if (!target) continue;
    const key = target.kind === "external" ? `external:${target.channelId}` : target.kind;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(target);
    }
  }
  return result;
}

function unavailable(targetKey: string, targetKind: "desktop" | "mobile" | "external", title: string, code: string, message: string, channelId?: string): NotificationDeliveryError {
  return { targetKey, targetKind, targetTitle: title, channelId, status: "skipped", code, message };
}

export function resolveNotificationTargets(
  requested: NotificationDeliveryTarget[],
  settings: NotificationCenterSettings,
): { resolved: NotificationResolvedTarget[]; unresolved: NotificationDeliveryError[] } {
  const normalized = normalizeNotificationDeliveryTargets(requested);
  const deviceId = getNotificationDeviceId();
  const resolved: NotificationResolvedTarget[] = [];
  const unresolved: NotificationDeliveryError[] = [];
  const addExternal = (channelId: string): void => {
    const channel = settings.external.channels.find((item) => item.id === channelId);
    const key = `external:${channelId}`;
    if (!channel) {
      unresolved.push(unavailable(key, "external", `已失效外联渠道：${channelId}`, "channel_not_found", "通知渠道不存在。", channelId));
    } else if (!settings.external.enabled) {
      unresolved.push(unavailable(key, "external", channel.title, "external_disabled", "通知中心的外联通知未开启。", channelId));
    } else if (!channel.enabled) {
      unresolved.push(unavailable(key, "external", channel.title, "channel_disabled", "通知渠道已禁用。", channelId));
    } else if (!resolved.some((item) => item.targetKey === key)) {
      resolved.push({ targetKey: key, targetKind: "external", targetTitle: channel.title, channelId, channel });
    }
  };

  for (const target of normalized) {
    if (target.kind === "desktop") {
      const key = `desktop:${deviceId}`;
      if (!settings.desktop.enabled) unresolved.push(unavailable(key, "desktop", "桌面系统通知", "desktop_disabled", "通知中心的桌面系统通知未开启。"));
      else if (!isDesktopNotificationRuntime()) unresolved.push(unavailable(key, "desktop", "桌面系统通知", "desktop_unavailable", "当前设备不支持桌面系统通知。"));
      else resolved.push({ targetKey: key, targetKind: "desktop", targetTitle: "桌面系统通知", deviceId });
    } else if (target.kind === "mobile") {
      const key = `mobile:${deviceId}`;
      if (!settings.mobile.enabled) unresolved.push(unavailable(key, "mobile", "移动端系统通知", "mobile_disabled", "通知中心的移动通知未开启。"));
      else if (!isMobileNotificationRuntime()) unresolved.push(unavailable(key, "mobile", "移动端系统通知", "mobile_unavailable", "当前设备不是思源原生移动应用。"));
      else resolved.push({ targetKey: key, targetKind: "mobile", targetTitle: "移动端系统通知", deviceId });
    } else if (target.kind === "external") {
      addExternal(target.channelId);
    } else {
      const ids = settings.external.defaultChannelIds.length > 0
        ? settings.external.defaultChannelIds
        : settings.external.channels.filter((item) => item.enabled).map((item) => item.id);
      if (ids.length === 0) unresolved.push(unavailable("external:default", "external", "默认外联渠道", "no_enabled_channels", "没有可用的默认外联渠道。"));
      else ids.forEach(addExternal);
    }
  }
  return { resolved, unresolved };
}

export async function getNotificationTargetOptions(selected: NotificationDeliveryTarget[] = []): Promise<NotificationTargetOption[]> {
  const settings = await loadNotificationCenterSettings();
  const selectedUnknownIds = normalizeNotificationDeliveryTargets(selected)
    .filter((target): target is { kind: "external"; channelId: string } => target.kind === "external")
    .map((target) => target.channelId)
    .filter((id) => !settings.external.channels.some((channel) => channel.id === id));
  return [
    {
      key: "desktop",
      kind: "desktop",
      title: "桌面系统通知",
      enabled: settings.desktop.enabled,
      availableOnCurrentDevice: isDesktopNotificationRuntime(),
      reason: settings.desktop.enabled ? undefined : "通知中心未开启",
    },
    {
      key: "mobile",
      kind: "mobile",
      title: "移动端系统通知",
      enabled: settings.mobile.enabled,
      availableOnCurrentDevice: isMobileNotificationRuntime(),
      reason: settings.mobile.enabled ? undefined : "通知中心未开启",
    },
    {
      key: "external-default",
      kind: "external-default",
      title: "默认外联渠道",
      enabled: settings.external.enabled,
      availableOnCurrentDevice: true,
      reason: settings.external.enabled ? undefined : "通知中心未开启",
    },
    ...settings.external.channels.map((channel) => ({
      key: `external:${channel.id}`,
      kind: "external" as const,
      channelId: channel.id,
      title: `${channel.type === "feishu" ? "飞书" : "Webhook"}：${channel.title}`,
      enabled: settings.external.enabled && channel.enabled,
      availableOnCurrentDevice: true,
      reason: settings.external.enabled && channel.enabled ? undefined : "通知中心未开启",
    })),
    ...selectedUnknownIds.map((channelId) => ({
      key: `external:${channelId}`,
      kind: "external" as const,
      channelId,
      title: `已失效外联渠道：${channelId}`,
      enabled: false,
      availableOnCurrentDevice: false,
      reason: "渠道不存在",
    })),
  ];
}

export async function hasResolvableTargetsForCurrentRuntime(targets: NotificationDeliveryTarget[]): Promise<boolean> {
  const settings = await loadNotificationCenterSettings();
  return resolveNotificationTargets(targets, settings).resolved.length > 0;
}

