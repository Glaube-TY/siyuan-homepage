import { forwardProxy } from "@/api";
import type { NotifyBridgeErrorCode } from "./types";
import { redactMessage } from "./notify-bridge-redact";

export interface NotifyBridgeHttpResponse {
  status: number;
  contentType?: string;
  bodyText: string;
  bodyJson?: Record<string, unknown>;
  durationMs: number;
}

export async function postNotifyBridgeJson(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<NotifyBridgeHttpResponse> {
  const startedAt = Date.now();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error("发送失败：Webhook 地址无效。"), {
      code: "invalid_webhook_url" satisfies NotifyBridgeErrorCode,
    });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw Object.assign(new Error("发送失败：Webhook 地址必须是 HTTP 或 HTTPS。"), {
      code: "invalid_webhook_url" satisfies NotifyBridgeErrorCode,
    });
  }

  const headerArray = Object.entries({
    "Content-Type": "application/json",
    ...headers,
  }).map(([key, value]) => ({ [key]: value }));

  try {
    const response = await forwardProxy(
      url,
      "POST",
      payload,
      headerArray,
      timeoutMs,
      "application/json",
      undefined,
      "text",
    );
    const durationMs = response?.elapsed ?? (Date.now() - startedAt);
    const status = response?.status ?? 0;
    const bodyText = typeof response?.body === "string" ? response.body : "";
    let bodyJson: Record<string, unknown> | undefined;
    try {
      const parsedBody = bodyText ? JSON.parse(bodyText) : undefined;
      if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
        bodyJson = parsedBody as Record<string, unknown>;
      }
    } catch {
      // Non-JSON responses are valid for generic webhooks.
    }

    if (!response || !status) {
      throw Object.assign(new Error("发送失败：网络请求未返回有效响应。"), {
        code: "network_error" satisfies NotifyBridgeErrorCode,
      });
    }

    if (status >= 400) {
      const detail = bodyJson?.msg || bodyJson?.message || bodyJson?.error || bodyText;
      throw Object.assign(
        new Error(`发送失败：HTTP ${status}${detail ? `，${redactMessage(detail)}` : ""}`),
        {
          code: "http_error" satisfies NotifyBridgeErrorCode,
          status,
        },
      );
    }

    return {
      status,
      contentType: response.contentType,
      bodyText,
      bodyJson,
      durationMs,
    };
  } catch (error) {
    const code = (error as { code?: NotifyBridgeErrorCode }).code;
    if (code) throw error;
    const raw = error instanceof Error ? error.message : String(error);
    const isTimeout = /timeout|timed out|abort/i.test(raw);
    throw Object.assign(
      new Error(isTimeout ? "发送失败：请求超时。" : `发送失败：${redactMessage(raw)}`),
      {
        code: (isTimeout ? "request_timeout" : "network_error") satisfies NotifyBridgeErrorCode,
      },
    );
  }
}
