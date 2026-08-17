import type { ToolRegistry } from "../registries/tool-registry";
import { getNotebrainPlugin } from "../storage/notebrain-plugin-storage";
import { createAggregateTool } from "../tools/aggregate/aggregate-tool-factory";
import { findAggregateToolMeta } from "../tools/aggregate/aggregate-tool-metadata";
import type { AggregateActionBinding } from "../tools/aggregate/aggregate-tool-factory";
import type { SiyuanSharedActionBindings } from "./register-siyuan-tools";
import { HomepageAgentService } from "../tools/homepage/homepage-agent-service";
import {
  createHomepageComponentReadActionTools,
  createHomepageGlobalReadActionTools,
  createHomepageGlobalWriteActionTools,
} from "../tools/homepage/homepage-manage.tool";
import { HomepageSettingsService } from "../tools/homepage/homepage-settings-service";
import { createHomepageSettingsActionTools } from "../tools/homepage/homepage-settings.tool";
import { pushAgentDebugEvent } from "../debug/workbench-debug";
import {
  createHomepageComponentBusinessBindings,
  createHomepageComponentInstanceBindings,
  type HomepageComponentToolAccess,
} from "./register-homepage-component-tools";
import { HOMEPAGE_AGENT_WIDGET_CATALOG } from "../tools/homepage/homepage-agent-widget-catalog";
import {
  HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS,
  isHomepageComponentSubtoolPrefix,
} from "../tools/homepage/homepage-agent-business-capabilities";
import {
  createAgentSurfaceCapabilitySnapshot,
  type AgentActionProvider,
  type AgentContextProvider,
  type AgentSurfaceCapabilitySnapshot,
} from "../../../../agent-platform/agent-surface-capability";
import {
  createHomepageWorkbenchTool,
  type AgentTemporaryWorkbenchSource,
} from "../tools/homepage/homepage-workbench.tool";

export interface HomepageToolRegistrationOptions {
  /** homepage_manage（主页全局）是否注册。 */
  enabled: boolean;
  /** homepage_components（主页组件）是否注册。 */
  componentsEnabled?: boolean;
  workbench?: boolean;
  workbenchSource: AgentTemporaryWorkbenchSource;
  /** 用户设置的子工具禁用前缀（dotted action 前缀），如 ["music"]。 */
  disabledComponentSubtools?: readonly string[];
  /** 组件业务子工具启停（来自 builtinCapabilityAccess）。 */
  components: HomepageComponentToolAccess;
  /** 与 Siyuan 顶层工具共享的原子 action binding；顶层工具关闭时仍可用于 homepage 薄路由。 */
  sharedSiyuanActionBindings?: SiyuanSharedActionBindings;
  /** 验收或宿主已创建的主页服务；生产调用不传。 */
  service?: HomepageAgentService;
}

function traceExecute<T extends { readOnly: boolean; execute: (ctx: unknown, args: unknown) => Promise<{ ok: boolean; error?: { code?: string } | null }> }>(
  action: string,
  tool: T,
  extra: (args: Record<string, unknown>) => Record<string, unknown> = () => ({}),
): T {
  const execute = tool.execute.bind(tool);
  return {
    ...tool,
    async execute(ctx: unknown, args: unknown) {
      const raw = args && typeof args === "object" ? args as Record<string, unknown> : {};
      const patch = raw.patch && typeof raw.patch === "object" ? raw.patch as Record<string, unknown> : {};
      const debug = { action, surface: raw.surface ?? "auto", widgetType: raw.widgetType ?? raw.expectedType, widgetId: raw.widgetId, sectionId: raw.sectionId ?? raw.targetSectionId ?? patch.targetSectionId, revision: raw.expectedLayoutRevision, ...extra(raw) };
      if (!tool.readOnly) pushAgentDebugEvent("HOMEPAGE_AGENT_WRITE_PREPARED", debug);
      const result = await execute(ctx, args);
      if (result.ok) pushAgentDebugEvent(tool.readOnly ? "HOMEPAGE_AGENT_READ" : "HOMEPAGE_AGENT_WRITE_COMMITTED", { ...debug, status: "ok" });
      else {
        const conflict = /conflict|revision|stale/i.test(String(result.error?.code ?? ""));
        pushAgentDebugEvent(conflict ? "HOMEPAGE_AGENT_WRITE_CONFLICT" : "HOMEPAGE_AGENT_WRITE_UNCERTAIN", { ...debug, status: result.error?.code ?? "failed" }, conflict ? "warn" : "error");
      }
      return result;
    },
  } as T;
}

/**
 * 复用通用工具的组件薄路由：homepage_components 下每个组件拥有稳定子工具前缀，
 * action 转发到已注册的通用工具（diary_task / siyuan_kb / siyuan_database），
 * 只复用原 contract 的执行、参数校验、确认与写后验证，不复制任何业务实现。
 */
export function createHomepageReusedToolThinRoutes(
  shared: SiyuanSharedActionBindings | undefined,
  disabledSubtools: ReadonlySet<string>,
): AggregateActionBinding[] {
  if (!shared) return [];
  const sourceBindings: Record<string, readonly AggregateActionBinding[]> = {
    diary_task: shared.diaryTask,
    siyuan_kb: shared.knowledgeBase,
    siyuan_database: shared.database,
  };
  const bindings: AggregateActionBinding[] = [];
  for (const route of HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.filter((item) => item.kind === "reused")) {
    if (disabledSubtools.has(route.prefix)) continue;
    const source = sourceBindings[route.businessTool ?? ""] ?? [];
    for (const actionName of route.sourceActions ?? []) {
      const sourceBinding = source.find((item) => item.action === actionName);
      if (!sourceBinding) continue;
      bindings.push({
        action: route.prefix + "." + actionName,
        tool: sourceBinding.tool,
      });
    }
  }
  return bindings;
}

function registerHomepageTools(
  toolRegistry: ToolRegistry,
  options: HomepageToolRegistrationOptions,
): void {
  const manageEnabled = options.enabled === true;
  const componentsEnabled = options.componentsEnabled !== false;
  // 只有两者都关闭时才直接返回；homepage_manage 与 homepage_components 独立注册。
  if (!manageEnabled && !componentsEnabled) return;
  const service = manageEnabled || componentsEnabled
    ? options.service ?? new HomepageAgentService({ getPlugin: getNotebrainPlugin })
    : null;

  // ── homepage_manage：主页全局（概况/布局/分栏/设置/主题/快捷按钮）──
  if (manageEnabled) {
    const manageMeta = findAggregateToolMeta("homepage_manage");
    const settingsService = new HomepageSettingsService({ getPlugin: getNotebrainPlugin });
    const manageActions = [
      ...createHomepageGlobalReadActionTools(service!).map(({ action, tool }) => ({ action, tool: traceExecute(action, tool) })),
      ...createHomepageGlobalWriteActionTools(service!).map(({ action, tool }) => ({ action, tool: traceExecute(action, tool) })),
      ...createHomepageSettingsActionTools(settingsService).map(({ action, tool }) => ({
        action,
        tool: traceExecute(action, tool, (raw) => {
          const patch = raw.patch && typeof raw.patch === "object" ? raw.patch as Record<string, unknown> : {};
          return { patchFields: Object.keys(patch), revision: raw.expectedViewRevision };
        }),
      })),
    ];
    toolRegistry.ensureTool(createAggregateTool({
      name: "homepage_manage",
      title: manageMeta?.title ?? "主页全局",
      description: manageMeta?.description ?? "读取和修改 siyuan-homepage 桌面主页的概况、布局、分栏、设置、主题与快捷按钮。",
      boundary: manageMeta?.boundary ?? "只能通过插件正式主页 API 操作 desktop-homepage；不得写入本地图片数据、敏感凭据或白名单外字段。",
      actions: manageActions,
    }));
  }

  // ── homepage_components：主页组件（目录/实例/组件业务）──
  if (!componentsEnabled) return;
  const componentsMeta = findAggregateToolMeta("homepage_components");
  const disabled = new Set((options.disabledComponentSubtools ?? []).filter(isHomepageComponentSubtoolPrefix));
  const componentActions = [
    ...(disabled.has("catalog")
      ? []
      : createHomepageComponentReadActionTools(service!)
          .filter(({ action }) => action.startsWith("catalog."))
          .map(({ action, tool }) => ({ action, tool: traceExecute(action, tool) }))),
    ...(disabled.has("instance")
      ? []
      : createHomepageComponentReadActionTools(service!)
          .filter(({ action }) => action === "instance.list")
          .map(({ action, tool }) => ({ action, tool: traceExecute(action, tool) }))),
    ...createHomepageComponentInstanceBindings(service!, [...disabled]),
    ...createHomepageComponentBusinessBindings({
      access: options.components,
      disabledSubtools: [...disabled],
    }),
    ...createHomepageReusedToolThinRoutes(options.sharedSiyuanActionBindings, disabled),
  ];
  if (componentActions.length > 0) {
    toolRegistry.ensureTool(createAggregateTool({
      name: "homepage_components",
      title: componentsMeta?.title ?? "主页组件",
      description: componentsMeta?.description ?? "查询和管理主页组件：目录、已安装实例、展示配置、样式与各组件业务数据。",
      boundary: componentsMeta?.boundary ?? "只能通过插件正式主页 API 操作组件与组件业务存储；不得操作 desktop-sidebar、原始数据文件、敏感凭据或本地绝对路径。",
      actions: componentActions,
    }));
    service!.setAvailableComponentActions(Object.keys(toolRegistry.getTool("homepage_components")?.aggregateActionHelp ?? {}));
  }
}

export function registerHomepageAgentCapabilities(
  toolRegistry: ToolRegistry,
  options: HomepageToolRegistrationOptions & { components: HomepageComponentToolAccess },
): AgentSurfaceCapabilitySnapshot {
  registerHomepageTools(toolRegistry, options);
  if (options.workbench !== false) toolRegistry.ensureTool(createHomepageWorkbenchTool(options.workbenchSource));

  const homepageToolNames = new Set([
    "homepage_manage",
    "homepage_components",
  ]);
  const componentsTool = toolRegistry.getTool("homepage_components");
  const homepageTools = toolRegistry.listTools().filter((tool) => homepageToolNames.has(tool.name));
  const actions: AgentActionProvider[] = homepageTools.flatMap((tool) =>
    Object.values(tool.aggregateActionHelp ?? {})
      .map((action) => ({
      id: `homepage-action:${tool.name}:${action.action}`,
      title: `${tool.title} · ${action.action}`,
      scope: tool.name === "homepage_manage" ? "homepage" : "homepage-component",
      toolName: tool.name,
      action: action.action,
      readOnly: action.readOnly === true,
      idempotency: action.readOnly === true ? "read" : "non_idempotent",
      requiresConfirmation: action.requiresConfirmation === true,
      }))
  );

  const contexts: AgentContextProvider[] = [];
  const homepageManage = toolRegistry.getTool("homepage_manage");
  const homepageReadActions = Object.values(homepageManage?.aggregateActionHelp ?? {})
    .filter((action) => action.readOnly === true)
    .map((action) => action.action);
  if (homepageReadActions.length > 0) {
    contexts.push({
      id: "homepage-context:surface",
      title: "当前主页",
      scope: "homepage",
      sensitivity: "private",
      source: { toolName: "homepage_manage", actions: homepageReadActions },
    });
  }

  for (const widget of HOMEPAGE_AGENT_WIDGET_CATALOG) {
    const capability = widget.businessCapability;
    const tool = capability.toolName === "homepage_components" ? componentsTool : undefined;
    const availableActions = new Set(Object.keys(tool?.aggregateActionHelp ?? {}));
    const readActions = (capability.operations ?? []).filter((action) => (
      availableActions.has(action) && tool?.aggregateActionHelp?.[action]?.readOnly === true
    ));
    if (!tool || readActions.length === 0) continue;
    contexts.push({
      id: `homepage-context:widget:${widget.type}`,
      title: widget.label,
      scope: "homepage-component",
      sensitivity: "private",
      source: { toolName: tool.name, actions: readActions },
    });
  }

  return createAgentSurfaceCapabilitySnapshot({ contexts, actions });
}
