import type { NotificationEvent, NotificationFeishuChannel } from "../types";
import { postExternalJson } from "./external-http";
import { redactMessage } from "../notification-center-redact";
import type { ExternalChannelSendResult } from "./webhook-channel";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function generateFeishuSign(timestamp: string, secret: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("当前环境不支持 Web Crypto，无法生成飞书签名。");
  const encoder = new TextEncoder();
  const keyData = encoder.encode(`${timestamp}\n${secret}`);
  const keyBuffer = keyData.buffer.slice(keyData.byteOffset, keyData.byteOffset + keyData.byteLength) as ArrayBuffer;
  const key = await globalThis.crypto.subtle.importKey("raw", keyBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64(new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, new Uint8Array())));
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

