import type { RobotKernelHost } from "./kernel-host";
import { RobotDedupCache } from "../features/robot-assistant/core/robot-dedup";

/**
 * Kernel 持久化去重：在内存 RobotDedupCache 基础上把最近 processed keys 落盘，
 * Kernel restart 后恢复 cursor，防止 WeChat 重投/重放时重复记账。
 */
export class KernelRobotDedup extends RobotDedupCache {
  private static readonly KEY = "robot-dedup-v1";
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(private readonly host: RobotKernelHost, ttlMs = 24 * 60 * 60 * 1000, maxEntries = 10000) {
    super(ttlMs, maxEntries);
  }

  /** 启动时从存储恢复最近 processed keys。 */
  async restore(now = Date.now()): Promise<void> {
    const raw = await this.host.storage.get(KernelRobotDedup.KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      for (const entry of parsed) {
        if (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).key === "string"
          && typeof (entry as Record<string, unknown>).processedAt === "number") {
          const item = entry as { key: string; processedAt: number };
          if (now - item.processedAt < this.ttlMs) {
            this.markProcessed(item.key, item.processedAt);
          }
        }
      }
    } catch {
      // ignore corrupt
    }
  }

  override markProcessed(key: string, now = Date.now()): void {
    super.markProcessed(key, now);
    this.persistQueue = this.persistQueue
      .catch(() => undefined)
      .then(() => this.persist(now));
  }

  private async persist(now: number): Promise<void> {
    const entries = Array.from(this.map.entries())
      .filter(([, at]) => now - at < this.ttlMs)
      .slice(-this.maxEntries)
      .map(([key, processedAt]) => ({ key, processedAt }));
    await this.host.storage.set(KernelRobotDedup.KEY, JSON.stringify(entries));
  }
}
