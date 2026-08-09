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
