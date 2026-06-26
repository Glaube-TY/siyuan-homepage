import { NOTIFY_BRIDGE_TEST_EVENT } from "./constants";
import { decryptNotifyBridgeChannelSecrets, isNotifyBridgePremiumAvailable, loadNotifyBridgeSettings } from "./notify-bridge-settings-store";
import { sendFeishuChannel } from "./channels/feishu-channel";
import { sendWebhookChannel } from "./channels/webhook-channel";
import type {
  NotifyBridgeChannel,
  NotifyBridgeEvent,
  NotifyBridgeSendError,
  NotifyBridgeSendOptions,
  NotifyBridgeSendResult,
} from "./types";

const dedupeCache = new Map<string, number>();
let lastSendAt = 0;

function createEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `notify-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeEvent(event: NotifyBridgeEvent): NotifyBridgeEvent {
  return {
    ...event,
    id: event.id || createEventId(),
    level: event.level ?? "info",
    source: event.source ?? "manual",
    createdAt: event.createdAt ?? new Date().toISOString(),
    extra: event.extra ?? {},
  };
}

function buildSkippedResult(eventId: string, code: NotifyBridgeSendError["code"], message: string): NotifyBridgeSendResult {
  return {
    ok: false,
    eventId,
    skipped: true,
    message,
    delivered: [],
    errors: [{
      channelId: "",
      channelTitle: "",
      channelType: "webhook",
      code,
      message,
    }],
  };
}

function getDedupeKey(event: NotifyBridgeEvent): string {
  return event.dedupeKey ?? `${event.source ?? "manual"}:${event.sourceId ?? ""}:${event.title}:${event.content}`;
}

function pruneDedupe(now: number, windowMs: number): void {
  for (const [key, time] of dedupeCache.entries()) {
    if (now - time > windowMs) dedupeCache.delete(key);
  }
}

function chooseChannels(
  channels: NotifyBridgeChannel[],
  defaultChannelIds: string[],
  requestedIds?: string[],
): { selected: NotifyBridgeChannel[]; errors: NotifyBridgeSendError[] } {
  const errors: NotifyBridgeSendError[] = [];
  const byId = new Map(channels.map((channel) => [channel.id, channel]));

  if (requestedIds?.length) {
    const selected: NotifyBridgeChannel[] = [];
    for (const id of requestedIds) {
      const channel = byId.get(id);
      if (!channel) {
        errors.push({
          channelId: id,
          channelTitle: id,
          channelType: "webhook",
          code: "channel_not_found",
          message: "发送失败：通知渠道不存在。",
        });
      } else if (!channel.enabled) {
        errors.push({
          channelId: channel.id,
          channelTitle: channel.title,
          channelType: channel.type,
          code: "channel_disabled",
          message: "发送失败：通知渠道已禁用。",
        });
      } else {
        selected.push(channel);
      }
    }
    return { selected, errors };
  }

  if (defaultChannelIds.length > 0) {
    const selected: NotifyBridgeChannel[] = [];
    for (const id of defaultChannelIds) {
      const channel = byId.get(id);
      if (!channel) {
        errors.push({
          channelId: id,
          channelTitle: id,
          channelType: "webhook",
          code: "channel_not_found",
          message: "发送失败：默认通知渠道不存在。",
        });
        continue;
      }
      if (!channel.enabled) {
        errors.push({
          channelId: channel.id,
          channelTitle: channel.title,
          channelType: channel.type,
          code: "channel_disabled",
          message: "发送失败：默认通知渠道已禁用。",
        });
        continue;
      }
      selected.push(channel);
    }
    return { selected, errors };
  }

  return { selected: channels.filter((channel) => channel.enabled), errors };
}

async function sendChannel(channel: NotifyBridgeChannel, event: NotifyBridgeEvent) {
  if (channel.type === "feishu") return sendFeishuChannel(channel, event);
  return sendWebhookChannel(channel, event);
}

export async function sendNotifyBridgeEvent(
  rawEvent: NotifyBridgeEvent,
  options: NotifyBridgeSendOptions = {},
): Promise<NotifyBridgeSendResult> {
  const event = normalizeEvent(rawEvent);
  const eventId = event.id as string;
  if (!isNotifyBridgePremiumAvailable()) {
    return buildSkippedResult(eventId, "notify_bridge_premium_required", "外联通知为高级会员专属功能，请在会员服务中开通后使用。");
  }
  const settings = await loadNotifyBridgeSettings();

  if (!settings.enabled) {
    return buildSkippedResult(eventId, "notify_bridge_disabled", "外联通知桥已关闭。");
  }

  const now = Date.now();
  if (!options.force && settings.rateLimit?.enabled) {
    const minIntervalMs = settings.rateLimit.minIntervalMs;
    if (minIntervalMs > 0 && now - lastSendAt < minIntervalMs) {
      return buildSkippedResult(eventId, "rate_limited", "发送过于频繁，已跳过本次通知。");
    }
  }

  if (!options.force && settings.dedupe?.enabled) {
    const windowMs = settings.dedupe.windowMs;
    pruneDedupe(now, windowMs);
    const dedupeKey = getDedupeKey(event);
    const last = dedupeCache.get(dedupeKey);
    if (last && now - last <= windowMs) {
      return buildSkippedResult(eventId, "deduped", "相同通知已在去重窗口内发送过，已跳过。");
    }
  }

  const { selected, errors } = chooseChannels(settings.channels, settings.defaultChannelIds, options.channelIds);
  if (selected.length === 0) {
    if (settings.defaultChannelIds.length > 0) {
      return {
        ok: false,
        eventId,
        skipped: true,
        message: "没有可用的默认通知渠道，请启用默认渠道或取消默认渠道设置。",
        delivered: [],
        errors,
      };
    }
    if (errors.length > 0) {
      return { ok: false, eventId, delivered: [], errors };
    }
    return buildSkippedResult(eventId, "no_enabled_channels", "没有可用的通知渠道。");
  }

  const delivered = [];
  const sendErrors = [...errors];
  for (const channel of selected) {
    let runtimeChannel: NotifyBridgeChannel;
    try {
      runtimeChannel = await decryptNotifyBridgeChannelSecrets(channel);
    } catch (error) {
      const message = error instanceof Error ? error.message : "发送失败：密钥无法解密，请重新填写渠道密钥。";
      delivered.push({
        channelId: channel.id,
        channelTitle: channel.title,
        channelType: channel.type,
        ok: false,
        durationMs: 0,
        message,
      });
      sendErrors.push({
        channelId: channel.id,
        channelTitle: channel.title,
        channelType: channel.type,
        code: "secret_decrypt_failed",
        message,
      });
      continue;
    }

    const result = await sendChannel(runtimeChannel, event);
    delivered.push({
      channelId: channel.id,
      channelTitle: channel.title,
      channelType: channel.type,
      ok: result.ok,
      status: result.status,
      durationMs: result.durationMs,
      message: result.message,
    });
    if (!result.ok) {
      sendErrors.push({
        channelId: channel.id,
        channelTitle: channel.title,
        channelType: channel.type,
        code: result.code ?? "unknown_error",
        message: result.message ?? "发送失败。",
      });
    }
  }

  const ok = delivered.some((item) => item.ok);
  if (ok) {
    lastSendAt = now;
    if (!options.force && settings.dedupe?.enabled) {
      dedupeCache.set(getDedupeKey(event), now);
    }
  }

  return {
    ok,
    eventId,
    delivered,
    errors: sendErrors,
  };
}

export const notifyBridge = {
  send: sendNotifyBridgeEvent,
  test: (channelId: string) => sendNotifyBridgeEvent(NOTIFY_BRIDGE_TEST_EVENT, {
    channelIds: [channelId],
    force: true,
    reason: "test-send",
  }),
};

export function clearNotifyBridgeDedupeCache(): void {
  dedupeCache.clear();
}
