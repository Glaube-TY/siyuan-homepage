/**
 * Environment-neutral SiYuan runtime port.
 *
 * Client runtime injects the official frontend SDK implementation; Kernel
 * runtime injects `siyuan.client.fetch`. Business services continue importing
 * the single `src/api.ts` wrapper and therefore keep one implementation.
 */
export interface SiyuanApiEnvelope {
  code: number;
  msg?: string;
  data?: unknown;
}

export interface SiyuanRuntimePort {
  post(path: string, payload: unknown): Promise<SiyuanApiEnvelope>;
  getFile?(path: string): Promise<unknown>;
  /** Kernel 运行时通过 client.fetch 发送 multipart；前端缺省继续使用 FormData。 */
  putFile?(path: string, isDir: boolean, file: unknown): Promise<SiyuanApiEnvelope>;
  getFrontend?(): string;
  platform?: {
    isInAndroid?(): boolean;
    isInIOS?(): boolean;
    isHuawei?(): boolean;
    sendNotification?(params: Record<string, unknown>): Promise<number>;
    cancelNotification?(id: number): void;
  };
}

let activePort: SiyuanRuntimePort | null = null;

export function setSiyuanRuntimePort(port: SiyuanRuntimePort): void {
  activePort = port;
}

export function getSiyuanRuntimePort(): SiyuanRuntimePort {
  if (!activePort) throw new Error("SiYuan runtime port has not been initialized.");
  return activePort;
}
