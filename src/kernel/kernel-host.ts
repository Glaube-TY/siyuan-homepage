import type { RobotDebugLogger } from "../features/robot-assistant/core/robot-logger";

/**
 * Robot Kernel 运行时宿主抽象。
 *
 * 只在这里接真实 `siyuan.*` Kernel Plugin API：
 * - storage：`siyuan.storage`（plugin scoped storage root = data/storage/petal/siyuan-homepage）
 * - httpPostJson：`siyuan.client.fetch("/api/network/forwardProxy", ...)`（Kernel 调模型服务）
 * - registerRpc / notify：Kernel Plugin RPC 注册与前端 notification
 *
 * Kernel entry 通过 `createRobotKernelRuntime(host, deps)` 组装；其余代码不直接依赖 `siyuan.*`，
 * 因此可在 Node 测试 / 前端环境中验证与复用。具体 `siyuan.*` 适配在 host 实现中完成。
 */
export interface RobotKernelHost {
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  /** 调用当前 SiYuan Kernel 的本机 JSON API（非外部 forwardProxy）。 */
  siyuanPost(path: string, payload: unknown): Promise<{ code: number; msg?: string; data?: unknown }>;
  /** 读取工作区文件；404/其他错误保留 Kernel 返回的错误 envelope。 */
  siyuanGetFile(path: string): Promise<unknown>;
  /** 通过 Kernel client.fetch 以 multipart/form-data 写入工作区文件。 */
  siyuanPutFile(path: string, isDir: boolean, file: unknown): Promise<{ code: number; msg?: string; data?: unknown }>;
  /** 经思源内核 HTTP proxy 转发 POST JSON；返回状态、headers 与文本。 */
  httpPostJson(
    url: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs: number,
  ): Promise<{ status: number; statusText: string; headers: Record<string, string>; text: string }>;
  /** 通用 HTTP 请求；微信二维码状态使用 GET，其余协议请求使用 POST。 */
  httpRequest(
    url: string,
    method: "GET" | "POST",
    headers: Record<string, string>,
    body: string | undefined,
    timeoutMs: number,
  ): Promise<{ status: number; statusText: string; headers: Record<string, string>; text: string }>;
  /** 注册 Kernel RPC：method -> handler（payload 为 JSON 可序列化数据）。 */
  registerRpc(method: string, handler: (payload: unknown) => Promise<unknown>): Promise<void>;
  /** 向前端发送 Kernel notification。 */
  notify(event: string, payload: unknown): void;
  log: RobotDebugLogger;
  /** 调度 / 取消定时器。 */
  timeout(fn: () => void, ms: number): () => void;
  /** 插件生命周期清理时调用（卸载 / 关停）。 */
  dispose?(): Promise<void>;
}
