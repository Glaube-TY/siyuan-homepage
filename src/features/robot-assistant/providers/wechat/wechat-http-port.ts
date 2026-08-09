import type { RobotKernelHost } from "../../../../kernel/kernel-host";

/**
 * 微信 Provider HTTP 端口：隔离具体 openclaw-weixin 协议传输。
 * Kernel 实现经 `siyuan.client.fetch` 转发；浏览器/测试可注入 stub。
 */
export interface WeChatHttpPort {
  request(input: {
    baseUrl: string;
    path: string;
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    timeoutMs: number;
  }): Promise<{ status: number; text: string }>;
}

/** Kernel 微信 HTTP 端口：经思源内核网络代理转发。 */
export function createKernelWeChatHttpPort(host: RobotKernelHost): WeChatHttpPort {
  return {
    async request({ baseUrl, path, method = "POST", headers = {}, body, timeoutMs }) {
      const url = `${baseUrl.replace(/\/+$/, "")}/${path}`;
      const result = await host.httpRequest(
        url,
        method,
        method === "POST" ? { "Content-Type": "application/json", ...headers } : headers,
        body === undefined ? undefined : JSON.stringify(body),
        timeoutMs,
      );
      return { status: result.status, text: result.text };
    },
  };
}
