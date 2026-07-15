import { sendDesktopNotification, sendDesktopTestNotification } from "./channels/desktop-channel";
import { sendFeishuChannel } from "./channels/feishu-channel";
import { sendMobileNotificationNow } from "./channels/mobile-local-channel";
import { sendWebhookChannel } from "./channels/webhook-channel";
import { findNotificationDeliveryHistory, recordNotificationDelivery, recordTransientHistoryFailure, rememberSuccessfulDelivery } from "./notification-center-history-store";
import { notificationLockName, withNotificationLock } from "./notification-center-locks";
import { redactMessage } from "./notification-center-redact";
import { decryptNotificationExternalChannel, isNotificationCenterFeatureAvailable, loadNotificationCenterSettings } from "./notification-center-settings-store";
import { getNotificationDeviceId } from "./notification-center-device";
import { assertNotificationCenterFeatureAvailable } from "./notification-center-plugin";
import { getNotificationTargetOptions, resolveNotificationTargets } from "./notification-center-target-resolver";
import type {
  NotificationDeliveryError,
  NotificationDeliveryResult,
  NotificationEvent,
  NotificationExternalChannel,
  NotificationResolvedTarget,
  NotificationSendOptions,
  NotificationSendResult,
} from "./types";

const lastExternalSendAt = new Map<string, number>();
const externalDedupe = new Map<string, number>();
const inFlightNotifications = new Set<Promise<NotificationSendResult>>();

function createId(prefix = "notification"): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeEvent(event: NotificationEvent): NotificationEvent {
  const occurrenceKey = typeof event.occurrenceKey === "string" ? event.occurrenceKey.trim() : "";
  if (!occurrenceKey) throw new Error("通知事件 occurrenceKey 不能为空。");
  if (!event.type?.trim() || !event.title?.trim()) throw new Error("通知事件 type 和 title 不能为空。");
  return {
    ...event,
    id: event.id || createId(),
    occurrenceKey,
    level: event.level ?? "info",
    createdAt: event.createdAt ?? new Date().toISOString(),
    extra: event.extra ?? {},
  };
}

function safeTarget(target: NotificationResolvedTarget): Omit<NotificationDeliveryResult, "status"> {
  return {
    targetKey: target.targetKey,
    targetKind: target.targetKind,
    targetTitle: target.targetTitle,
    deviceId: target.deviceId,
    channelId: target.channelId,
  };
}

function pruneExternalDedupe(windowMs: number): void {
  const now = Date.now();
  for (const [key, timestamp] of externalDedupe) if (now - timestamp > windowMs) externalDedupe.delete(key);
}

async function sendExternal(
  channel: NotificationExternalChannel,
  event: NotificationEvent,
  force: boolean,
  rateLimit: { enabled: boolean; minIntervalMs: number },
  dedupe: { enabled: boolean; windowMs: number },
): Promise<{ ok: boolean; status?: number; durationMs: number; message?: string; code?: string }> {
  const now = Date.now();
  const key = `${channel.id}:${event.occurrenceKey}`;
  if (!force && rateLimit.enabled && now - (lastExternalSendAt.get(channel.id) ?? 0) < rateLimit.minIntervalMs) {
    return { ok: false, durationMs: 0, code: "rate_limited", message: "该外联渠道发送过于频繁，稍后重试。" };
  }
  if (!force && dedupe.enabled) {
    pruneExternalDedupe(dedupe.windowMs);
    const previous = externalDedupe.get(key);
    if (previous && now - previous <= dedupe.windowMs) return { ok: false, durationMs: 0, code: "deduped", message: "相同通知已在外联去重窗口内发送。" };
  }
  const runtimeChannel = await decryptNotificationExternalChannel(channel);
  const result = runtimeChannel.type === "feishu"
    ? await sendFeishuChannel(runtimeChannel, event)
    : await sendWebhookChannel(runtimeChannel, event);
  if (result.ok) {
    lastExternalSendAt.set(channel.id, now);
    if (dedupe.enabled) externalDedupe.set(key, now);
  }
  return result;
}

async function notifyInternal(eventInput: NotificationEvent, options: NotificationSendOptions): Promise<NotificationSendResult> {
  const event = normalizeEvent(eventInput);
  const eventId = event.id as string;
  const delivered: NotificationDeliveryResult[] = [];
  const skipped: NotificationDeliveryResult[] = [];
  const errors: NotificationDeliveryError[] = [];
  if (!isNotificationCenterFeatureAvailable()) {
    return { ok: false, fullyDelivered: false, eventId, occurrenceKey: event.occurrenceKey, delivered, skipped, errors: [{ targetKey: "notification-center", targetKind: "external", targetTitle: "通知中心", status: "skipped", code: "premium_required", message: "通知中心为高级会员功能。" }] };
  }
  const settings = await loadNotificationCenterSettings();
  const { resolved, unresolved } = resolveNotificationTargets(options.targets, settings);
  skipped.push(...unresolved);
  errors.push(...unresolved);
  const recordHistory = options.recordHistory !== false;

  if (event.expiresAt) {
    const expiresAt = new Date(event.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      const expired = resolved.map((target) => ({ ...safeTarget(target), status: "skipped" as const, code: "expired", message: "通知已超过补发有效期。" }));
      skipped.push(...expired);
      errors.push(...expired);
      return { ok: false, fullyDelivered: false, eventId, occurrenceKey: event.occurrenceKey, delivered, skipped, errors };
    }
  }

  for (const target of resolved) {
    await withNotificationLock(notificationLockName("deliver", `${event.occurrenceKey}:${target.targetKey}`), async () => {
      if (!options.force) {
        const history = await findNotificationDeliveryHistory(event, target.targetKey);
        if (history?.status === "delivered" || history?.status === "scheduled") {
          skipped.push({ ...safeTarget(target), status: "skipped", message: "该目标已完成投递。" });
          return;
        }
      }

      let result: NotificationDeliveryResult;
      let errorCode: string | undefined;
      try {
        if (target.targetKind === "desktop") {
          const startedAt = Date.now();
          await sendDesktopNotification(event, settings.desktop);
          result = { ...safeTarget(target), status: "delivered", durationMs: Date.now() - startedAt };
        } else if (target.targetKind === "mobile") {
          const startedAt = Date.now();
          const notificationId = await sendMobileNotificationNow(event, settings.mobile.timeoutType);
          result = { ...safeTarget(target), status: "delivered", notificationId, durationMs: Date.now() - startedAt };
        } else {
          const externalResult = await sendExternal(target.channel as NotificationExternalChannel, event, Boolean(options.force), settings.external.rateLimit, settings.external.dedupe);
          if (!externalResult.ok) throw Object.assign(new Error(externalResult.message ?? "外联渠道发送失败。"), { code: externalResult.code, status: externalResult.status, durationMs: externalResult.durationMs });
          result = { ...safeTarget(target), status: "delivered", statusCode: externalResult.status, durationMs: externalResult.durationMs, message: externalResult.message };
        }
      } catch (error) {
        errorCode = (error as { code?: string }).code ?? "delivery_failed";
        result = {
          ...safeTarget(target),
          status: "failed",
          statusCode: (error as { status?: number }).status,
          durationMs: (error as { durationMs?: number }).durationMs,
          message: redactMessage(error),
        };
      }

      if (recordHistory) {
        try {
          await recordNotificationDelivery(event, eventId, result, errorCode);
        } catch (historyError) {
          recordTransientHistoryFailure(event, eventId, result, historyError);
          if (result.status === "delivered" || result.status === "scheduled") {
            rememberSuccessfulDelivery(event.occurrenceKey, result.targetKey);
            errors.push({ ...safeTarget(target), status: "failed", code: "history_write_failed", message: "投递成功但历史写入失败；本会话已临时去重。" });
          }
        }
      }
      if (result.status === "delivered" || result.status === "scheduled") delivered.push(result);
      else errors.push({ ...result, status: "failed", code: errorCode ?? "delivery_failed" });
    });
  }

  const requestedCount = resolved.length + unresolved.length;
  return {
    ok: delivered.length > 0,
    fullyDelivered: requestedCount > 0 && delivered.length === requestedCount && errors.length === 0,
    eventId,
    occurrenceKey: event.occurrenceKey,
    delivered,
    skipped,
    errors,
  };
}

export function notify(eventInput: NotificationEvent, options: NotificationSendOptions): Promise<NotificationSendResult> {
  const operation = notifyInternal(eventInput, options);
  inFlightNotifications.add(operation);
  void operation.finally(() => inFlightNotifications.delete(operation)).catch(() => undefined);
  return operation;
}

export async function settleNotificationCenterOperations(): Promise<void> {
  await Promise.allSettled([...inFlightNotifications]);
}

function testEvent(type: string): NotificationEvent {
  return {
    type,
    source: "manual",
    title: "思源通知中心测试",
    content: "如果你看到这条消息，说明该通知目标配置成功。",
    occurrenceKey: `notification-center:test:${type}:${createId("test")}`,
  };
}

export async function testDesktop(): Promise<NotificationSendResult> {
  const event = testEvent("desktop_test");
  const deviceId = getNotificationDeviceId();
  const targetKey = `desktop:${deviceId}`;
  try {
    assertNotificationCenterFeatureAvailable();
    const settings = await loadNotificationCenterSettings();
    if (!settings.desktop.enabled) {
      return {
        ok: false,
        fullyDelivered: false,
        eventId: event.id as string,
        occurrenceKey: event.occurrenceKey,
        delivered: [],
        skipped: [],
        errors: [{ targetKey, targetKind: "desktop", targetTitle: "桌面系统通知", status: "skipped", code: "desktop_disabled", message: "通知中心的桌面系统通知未开启。" }],
      };
    }
    const startedAt = Date.now();
    await sendDesktopTestNotification(event, settings.desktop);
    return {
      ok: true,
      fullyDelivered: true,
      eventId: event.id as string,
      occurrenceKey: event.occurrenceKey,
      delivered: [{ targetKey, targetKind: "desktop", targetTitle: "桌面系统通知", deviceId, status: "delivered", durationMs: Date.now() - startedAt }],
      skipped: [],
      errors: [],
    };
  } catch (error) {
    return {
      ok: false,
      fullyDelivered: false,
      eventId: event.id as string,
      occurrenceKey: event.occurrenceKey,
      delivered: [],
      skipped: [],
      errors: [{
        targetKey,
        targetKind: "desktop",
        targetTitle: "桌面系统通知",
        deviceId,
        status: "failed",
        code: (error as { code?: string }).code ?? "desktop_test_failed",
        message: redactMessage(error),
      }],
    };
  }
}

export function testMobile(): Promise<NotificationSendResult> {
  return notify(testEvent("mobile_test"), { targets: [{ kind: "mobile" }], force: true, recordHistory: false, reason: "test-mobile" });
}

export function testExternalChannel(channelId: string): Promise<NotificationSendResult> {
  return notify(testEvent("external_test"), { targets: [{ kind: "external", channelId }], force: true, recordHistory: false, reason: "test-external" });
}

export const getTargetOptions = getNotificationTargetOptions;

export function clearNotificationCenterMemoryCaches(): void {
  lastExternalSendAt.clear();
  externalDedupe.clear();
}
