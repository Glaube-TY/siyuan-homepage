import type { RobotProviderId } from "../contracts/robot-provider";

/**
 * 机器人消息去重（持久化 ring/cache）。
 * 统一 key：`provider:accountId:messageId`。
 * 不只内存去重——WeChat cursor 恢复或平台重投时会重复执行（尤其记账不能重复新增）。
 */
export class RobotDedupCache {
  protected readonly map = new Map<string, number>();

  constructor(
    protected readonly ttlMs = 24 * 60 * 60 * 1000,
    protected readonly maxEntries = 10000,
  ) {}

  key(provider: RobotProviderId, accountId: string, messageId: string): string {
    return `${provider}:${accountId}:${messageId}`;
  }

  isProcessed(key: string, now = Date.now()): boolean {
    const processedAt = this.map.get(key);
    if (processedAt === undefined) return false;
    if (now - processedAt >= this.ttlMs) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  markProcessed(key: string, now = Date.now()): void {
    this.map.set(key, now);
    this.prune(now);
  }

  prune(now = Date.now()): void {
    if (this.map.size <= this.maxEntries) return;
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [key, at] of this.map) {
      if (now - at >= this.ttlMs) {
        this.map.delete(key);
        continue;
      }
      if (at < oldestAt) {
        oldestAt = at;
        oldestKey = key;
      }
    }
    if (this.map.size > this.maxEntries && oldestKey !== null) {
      this.map.delete(oldestKey);
    }
  }

  size(): number {
    return this.map.size;
  }
}
