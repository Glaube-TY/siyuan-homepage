import type { NotifyBridgeChannelSendResult, NotifyBridgeEvent, NotifyBridgeWebhookChannel } from "../types";
import { postNotifyBridgeJson } from "../notify-bridge-http";
import { redactMessage } from "../notify-bridge-redact";
import { renderNotifyBridgeJsonTemplate } from "../notify-bridge-template";

export function buildDefaultWebhookPayload(event: NotifyBridgeEvent): Record<string, unknown> {
  return {
    title: event.title,
    content: event.content,
    level: event.level ?? "info",
    source: event.source ?? "manual",
    sourceId: event.sourceId,
    url: event.url,
    time: event.createdAt ?? new Date().toISOString(),
    scheduledAt: event.scheduledAt,
    tags: event.tags ?? [],
    extra: event.extra ?? {},
  };
}

export async function sendWebhookChannel(
  channel: NotifyBridgeWebhookChannel,
  event: NotifyBridgeEvent,
): Promise<NotifyBridgeChannelSendResult> {
  const startedAt = Date.now();
  try {
    const payload = channel.bodyTemplateMode === "customJson" && channel.customJsonTemplate
      ? renderNotifyBridgeJsonTemplate(channel.customJsonTemplate, event)
      : buildDefaultWebhookPayload(event);
    const response = await postNotifyBridgeJson(
      channel.url,
      payload,
      channel.headers ?? {},
      channel.timeoutMs ?? 10000,
    );
    return {
      ok: true,
      status: response.status,
      durationMs: response.durationMs,
      message: `发送成功，用时 ${response.durationMs}ms`,
    };
  } catch (error) {
    const code = (error as { code?: NotifyBridgeChannelSendResult["code"] }).code ?? "unknown_error";
    const status = (error as { status?: number }).status;
    return {
      ok: false,
      status,
      durationMs: Date.now() - startedAt,
      code,
      message: redactMessage(error),
    };
  }
}
