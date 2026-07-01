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
  queueLength?: number;
}

interface GatewayAckResponse {
  ok?: boolean;
  queueLength?: number;
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

function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  function onAbort() {
    controller.abort();
    cleanup();
  }
  function cleanup() {
    for (const signal of signals) {
      signal.removeEventListener("abort", onAbort);
    }
  }
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      cleanup();
      return controller.signal;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

async function fetchGatewayJson<T>(
  settings: ChatActionRuntimeSettings,
  path: string,
  init: RequestInit = {},
  timeoutMs = 4000,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const signal = init.signal
      ? combineAbortSignals(init.signal, controller.signal)
      : controller.signal;
    const response = await fetch(buildGatewayUrl(settings, path), {
      ...init,
      headers: {
        ...buildGatewayHeaders(settings),
        ...(init.headers ?? {}),
      },
      signal,
    });
    if (!response.ok) {
      throw new Error(response.status === 401 ? "本地飞书网关认证失败。" : "本地飞书网关请求失败。");
    }
    return await response.json() as T;
  } finally {
    window.clearTimeout(timer);
  }
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

async function ackGatewayMessages(
  settings: ChatActionRuntimeSettings,
  messageIds: string[],
): Promise<void> {
  if (messageIds.length === 0) return;
  await fetchGatewayJson<GatewayAckResponse>(settings, "/ack", {
    method: "POST",
    body: JSON.stringify({ messageIds }),
  });
}

export class FeishuLocalGatewayClient {
  private options: FeishuLocalGatewayClientOptions;
  private started = false;
  private polling = false;
  private consecutiveFailures = 0;
  private abortController: AbortController | null = null;
  private retryTimer: number | null = null;
  private resolveRetry: (() => void) | null = null;
  private wakeRequested = false;
  private readonly handleVisibilityChange: () => void;
  private readonly handleFocus: () => void;
  private readonly handleOnline: () => void;

  constructor(options: FeishuLocalGatewayClientOptions) {
    this.options = options;
    this.handleVisibilityChange = () => {
      if (!this.started) return;
      if (document.visibilityState === "visible") {
        this.immediateRetry();
      }
    };
    this.handleFocus = () => {
      if (this.started) this.immediateRetry();
    };
    this.handleOnline = () => {
      if (this.started) this.immediateRetry();
    };
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.consecutiveFailures = 0;
    this.options.onStatusChange?.("connecting");
    const healthy = await checkFeishuLocalGatewayHealth(this.options.settings);
    if (!this.started) return;
    if (!healthy) {
      this.options.onStatusChange?.("gateway_unavailable", "本地网关暂不可用，正在自动重试");
    } else {
      this.options.onStatusChange?.("connected");
    }
    this.attachWindowListeners();
    void this.pollLoop();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.wakeRequested = false;
    this.detachWindowListeners();
    this.abortActiveFetch();
    this.wakeUp();
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.resolveRetry = null;
    this.options.onStatusChange?.("stopped");
  }

  private attachWindowListeners(): void {
    window.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("focus", this.handleFocus);
    window.addEventListener("online", this.handleOnline);
  }

  private detachWindowListeners(): void {
    window.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("focus", this.handleFocus);
    window.removeEventListener("online", this.handleOnline);
  }

  private abortActiveFetch(): boolean {
    if (!this.abortController) return false;
    this.abortController.abort();
    this.abortController = null;
    return true;
  }

  private immediateRetry(): void {
    const aborted = this.abortActiveFetch();
    if (aborted) this.wakeRequested = true;
    this.wakeUp();
  }

  private wakeUp(): void {
    if (this.resolveRetry) {
      const resolve = this.resolveRetry;
      this.resolveRetry = null;
      resolve();
    }
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.resolveRetry = resolve;
      this.retryTimer = window.setTimeout(() => {
        this.resolveRetry = null;
        this.retryTimer = null;
        resolve();
      }, ms);
    });
  }

  private backoffMs(): number {
    const table = [2000, 5000, 10000, 30000];
    const index = Math.max(0, Math.min(this.consecutiveFailures - 1, table.length - 1));
    return table[index];
  }

  private async pollLoop(): Promise<void> {
    while (this.started) {
      if (this.polling) {
        await this.delay(100);
        continue;
      }
      this.polling = true;
      const pollController = new AbortController();
      this.abortController = pollController;
      try {
        const result = await fetchGatewayJson<GatewayEventsResponse>(
          this.options.settings,
          "/events?limit=20&waitMs=25000",
          { signal: pollController.signal },
          35000,
        );
        if (this.abortController === pollController) {
          this.abortController = null;
        }
        if (!this.started) break;
        this.consecutiveFailures = 0;
        this.wakeRequested = false;
        this.options.onStatusChange?.("connected");
        const messages = Array.isArray(result.messages) ? result.messages : [];
        if (messages.length > 0) {
          const ackIds: string[] = [];
          for (const message of messages) {
            try {
              await this.options.onMessage(message);
            } catch {
              // Individual message failures should not crash the loop.
            } finally {
              ackIds.push(message.messageId);
            }
          }
          try {
            await ackGatewayMessages(this.options.settings, ackIds);
          } catch {
            // Ack failures are tolerated; unacknowledged messages will be redelivered
            // and the service-level messageId deduplication will ignore duplicates.
          }
        }
      } catch {
        if (!this.started) break;
        const wasWakeRequested = this.wakeRequested;
        this.wakeRequested = false;
        if (wasWakeRequested) {
          continue;
        }
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures > 2) {
          this.options.onStatusChange?.("gateway_unavailable", "本地网关暂不可用，正在自动重试");
        }
        await this.delay(this.backoffMs());
      } finally {
        this.polling = false;
        if (this.abortController === pollController) {
          this.abortController = null;
        }
      }
    }
  }
}

export { GATEWAY_UNAVAILABLE_MESSAGE };
