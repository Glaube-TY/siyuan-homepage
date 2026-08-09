/**
 * Electron Provider bundle 加载器。
 *
 * 飞书 / QQ Provider 运行在 Electron 渲染进程，通过现有 `window.require` 加载
 * 发布在 `runtime/robot/<provider>-provider.cjs` 的独立 bundle（已打包各自官方 Node SDK）。
 *
 * 加载失败（非 Electron / 无 window.require / 文件不存在）时返回 null，
 * 调用方上报 `electron_runtime_unavailable`，UI 显示「仅支持思源桌面客户端」。
 */

import type { RobotProviderId } from "../contracts/robot-provider";

/** Electron Provider bundle 导出的 JS API 契约。 */
export interface ElectronProviderApi {
  connect(): Promise<unknown>;
  disconnect(): Promise<void>;
  getStatus(): Record<string, unknown>;
  sendText(message: {
    chatId: string;
    text: string;
    replyToMessageId?: string;
    contextToken?: string;
  }): Promise<void>;
  setMessageHandler(handler: (message: unknown) => void | Promise<void>): void;
  setStatusHandler?(handler: (status: Record<string, unknown>) => void): void;
}

export interface ElectronProviderModule {
  create(options: Record<string, unknown>): ElectronProviderApi;
}

export const ELECTRON_PROVIDER_FILES: Record<RobotProviderId, string> = {
  wechat: "",
  feishu: "feishu-provider.cjs",
  qq: "qq-provider.cjs",
};

/** 检测 Electron 渲染进程可用的 Node require（失败返回 null）。 */
function detectNodeRequire(): ((id: string) => unknown) | null {
  try {
    const candidate = (window as unknown as { require?: unknown }).require;
    if (typeof candidate === "function") {
      return candidate as (id: string) => unknown;
    }
  } catch {
    // 非 Electron 环境忽略
  }
  return null;
}

/** 读取思源工作空间 data 目录（Electron 桌面端）。 */
function getSiyuanDataDir(): string | null {
  try {
    const dataDir = (window as unknown as { siyuan?: { config?: { system?: { dataDir?: unknown } } } })
      ?.siyuan?.config?.system?.dataDir;
    return typeof dataDir === "string" && dataDir.trim() ? dataDir.trim() : null;
  } catch {
    return null;
  }
}

/**
 * 解析 provider bundle 的绝对路径候选：
 * 1. dataDir/plugins/<pluginName>/runtime/robot/<file>（用户安装插件的正式位置）
 * 2. dataDir/../resources/plugins/<pluginName>/runtime/robot/<file>（应用内置插件回退）
 */
function resolveProviderPathCandidates(
  pluginName: string,
  providerId: RobotProviderId,
  pathModule: { join: (...parts: string[]) => string },
  processModule: { cwd: () => string } | null,
): string[] {
  const file = ELECTRON_PROVIDER_FILES[providerId];
  const candidates: string[] = [];
  const dataDir = getSiyuanDataDir();
  if (dataDir) {
    candidates.push(pathModule.join(dataDir, "plugins", pluginName, "runtime", "robot", file));
    candidates.push(pathModule.join(dataDir, "..", "resources", "plugins", pluginName, "runtime", "robot", file));
  }
  if (processModule) {
    try {
      candidates.push(pathModule.join(processModule.cwd(), "runtime", "robot", file));
    } catch {
      // 忽略 cwd 读取失败
    }
  }
  return candidates;
}

/** 尝试用 window.require 加载 provider bundle；失败返回 null。 */
export async function loadElectronProviderModule(
  pluginName: string,
  providerId: RobotProviderId,
): Promise<ElectronProviderModule | null> {
  const requireFn = detectNodeRequire();
  if (!requireFn) return null;
  const file = ELECTRON_PROVIDER_FILES[providerId];
  if (!file) return null;

  let pathModule: { join: (...parts: string[]) => string } | null = null;
  let processModule: { cwd: () => string } | null = null;
  try {
    const loaded = requireFn("path") as { join: (...parts: string[]) => string };
    if (loaded && typeof loaded.join === "function") pathModule = loaded;
  } catch {
    pathModule = null;
  }
  try {
    const loaded = requireFn("process") as { cwd: () => string };
    if (loaded && typeof loaded.cwd === "function") processModule = loaded;
  } catch {
    processModule = null;
  }
  if (!pathModule) return null;

  for (const candidate of resolveProviderPathCandidates(pluginName, providerId, pathModule, processModule)) {
    try {
      const mod = requireFn(candidate) as unknown;
      const module = mod as Partial<ElectronProviderModule>;
      if (module && typeof module.create === "function") {
        return module as ElectronProviderModule;
      }
    } catch {
      // 尝试下一个候选路径
    }
  }
  return null;
}
