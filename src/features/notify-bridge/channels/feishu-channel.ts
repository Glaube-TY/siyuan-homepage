import type { NotifyBridgeChannelSendResult, NotifyBridgeEvent, NotifyBridgeFeishuChannel } from "../types";
import { postNotifyBridgeJson } from "../notify-bridge-http";
import { redactMessage } from "../notify-bridge-redact";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function generateFeishuSign(timestamp: string, secret: string): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error("当前环境不支持 Web Crypto，无法生成飞书签名。");
  }
  const encoder = new TextEncoder();
  const key = await cryptoApi.subtle.importKey(
    "raw",
    bytesToArrayBuffer(encoder.encode(`${timestamp}\n${secret}`)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await cryptoApi.subtle.sign("HMAC", key, new Uint8Array());
  return bytesToBase64(new Uint8Array(signature));
}

export function buildFeishuTextPayload(event: NotifyBridgeEvent): Record<string, unknown> {
  const text = [
    `【${event.title}】`,
    event.content,
    event.url ? `\n链接：${event.url}` : "",
  ].filter(Boolean).join("\n");

  return {
    msg_type: "text",
    content: { text },
  };
}

export function buildFeishuPostPayload(event: NotifyBridgeEvent): Record<string, unknown> {
  const lines = [
    event.content,
    event.url ? `链接：${event.url}` : "",
  ].filter(Boolean);

  return {
    msg_type: "post",
    content: {
      post: {
        zh_cn: {
          title: event.title,
          content: lines.map((line) => [
            { tag: "text", text: line },
          ]),
        },
      },
    },
  };
}

export async function sendFeishuChannel(
  channel: NotifyBridgeFeishuChannel,
  event: NotifyBridgeEvent,
): Promise<NotifyBridgeChannelSendResult> {
  const startedAt = Date.now();
  try {
    const payload = channel.messageFormat === "post"
      ? buildFeishuPostPayload(event)
      : buildFeishuTextPayload(event);

    if (channel.secret) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      payload.timestamp = timestamp;
      payload.sign = await generateFeishuSign(timestamp, channel.secret);
    }

    const response = await postNotifyBridgeJson(
      channel.webhookUrl,
      payload,
      {},
      channel.timeoutMs ?? 10000,
    );
    const body = response.bodyJson;
    if (body && "code" in body && Number(body.code) !== 0) {
      const msg = body.msg || body.message || body.error || "未知错误";
      return {
        ok: false,
        status: response.status,
        durationMs: response.durationMs,
        code: "feishu_error",
        message: `飞书返回 code=${String(body.code)}，原因：${redactMessage(msg)}`,
      };
    }
    return {
      ok: true,
      status: response.status,
      durationMs: response.durationMs,
      message: `测试成功，用时 ${response.durationMs}ms`,
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
