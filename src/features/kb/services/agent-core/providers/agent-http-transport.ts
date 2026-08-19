/**
 * Agent 模型 Provider 的 HTTP 传输抽象。
 *
 * 目标：请求构造逻辑共享一份，传输可注入：
 * - 浏览器（AI 知识库前端）：BrowserAgentHttpTransport 使用 fetch，支持流式 SSE；
 * - Kernel（Robot Kernel runtime）：KernelAgentHttpTransport 通过 Kernel HTTP port
 *   走思源正式 forwardProxy，使用 stream:false（非流式，避免 Goja 流式兼容问题）。
 *
 * AgentHttpResponse 与浏览器 Response 结构兼容，Provider adapter 无需按环境分支处理响应对象。
 */

import { AgentProviderError } from "./provider-error";
import { pushAgentDebugEvent } from "../../agent-workbench/debug/workbench-debug";
import type { AgentProviderEvent } from "./provider-adapter";

export interface AgentHttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
  /** 浏览器 stream 时为真实 ReadableStream；Kernel 非 stream 时为 null。 */
  body: ReadableStream<Uint8Array> | null;
}

export interface AgentHttpPostOptions {
  url: string;
  headers: Record<string, string>;
  body: string;
  /** 请求是否期望 SSE 流。浏览器为 true；Kernel 为 false。 */
  stream: boolean;
  signal?: AbortSignal;
}

export interface AgentHttpTransport {
  post(options: AgentHttpPostOptions): Promise<AgentHttpResponse>;
}

export function resolveProviderSemanticIdleTimeoutMs(requestTimeoutMs: number | undefined): number | undefined {
  return typeof requestTimeoutMs === "number" && Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
    ? Math.max(1, Math.round(requestTimeoutMs * 2))
    : undefined;
}

export class ProviderStreamLivenessGuard {
  private readonly semanticIdleTimeoutMs: number | undefined;
  private readonly startedAt = Date.now();
  private lastModelProgressAt = this.startedAt;
  private lastTransportActivityAt = this.startedAt;
  private hasModelProgress = false;

  constructor(private readonly options: {
    requestTimeoutMs?: number;
    signal?: AbortSignal;
    providerId: string;
    modelStepIndex?: number;
  }) {
    this.semanticIdleTimeoutMs = resolveProviderSemanticIdleTimeoutMs(options.requestTimeoutMs);
  }

  markTransportActivity(): void {
    this.lastTransportActivityAt = Date.now();
  }

  markModelProgress(event: AgentProviderEvent): void {
    const progressed = event.type === "text_delta" || event.type === "reasoning_delta"
      ? event.delta.length > 0
      : event.type === "tool_call_delta"
        ? !!(event.id || event.name || event.argumentsDelta)
        : event.type === "tool_call_done" || event.type === "usage" || event.type === "done";
    if (!progressed) return;
    this.hasModelProgress = true;
    this.lastModelProgressAt = Date.now();
  }

  throwIfSemanticIdle(): void {
    if (this.options.signal?.aborted || this.semanticIdleTimeoutMs === undefined) return;
    const now = Date.now();
    const lastModelProgressAgeMs = now - this.lastModelProgressAt;
    if (lastModelProgressAgeMs < this.semanticIdleTimeoutMs) return;
    pushAgentDebugEvent("PROVIDER_STREAM_SEMANTIC_IDLE_TIMEOUT_SAFE", {
      providerId: this.options.providerId,
      modelStepIndex: this.options.modelStepIndex,
      semanticIdleTimeoutMs: this.semanticIdleTimeoutMs,
      streamPhase: this.hasModelProgress ? "awaiting_next_model_progress" : "awaiting_first_model_progress",
      lastModelProgressAgeMs,
      lastTransportActivityAgeMs: now - this.lastTransportActivityAt,
    }, "warn");
    throw new AgentProviderError(
      "Provider 模型流连接仍在，但长时间没有返回可继续执行的内容，本轮已自动停止。",
      {
        code: "provider_stream_idle_timeout",
        category: "timeout",
        retryable: true,
        userAction: "retry",
        safeToReplay: true,
      },
    );
  }
}

export async function* readProviderStreamWithIdleTimeout(
  body: ReadableStream<Uint8Array>,
  options: {
    idleTimeoutMs?: number;
    signal?: AbortSignal;
    providerId: string;
    modelStepIndex?: number;
    livenessGuard?: ProviderStreamLivenessGuard;
  },
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  const idleTimeoutMs = typeof options.idleTimeoutMs === "number" && Number.isFinite(options.idleTimeoutMs)
    ? Math.max(1, Math.round(options.idleTimeoutMs))
    : undefined;
  let lastActivityAt = Date.now();
  let streamPhase = "awaiting_first_chunk";
  let streamCompleted = false;

  try {
    while (true) {
      const remainingMs = idleTimeoutMs === undefined
        ? undefined
        : Math.max(0, idleTimeoutMs - (Date.now() - lastActivityAt));
      const outcome = await new Promise<
        | { kind: "read"; result: ReadableStreamReadResult<Uint8Array> }
        | { kind: "aborted" }
        | { kind: "timeout" }
      >((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
        const finish = (value: { kind: "read"; result: ReadableStreamReadResult<Uint8Array> } | { kind: "aborted" } | { kind: "timeout" }): void => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) globalThis.clearTimeout(timer);
          options.signal?.removeEventListener("abort", onAbort);
          resolve(value);
        };
        const fail = (error: unknown): void => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) globalThis.clearTimeout(timer);
          options.signal?.removeEventListener("abort", onAbort);
          reject(error);
        };
        const onAbort = (): void => finish({ kind: "aborted" });

        if (options.signal?.aborted) {
          finish({ kind: "aborted" });
          return;
        }
        options.signal?.addEventListener("abort", onAbort, { once: true });
        if (remainingMs !== undefined) {
          timer = globalThis.setTimeout(() => {
            finish(options.signal?.aborted ? { kind: "aborted" } : { kind: "timeout" });
          }, remainingMs);
        }
        void reader.read().then(
          (result) => finish({ kind: "read", result }),
          fail,
        );
      });

      if (outcome.kind === "aborted") {
        try { await reader.cancel(); } catch { /* ignore cancellation failures */ }
        return;
      }
      if (outcome.kind === "timeout") {
        const lastActivityAgeMs = Date.now() - lastActivityAt;
        try { await reader.cancel(); } catch { /* ignore cancellation failures */ }
        pushAgentDebugEvent("PROVIDER_STREAM_IDLE_TIMEOUT_SAFE", {
          providerId: options.providerId,
          modelStepIndex: options.modelStepIndex,
          idleTimeoutMs,
          streamPhase,
          lastActivityAgeMs,
        }, "warn");
        throw new AgentProviderError(
          "Provider 流式连接已建立，但在规定时间内没有继续返回数据，当前模型请求已停止。",
          {
            code: "provider_stream_idle_timeout",
            category: "timeout",
            retryable: true,
            userAction: "retry",
            safeToReplay: true,
          },
        );
      }

      if (outcome.result.done) {
        streamCompleted = true;
        return;
      }
      const value = outcome.result.value;
      if (options.signal?.aborted) {
        try { await reader.cancel(); } catch { /* ignore cancellation failures */ }
        return;
      }
      options.livenessGuard?.throwIfSemanticIdle();
      if (value.byteLength > 0) {
        lastActivityAt = Date.now();
        streamPhase = "awaiting_next_chunk";
        options.livenessGuard?.markTransportActivity();
      }
      yield value;
    }
  } finally {
    if (!streamCompleted) {
      try { await reader.cancel(); } catch { /* ignore cancellation failures */ }
    }
    try { reader.releaseLock(); } catch { /* ignore already released readers */ }
  }
}

/** 浏览器传输：直接使用当前环境 fetch，保留 AI 知识库现有流式体验。 */
export class BrowserAgentHttpTransport implements AgentHttpTransport {
  async post(options: AgentHttpPostOptions): Promise<AgentHttpResponse> {
    const response = await fetch(options.url, {
      method: "POST",
      headers: options.headers,
      body: options.body,
      signal: options.signal,
    });
    return response as unknown as AgentHttpResponse;
  }
}

function createAbortError(): Error {
  const error = new Error("Provider request aborted.");
  error.name = "AbortError";
  return error;
}

/** Adds one shared request timeout to browser and Kernel transports. */
export class TimedAgentHttpTransport implements AgentHttpTransport {
  constructor(
    private readonly transport: AgentHttpTransport,
    private readonly timeoutMs: number,
  ) {}

  post(options: AgentHttpPostOptions): Promise<AgentHttpResponse> {
    const timeoutMs = Math.max(1_000, Math.round(this.timeoutMs));
    return new Promise((resolve, reject) => {
      let settled = false;
      const controller = new AbortController();
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        options.signal?.removeEventListener("abort", onExternalAbort);
        callback();
      };
      const onExternalAbort = (): void => {
        controller.abort();
        finish(() => reject(createAbortError()));
      };
      const timer = globalThis.setTimeout(() => {
        controller.abort();
        finish(() => reject(new AgentProviderError(`Provider request timed out after ${timeoutMs}ms.`, {
          code: "provider_timeout",
          category: "timeout",
          retryable: true,
          userAction: "retry",
        })));
      }, timeoutMs);

      if (options.signal?.aborted) {
        onExternalAbort();
        return;
      }
      options.signal?.addEventListener("abort", onExternalAbort, { once: true });
      void this.transport.post({ ...options, signal: controller.signal }).then(
        (response) => finish(() => resolve(response)),
        (error) => finish(() => reject(error)),
      );
    });
  }
}

/**
 * Kernel 网络端口：由 Kernel entry 接线到 `siyuan.client.fetch("/api/network/forwardProxy", ...)`。
 * 这里只定义契约；具体 Kernel 接线在 kernel runtime 增量中实现。
 */
export interface KernelHttpPort {
  postJson(
    url: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<{ status: number; statusText: string; headers: Record<string, string>; text: string }>;
}

/** Kernel 传输：非流式。Kernel Robot 用 stream:false，避免 ReadableStream/SSE parser。 */
export class KernelAgentHttpTransport implements AgentHttpTransport {
  constructor(private readonly port: KernelHttpPort) {}

  async post(options: AgentHttpPostOptions): Promise<AgentHttpResponse> {
    const result = await this.port.postJson(options.url, options.headers, options.body);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      statusText: result.statusText,
      headers: {
        get(name: string): string | null {
          const value = result.headers[name.toLowerCase()];
          return value ?? null;
        },
      },
      async json(): Promise<unknown> {
        return JSON.parse(result.text);
      },
      async text(): Promise<string> {
        return result.text;
      },
      body: null,
    };
  }
}
