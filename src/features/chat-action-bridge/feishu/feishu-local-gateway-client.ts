import type { ChatActionRuntimeSettings, FeishuNormalizedMessage } from "../types";

type GatewayStatus = "connecting" | "connected" | "gateway_unavailable" | "connection_failed" | "stopped";

export interface FeishuLocalGatewayClientOptions {
  settings: ChatActionRuntimeSettings;
  onMessage: (message: FeishuNormalizedMessage) => Promise<void>;
  onStatusChange?: (status: GatewayStatus, detail?: string) => void;
}

interface GatewayEventsResponse {
  ok?: boolean;
  messages?: FeishuNormalizedMessage[];
}

const GATEWAY_UNAVAILABLE_MESSAGE = "飞书 Node SDK 不能在思源前端环境中直接运行，请启动本地飞书网关。";

function buildGatewayUrl(settings: ChatActionRuntimeSettings, path: string): string {
  const port = settings.localGateway.port;
  return `http://127.0.0.1:${port}${path}`;
}

function buildGatewayHeaders(settings: ChatActionRuntimeSettings): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-local-auth-token": settings.localGateway.localAuthToken,
  };
}

async function fetchGatewayJson<T>(
  settings: ChatActionRuntimeSettings,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(buildGatewayUrl(settings, path), {
      ...init,
      headers: {
        ...buildGatewayHeaders(settings),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(response.status === 401 ? "本地飞书网关认证失败。" : "本地飞书网关请求失败。");
    }
    return await response.json() as T;
  } finally {
    window.clearTimeout(timer);
  }
}

function toGatewayUnavailableError(): Error {
  return Object.assign(new Error(GATEWAY_UNAVAILABLE_MESSAGE), {
    code: "gateway_unavailable",
  });
}

export async function checkFeishuLocalGatewayHealth(settings: ChatActionRuntimeSettings): Promise<boolean> {
  try {
    const result = await fetchGatewayJson<{ ok?: boolean }>(settings, "/health");
    return result.ok === true;
  } catch {
    return false;
  }
}

export async function sendFeishuLocalGatewayReply(
  settings: ChatActionRuntimeSettings,
  chatId: string,
  text: string,
): Promise<void> {
  await fetchGatewayJson(settings, "/reply", {
    method: "POST",
    body: JSON.stringify({ chatId, text }),
  });
}

export class FeishuLocalGatewayClient {
  private options: FeishuLocalGatewayClientOptions;
  private pollTimer: number | null = null;
  private started = false;
  private polling = false;

  constructor(options: FeishuLocalGatewayClientOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.options.onStatusChange?.("connecting");
    const healthy = await checkFeishuLocalGatewayHealth(this.options.settings);
    if (!healthy) {
      this.options.onStatusChange?.("gateway_unavailable", GATEWAY_UNAVAILABLE_MESSAGE);
      throw toGatewayUnavailableError();
    }

    this.started = true;
    this.options.onStatusChange?.("connected");
    void this.pollOnce();
    this.pollTimer = window.setInterval(() => {
      void this.pollOnce();
    }, 1500);
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.options.onStatusChange?.("stopped");
  }

  private async pollOnce(): Promise<void> {
    if (!this.started || this.polling) return;
    this.polling = true;
    try {
      const result = await fetchGatewayJson<GatewayEventsResponse>(this.options.settings, "/events");
      const messages = Array.isArray(result.messages) ? result.messages : [];
      for (const message of messages) {
        await this.options.onMessage(message);
      }
    } catch {
      if (!this.started) return;
      await this.stop();
      this.options.onStatusChange?.("gateway_unavailable", "本地飞书网关未启动");
    } finally {
      this.polling = false;
    }
  }
}

export { GATEWAY_UNAVAILABLE_MESSAGE };
