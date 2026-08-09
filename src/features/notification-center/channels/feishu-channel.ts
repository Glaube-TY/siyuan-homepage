import type { NotificationEvent, NotificationFeishuChannel } from "../types";
import { postExternalJson } from "./external-http";
import { redactMessage } from "../notification-center-redact";
import type { ExternalChannelSendResult } from "./webhook-channel";
import CryptoJS from "crypto-js";

export async function generateFeishuSign(timestamp: string, secret: string): Promise<string> {
  const signature = CryptoJS.HmacSHA256("", `${timestamp}\n${secret}`);
  return CryptoJS.enc.Base64.stringify(signature);
}

function buildPayload(event: NotificationEvent, format: "text" | "post"): Record<string, unknown> {
  if (format === "post") {
    const lines = [event.content, event.url ? `链接：${event.url}` : ""].filter(Boolean);
    return { msg_type: "post", content: { post: { zh_cn: { title: event.title, content: lines.map((line) => [{ tag: "text", text: line }]) } } } };
  }
  return { msg_type: "text", content: { text: [`【${event.title}】`, event.content, event.url ? `\n链接：${event.url}` : ""].filter(Boolean).join("\n") } };
}

export async function sendFeishuChannel(channel: NotificationFeishuChannel, event: NotificationEvent): Promise<ExternalChannelSendResult> {
  const startedAt = Date.now();
  try {
    const payload = buildPayload(event, channel.messageFormat === "post" ? "post" : "text");
    if (channel.secret) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      payload.timestamp = timestamp;
      payload.sign = await generateFeishuSign(timestamp, channel.secret);
    }
    const response = await postExternalJson(channel.webhookUrl, payload, {}, channel.timeoutMs ?? 10000);
    if (response.bodyJson && "code" in response.bodyJson && Number(response.bodyJson.code) !== 0) {
      const detail = response.bodyJson.msg || response.bodyJson.message || response.bodyJson.error || "未知错误";
      return { ok: false, status: response.status, durationMs: response.durationMs, code: "feishu_error", message: `飞书返回 code=${String(response.bodyJson.code)}，原因：${redactMessage(detail)}` };
    }
    return { ok: true, status: response.status, durationMs: response.durationMs, message: `发送成功，用时 ${response.durationMs}ms` };
  } catch (error) {
    return { ok: false, status: (error as { status?: number }).status, durationMs: Date.now() - startedAt, code: (error as { code?: string }).code ?? "unknown_error", message: redactMessage(error) };
  }
}

