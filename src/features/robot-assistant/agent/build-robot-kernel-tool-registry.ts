import { NativeToolRegistry } from "../../../features/kb/services/agent-core/tools/native-tool-registry";
import type { NativeTool } from "../../../features/kb/services/agent-core/tools/native-tool";
import type { RobotKernelHost } from "../../../kernel/kernel-host";
import { createKernelPluginLikeStorage } from "./kernel-plugin-data-adapter";
import { ToolRegistry } from "../../../features/kb/services/agent-workbench/registries/tool-registry";
import { ToolResultLog } from "../../../features/kb/services/agent-workbench/runtime/tool-result-log";
import { registerSiyuanTools } from "../../../features/kb/services/agent-workbench/composition/register-siyuan-tools";
import { registerHomepageComponentTools } from "../../../features/kb/services/agent-workbench/composition/register-homepage-component-tools";
import { createNativeToolRegistryFromWorkbench } from "../../../features/kb/services/agent-core/tools/workbench-tool-adapter";
import { setNotebrainPlugin } from "../../../features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import { setSharedWidgetStoragePlugin } from "../../../components/utils/widgetBlock/widget/sharedLocalStorage/sharedLocalStorage";
import {
  ROBOT_QUICK_NOTE_CONFIG_KEY,
  setQuickNoteConfigLoader,
  setQuickNoteWritePlugin,
} from "../../../features/quick-note/quick-note-write-service";
import { registerDocContentEditConfirmationHandler } from "../../../features/kb/services/doc-content-edit/doc-content-edit-confirmation-bridge";
import { registerSystemTools } from "../../../features/kb/services/agent-workbench/composition/register-system-tools";
import { getGlobalMemoryProfile } from "../../../features/kb/services/agent-workbench/memory/global-memory-store";

/**
 * 构建 Kernel-safe 工具注册表。
 *
 * 只注册已经在 Kernel 环境稳定执行的工具（经 PluginDataStore / SiyuanRuntimePort 适配）。
 * 本轮明确不暴露：homepage_manage（桌面主页是 physical device scoped）、homepage_music runtime playback、
 * PC 本地命令 / Notebrain command execution、Electron-only filesystem sandbox、stdio MCP、
 * 依赖当前 DOM / 设备 view context 的工具。
 *
 * host 存在时构建真实 Kernel-safe 工具；否则（测试 / 未接宿主）只注册注入的工具。
 */
export async function buildRobotKernelToolRegistry(options: {
  host?: RobotKernelHost;
  kernelSafeTools?: readonly NativeTool[];
} = {}): Promise<NativeToolRegistry> {
  const registry = new NativeToolRegistry();
  for (const tool of options.kernelSafeTools ?? []) {
    if (tool.name) registry.register(tool);
  }
  if (options.host) {
    await registerKernelDataTools(registry, options.host);
  }
  return registry;
}

/** 注册基于 PluginDataStore 的 Kernel-safe 主页业务工具。 */
async function registerKernelDataTools(registry: NativeToolRegistry, host: RobotKernelHost): Promise<void> {
  const storage = createKernelPluginLikeStorage(host);
  // Existing homepage and Agent services all receive the same plugin-scoped
  // data adapter. No Robot-only business JSON or duplicated service exists.
  setNotebrainPlugin(storage as never);
  setSharedWidgetStoragePlugin(storage);
  setQuickNoteWritePlugin(storage);
  setQuickNoteConfigLoader(async () => {
    const snapshot = await storage.loadData(ROBOT_QUICK_NOTE_CONFIG_KEY);
    return snapshot && typeof snapshot === "object" ? snapshot as Record<string, unknown> : {};
  });

  const toolRegistry = new ToolRegistry();
  const confirmationRoute = {
    panelInstanceId: "robot-kernel",
    conversationId: "robot-kernel",
    turnId: "robot-kernel-runtime",
  };
  // Native Robot permission asks the remote sender first. The existing doc
  // editor has a second, UI-oriented internal confirmation; allow only that
  // inner bridge so the shared executor can commit after the outer approval.
  registerDocContentEditConfirmationHandler("robot-kernel", async () => ({
    status: "confirmed",
    message: "远程确认已由 Robot permission gate 完成。",
  }));

  registerSiyuanTools(toolRegistry, {
    kbRetrievalToolDeps: {
      getScope: () => ({ type: "whole_kb" }),
      getEffectiveScope: () => ({ type: "whole_kb" }),
      loadPluginData: async <T>(key: string) => await storage.loadData(key) as T | null,
      savePluginData: async <T>(key: string, data: T) => storage.saveData(key, data),
      confirmationRoute,
    },
    conversationId: "robot-kernel",
    confirmationRoute,
    builtinCapabilityAccess: {
      knowledgeBase: true,
      scheduleTaskDiary: true,
      databaseAssistant: true,
      docContentEditing: true,
      notebookDocTree: true,
      tagBookmarkOutline: true,
      assetManagement: true,
      riffReview: true,
    },
    globalToolAccess: {},
  });
  registerHomepageComponentTools(toolRegistry, {
    quickNote: true,
    focus: true,
    accounting: true,
    fixedAssets: true,
    anniversary: true,
    favorites: true,
    review: true,
    music: false,
  });
  registerSystemTools(toolRegistry, {
    memory: {
      read: true,
      write: true,
      source: { profileId: "remote-robot", surface: "远程机器人对话" },
      writeRequiresConfirmation: !(await getGlobalMemoryProfile()).autoLearn,
    },
  });

  const native = createNativeToolRegistryFromWorkbench({
    toolRegistry,
    observationLog: new ToolResultLog(),
    question: "Robot Assistant Kernel",
    trustInternallyConfirmed: false,
  });
  for (const tool of native.list()) registry.register(tool);
}
