import type { ToolRegistry } from "../registries/tool-registry";
import { getNotebrainPlugin } from "../storage/notebrain-plugin-storage";
import { createAggregateTool } from "../tools/aggregate/aggregate-tool-factory";
import { findAggregateToolMeta } from "../tools/aggregate/aggregate-tool-metadata";
import { HomepageAgentService } from "../tools/homepage/homepage-agent-service";
import { createHomepageManageActionTools } from "../tools/homepage/homepage-manage.tool";
import { pushAgentDebugEvent } from "../debug/workbench-debug";
import {
  registerHomepageComponentTools,
  type HomepageComponentToolAccess,
} from "./register-homepage-component-tools";
import { HOMEPAGE_AGENT_WIDGET_CATALOG } from "../tools/homepage/homepage-agent-widget-catalog";
import {
  createAgentSurfaceCapabilitySnapshot,
  type AgentActionProvider,
  type AgentContextProvider,
  type AgentSurfaceCapabilitySnapshot,
} from "../../../../agent-platform/agent-surface-capability";

export interface HomepageToolRegistrationOptions {
  enabled: boolean;
}

function registerHomepageTools(
  toolRegistry: ToolRegistry,
  options: HomepageToolRegistrationOptions,
): void {
  if (!options.enabled) return;
  const meta = findAggregateToolMeta("homepage_manage");
  const service = new HomepageAgentService({ getPlugin: getNotebrainPlugin });
  const actions = createHomepageManageActionTools(service).map(({ action, tool }) => {
    const execute = tool.execute.bind(tool);
    return { action, tool: { ...tool, async execute(ctx: Parameters<typeof execute>[0], args: Parameters<typeof execute>[1]) {
      const raw = args && typeof args === "object" ? args as Record<string, unknown> : {};
      const debug = { action, surface: raw.surface ?? "auto", widgetType: raw.widgetType ?? raw.expectedType, widgetId: raw.widgetId, sectionId: raw.sectionId ?? raw.targetSectionId, revision: raw.expectedLayoutRevision, status: "prepared" };
      if (!tool.readOnly) pushAgentDebugEvent("HOMEPAGE_AGENT_WRITE_PREPARED", debug);
      const result = await execute(ctx, args);
      if (result.ok) pushAgentDebugEvent(tool.readOnly ? "HOMEPAGE_AGENT_READ" : "HOMEPAGE_AGENT_WRITE_COMMITTED", { ...debug, status: "ok" });
      else {
        const conflict = /conflict|revision|stale/i.test(String(result.error?.code ?? ""));
        pushAgentDebugEvent(conflict ? "HOMEPAGE_AGENT_WRITE_CONFLICT" : "HOMEPAGE_AGENT_WRITE_UNCERTAIN", { ...debug, status: result.error?.code ?? "failed" }, conflict ? "warn" : "error");
      }
      return result;
    } } };
  });
  toolRegistry.ensureTool(createAggregateTool({
    name: "homepage_manage",
    title: meta?.title ?? "主页管理",
    description: meta?.description ?? "读取和管理 siyuan-homepage 当前主页的组件、布局与分栏。",
    boundary: meta?.boundary ?? "只能通过插件正式主页 API 操作桌面或移动主页。",
    actions,
  }));
}

export function registerHomepageAgentCapabilities(
  toolRegistry: ToolRegistry,
  options: HomepageToolRegistrationOptions & { components: HomepageComponentToolAccess },
): AgentSurfaceCapabilitySnapshot {
  registerHomepageTools(toolRegistry, options);
  registerHomepageComponentTools(toolRegistry, options.components);

  const homepageToolNames = new Set([
    "homepage_manage",
    ...HOMEPAGE_AGENT_WIDGET_CATALOG
      .map((widget) => widget.businessCapability.businessTool)
      .filter((toolName): toolName is string => !!toolName),
  ]);
  const sharedToolActions = new Map<string, Set<string>>();
  for (const widget of HOMEPAGE_AGENT_WIDGET_CATALOG) {
    const capability = widget.businessCapability;
    if (!capability.reusedExistingTool || !capability.businessTool) continue;
    const allowed = sharedToolActions.get(capability.businessTool) ?? new Set<string>();
    capability.allowedActions?.forEach((action) => allowed.add(action));
    sharedToolActions.set(capability.businessTool, allowed);
  }
  const homepageTools = toolRegistry.listTools().filter((tool) => homepageToolNames.has(tool.name));
  const actions: AgentActionProvider[] = homepageTools.flatMap((tool) =>
    Object.values(tool.aggregateActionHelp ?? {})
      .filter((action) => !sharedToolActions.has(tool.name) || sharedToolActions.get(tool.name)!.has(action.action))
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
    const businessTool = widget.businessCapability.businessTool;
    const tool = businessTool ? toolRegistry.getTool(businessTool) : homepageManage;
    const allowedActions = widget.businessCapability.allowedActions;
    const readActions = Object.values(tool?.aggregateActionHelp ?? {})
      .filter((action) => action.readOnly === true && (!allowedActions || allowedActions.includes(action.action)))
      .map((action) => action.action);
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
