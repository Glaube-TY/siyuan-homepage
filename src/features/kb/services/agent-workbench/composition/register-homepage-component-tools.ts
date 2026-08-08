import type { ToolRegistry } from "../registries/tool-registry";
import { createAggregateTool } from "../tools/aggregate/aggregate-tool-factory";
import { findAggregateToolMeta, type AggregateToolName } from "../tools/aggregate/aggregate-tool-metadata";
import { createHomepageQuickNoteActionTools } from "../tools/homepage-components/homepage-quick-note.tool";
import { createHomepageFocusActionTools } from "../tools/homepage-components/homepage-focus.tool";
import { createHomepageAccountingActionTools } from "../tools/homepage-components/homepage-accounting.tool";
import { createHomepageFixedAssetsActionTools } from "../tools/homepage-components/homepage-fixed-assets.tool";
import { createHomepageCountdownActionTools } from "../tools/homepage-components/homepage-countdown.tool";
import { createHomepageFavoritesActionTools } from "../tools/homepage-components/homepage-favorites.tool";
import { createHomepageReviewActionTools } from "../tools/homepage-components/homepage-review.tool";
import { createHomepageMusicActionTools } from "../tools/homepage-components/homepage-music.tool";
import { pushAgentDebugEvent } from "../debug/workbench-debug";
import { dispatchHomepageBusinessDataUpdated } from "@/components/utils/widgetBlock/widget/common/homepageBusinessDataEvents";

export interface HomepageComponentToolAccess {
  quickNote: boolean;
  focus: boolean;
  accounting: boolean;
  fixedAssets: boolean;
  anniversary: boolean;
  favorites: boolean;
  review: boolean;
  music: boolean;
}

function register(toolRegistry: ToolRegistry, name: AggregateToolName, actions: Parameters<typeof createAggregateTool>[0]["actions"]): void {
  const meta = findAggregateToolMeta(name);
  if (!meta) throw new Error(`组件业务工具元数据缺失：${name}`);
  const tracedActions = actions.map(({ action, tool }) => {
    const execute = tool.execute.bind(tool);
    return {
      action,
      tool: {
        ...tool,
        async execute(ctx: Parameters<typeof execute>[0], args: Parameters<typeof execute>[1]) {
          const raw = args && typeof args === "object" ? args as Record<string, unknown> : {};
          const entityId = ["recordId", "accountId", "eventId", "categoryId", "assetId", "taskId", "docId", "groupId", "targetId", "trackId", "playlistId"]
            .map((key) => raw[key]).find((value) => typeof value === "string");
          const base = { toolName: name, action, entityId: typeof entityId === "string" ? entityId : undefined };
          if (!tool.readOnly) pushAgentDebugEvent("HOMEPAGE_COMPONENT_TOOL_WRITE_PREPARED", { ...base, status: "prepared" });
          const result = await execute(ctx, args);
          if (result.ok) {
            if (!tool.readOnly) dispatchHomepageBusinessDataUpdated(name, action);
            pushAgentDebugEvent(tool.readOnly ? "HOMEPAGE_COMPONENT_TOOL_READ" : "HOMEPAGE_COMPONENT_TOOL_WRITE_COMMITTED", { ...base, status: "ok" });
          } else {
            const conflict = /conflict|stale|changed|revision|lock/i.test(String(result.error?.code ?? "")) || /已变化|冲突|重新读取/.test(String(result.error?.message ?? ""));
            pushAgentDebugEvent(conflict ? "HOMEPAGE_COMPONENT_TOOL_CONFLICT" : "HOMEPAGE_COMPONENT_TOOL_FAILED", { ...base, status: result.error?.code ?? "failed" }, conflict ? "warn" : "error");
          }
          return result;
        },
      },
    };
  });
  toolRegistry.ensureTool(createAggregateTool({ name, title: meta.title, description: meta.description, boundary: meta.boundary, actions: tracedActions }));
}

export function registerHomepageComponentTools(toolRegistry: ToolRegistry, access: HomepageComponentToolAccess): void {
  if (access.quickNote) register(toolRegistry, "homepage_quick_note", createHomepageQuickNoteActionTools());
  if (access.focus) register(toolRegistry, "homepage_focus", createHomepageFocusActionTools());
  if (access.accounting) register(toolRegistry, "homepage_accounting", createHomepageAccountingActionTools());
  if (access.fixedAssets) register(toolRegistry, "homepage_fixed_assets", createHomepageFixedAssetsActionTools());
  if (access.anniversary) register(toolRegistry, "homepage_anniversary", createHomepageCountdownActionTools());
  if (access.favorites) register(toolRegistry, "homepage_favorites", createHomepageFavoritesActionTools());
  if (access.review) register(toolRegistry, "homepage_review", createHomepageReviewActionTools());
  if (access.music) register(toolRegistry, "homepage_music", createHomepageMusicActionTools());
}
