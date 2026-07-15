import type { NotificationEvent, NotificationWebhookChannel } from "../types";
import { postExternalJson } from "./external-http";
import { renderExternalJsonTemplate } from "./external-template";
import { redactMessage } from "../notification-center-redact";

export interface ExternalChannelSendResult {
  ok: boolean;
  status?: number;
  durationMs: number;
  message?: string;
  code?: string;
}

export function buildDefaultWebhookPayload(event: NotificationEvent): Record<string, unknown> {
  return {
    title: event.title,
    content: event.content,
    level: event.level ?? "info",
    source: event.source,
    sourceId: event.sourceId,
    url: event.url,
    time: event.createdAt ?? new Date().toISOString(),
    scheduledAt: event.scheduledAt,
    expiresAt: event.expiresAt,
    occurrenceKey: event.occurrenceKey,
    tags: event.tags ?? [],
    extra: event.extra ?? {},
  };
}

export async function sendWebhookChannel(channel: NotificationWebhookChannel, event: NotificationEvent): Promise<ExternalChannelSendResult> {
  const startedAt = Date.now();
  try {
    const payload = channel.bodyTemplateMode === "customJson" && channel.customJsonTemplate
      ? renderExternalJsonTemplate(channel.customJsonTemplate, event)
      : buildDefaultWebhookPayload(event);
    const response = await postExternalJson(channel.url, payload, channel.headers ?? {}, channel.timeoutMs ?? 10000);
    return { ok: true, status: response.status, durationMs: response.durationMs, message: `发送成功，用时 ${response.durationMs}ms` };
  } catch (error) {
    return {
      ok: false,
      status: (error as { status?: number }).status,
      durationMs: Date.now() - startedAt,
      code: (error as { code?: string }).code ?? "unknown_error",
      message: redactMessage(error),
    };
  }
}

