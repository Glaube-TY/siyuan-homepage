import type { ToolRegistry } from "../registries/tool-registry";
import { getNotebrainPlugin } from "../storage/notebrain-plugin-storage";
import { createAggregateTool } from "../tools/aggregate/aggregate-tool-factory";
import { findAggregateToolMeta } from "../tools/aggregate/aggregate-tool-metadata";
import { HomepageAgentService } from "../tools/homepage/homepage-agent-service";
import { createHomepageManageActionTools } from "../tools/homepage/homepage-manage.tool";
import { pushAgentDebugEvent } from "../debug/workbench-debug";

export interface HomepageToolRegistrationOptions {
  enabled: boolean;
}

export function registerHomepageTools(
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
