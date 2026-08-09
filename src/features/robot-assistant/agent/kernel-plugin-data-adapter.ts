/**
 * Kernel 侧 PluginDataStore 适配：把 `RobotKernelHost.storage` 包装成
 * 与思源插件 `plugin.loadData / plugin.saveData` 兼容的对象。
 *
 * 现有主页业务 service（记账 / 快速笔记 / 收藏等）都以 `plugin` 对象读写数据
 * （`plugin.loadData(path)` / `plugin.saveData(path, data)`，JSON 文件自动解析 / 序列化）。
 * Kernel 工具传入本适配器，即可复用同一份业务逻辑并读写同一个 plugin scoped storage，
 * 满足「Robot Tool 和主页组件必须读写同一个业务数据源」。
 */

import type { RobotKernelHost } from "../../../kernel/kernel-host";

/** 与思源插件 loadData/saveData 兼容的最小接口。 */
export interface PluginLikeStorage {
  name: string;
  loadData(name: string): Promise<unknown>;
  saveData(name: string, data: unknown): Promise<void>;
  removeData(name: string): Promise<void>;
}

/** 从 Kernel host 构造插件兼容存储。JSON 文件按思源约定自动 parse/stringify。 */
export function createKernelPluginLikeStorage(host: RobotKernelHost): PluginLikeStorage {
  return {
    name: "siyuan-homepage",
    async loadData(name: string): Promise<unknown> {
      const raw = await host.storage.get(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw;
      }
    },
    async saveData(name: string, data: unknown): Promise<void> {
      const value = typeof data === "string" ? data : JSON.stringify(data);
      await host.storage.set(name, value);
    },
    async removeData(name: string): Promise<void> {
      await host.storage.remove(name);
    },
  };
}
