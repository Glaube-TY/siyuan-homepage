import { NativeToolRegistry } from "../../../features/kb/services/agent-core/tools/native-tool-registry";
import type { NativeTool } from "../../../features/kb/services/agent-core/tools/native-tool";
import type { RobotKernelHost } from "../../../kernel/kernel-host";
import { createKernelPluginLikeStorage } from "./kernel-plugin-data-adapter";
import { ToolRegistry } from "../../../features/kb/services/agent-workbench/registries/tool-registry";
import { ToolResultLog } from "../../../features/kb/services/agent-workbench/runtime/tool-result-log";
import { registerSiyuanTools } from "../../../features/kb/services/agent-workbench/composition/register-siyuan-tools";
import { createRobotComponentBusinessBindings } from "../../../features/kb/services/agent-workbench/composition/register-homepage-component-tools";
import { createAggregateTool } from "../../../features/kb/services/agent-workbench/tools/aggregate/aggregate-tool-factory";
import { findAggregateToolMeta } from "../../../features/kb/services/agent-workbench/tools/aggregate/aggregate-tool-metadata";
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
import { registerWebTools } from "../../../features/kb/services/agent-workbench/composition/register-web-tools";
import { getGlobalMemoryProfile } from "../../../features/kb/services/agent-workbench/memory/global-memory-store";
import { setNotificationCenterPlugin } from "../../../features/notification-center/notification-center-plugin";
import type { WebSearchSettingsBinding } from "../../../features/kb/services/agent-workbench/tools/web-search/web-search-router";

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
  webSearchSettingsBinding?: WebSearchSettingsBinding;
} = {}): Promise<NativeToolRegistry> {
  const registry = new NativeToolRegistry();
  for (const tool of options.kernelSafeTools ?? []) {
    if (tool.name) registry.register(tool);
  }
  if (options.host) {
    await registerKernelDataTools(registry, options.host, options.webSearchSettingsBinding);
  }
  return registry;
}

/** 注册基于 PluginDataStore 的 Kernel-safe 主页业务工具。 */
async function registerKernelDataTools(
  registry: NativeToolRegistry,
  host: RobotKernelHost,
  webSearchSettingsBinding?: WebSearchSettingsBinding,
): Promise<void> {
  const storage = createKernelPluginLikeStorage(host);
  // Existing homepage and Agent services all receive the same plugin-scoped
  // data adapter. No Robot-only business JSON or duplicated service exists.
  setNotebrainPlugin(storage as never);
  setNotificationCenterPlugin(storage as never);
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
  // Kernel-safe 主页组件业务子工具：quick_note/focus/accounting/fixed_assets/anniversary/favorites/review；
  // 不注册 music（播放器运行时）与 instance/catalog（依赖桌面设备视图）。
  const componentsMeta = findAggregateToolMeta("homepage_components");
  const robotComponentActions = createRobotComponentBusinessBindings();
  if (robotComponentActions.length > 0 && componentsMeta) {
    toolRegistry.ensureTool(createAggregateTool({
      name: "homepage_components",
      title: componentsMeta.title,
      description: componentsMeta.description,
      boundary: "Robot Kernel 只注册 Kernel-safe 组件业务子工具；不开放依赖桌面 DOM、设备视图或播放器运行时的操作。",
      actions: robotComponentActions,
    }));
  }
  registerSystemTools(toolRegistry, {
    memory: {
      read: true,
      write: true,
      source: { profileId: "remote-robot", surface: "远程机器人对话" },
      writeRequiresConfirmation: !(await getGlobalMemoryProfile()).autoLearn,
    },
    automation: {
      source: { profileId: "remote-robot", surface: "远程机器人对话" },
      resolveRunnerDeviceId: async () => {
        const response = await host.siyuanPost("/api/system/getConf", {});
        const data = response.data && typeof response.data === "object" ? response.data as Record<string, unknown> : {};
        const conf = data.conf && typeof data.conf === "object" ? data.conf as Record<string, unknown> : {};
        const system = conf.system && typeof conf.system === "object" ? conf.system as Record<string, unknown> : {};
        return typeof system.id === "string" ? system.id : undefined;
      },
    },
    notification: true,
  });
  if (webSearchSettingsBinding) {
    registerWebTools(toolRegistry, {
      globalToolAccess: { webFetch: true, webSearch: false },
      webReadPageToolDeps: {
        readPageMaxChars: 12000,
        timeoutMs: 15000,
        getConfig: () => {
          const settings = webSearchSettingsBinding.get();
          return {
            readProxyEndpoint: settings.readProxyEndpoint,
            readPageMaxChars: settings.readPageMaxChars,
            timeoutMs: settings.timeoutMs,
          };
        },
      },
      webFetchReadPageOnly: true,
    });
  }

  const native = createNativeToolRegistryFromWorkbench({
    toolRegistry,
    observationLog: new ToolResultLog(),
    question: "Robot Assistant Kernel",
    trustInternallyConfirmed: false,
  });
  for (const tool of native.list()) registry.register(tool);
}
