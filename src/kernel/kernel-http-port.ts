import type { KernelHttpPort } from "../features/kb/services/agent-core/providers/agent-http-transport";
import type { RobotKernelHost } from "./kernel-host";

/**
 * KernelHttpPort 的宿主实现：经 `siyuan.client.fetch("/api/network/forwardProxy")` 转发模型请求。
 * 每次模型调用独立设置 timeout（默认 55s，防止挂起 WeChat long-poll worker）。
 */
export function createKernelHttpPort(host: RobotKernelHost, timeoutMs = 55_000): KernelHttpPort {
  return {
    postJson(url, headers, body) {
      return host.httpPostJson(url, headers, body, timeoutMs);
    },
  };
}
