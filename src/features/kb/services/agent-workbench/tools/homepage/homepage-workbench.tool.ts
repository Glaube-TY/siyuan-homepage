import { z } from "zod";
import type { ToolContract } from "../../contracts/tool-contract";
import type { ToolResultEntry } from "../../runtime/tool-result-log";
import { saveTemporaryWorkbench } from "./temporary-workbench-store";
import {
  hasTemporaryWorkbenchLayout,
  sanitizeTemporaryWorkbenchHtml,
  temporaryWorkbenchManifestSchema,
  type AgentTemporaryWorkbench,
  type AgentTemporaryWorkbenchSource,
} from "./temporary-workbench-contract";

export {
  isSafeSiyuanWorkbenchTarget,
  hasTemporaryWorkbenchLayout,
  normalizeTemporaryWorkbench,
  normalizeTemporaryWorkbenchClassNames,
  normalizeTemporaryWorkbenchReference,
  sanitizeTemporaryWorkbenchHtml,
  toTemporaryWorkbenchReference,
} from "./temporary-workbench-contract";
export type {
  AgentTemporaryWorkbench,
  AgentTemporaryWorkbenchReference,
  AgentTemporaryWorkbenchSource,
} from "./temporary-workbench-contract";

export const HOMEPAGE_WORKBENCH_TOOL_NAME = "homepage_workbench";

const inputSchema = z.object({
  title: z.string().trim().min(1).max(80).describe("工作台标题。"),
  html: z.string().trim().min(1).max(12000).describe(
    "受控 HTML。必须包含 wb-grid/wb-grid-2/wb-grid-3 布局及至少两个 wb-card/wb-stat/wb-item/wb-button 内容单元；只用允许的标签、内置 wb-* 类和思源跳转属性。",
  ),
}).strict();

export function collectTemporaryWorkbenches(entries: readonly ToolResultEntry[]): AgentTemporaryWorkbench[] {
  const workbenches = new Map<string, AgentTemporaryWorkbench>();
  for (const entry of entries) {
    if (entry.toolName !== HOMEPAGE_WORKBENCH_TOOL_NAME
      || (entry.kind !== "tool_executed" && entry.kind !== "tool_observation")) continue;
    const parsed = temporaryWorkbenchManifestSchema.safeParse(entry.content);
    if (parsed.success) workbenches.set(parsed.data.id, parsed.data);
  }
  return [...workbenches.values()];
}

export function createHomepageWorkbenchTool(
  source: AgentTemporaryWorkbenchSource,
): ToolContract<z.infer<typeof inputSchema>, AgentTemporaryWorkbench> {
  return {
    name: HOMEPAGE_WORKBENCH_TOOL_NAME,
    title: "临时工作台",
    description: "把本轮已读取的真实数据排成统一临时工作台。先完成必要读取，再自由组合受控 HTML 与内置 wb-* 视觉类；不得补造事实。",
    inputSchema,
    outputSchema: temporaryWorkbenchManifestSchema,
    readOnly: true,
    safety: { readOnly: true, riskLevel: "low" },
    source: "builtin",
    providerVisible: true,
    boundary: "只渲染统一仓库中的临时界面；禁止脚本、样式、外链、表单和写操作。仅 button 上的 data-siyuan-doc-id/data-siyuan-block-id 可导航到思源内容。",
    inputHint: "直接传 title 与 html，不要包 action/args。工作台不是文章：先用 wb-grid-* 排版，再把数据做成至少两个 wb-card/wb-stat/wb-item/wb-button。已有真实 docId 时可生成跳转按钮。",
    availability: () => ({ available: true }),
    async execute(_ctx, args) {
      const html = sanitizeTemporaryWorkbenchHtml(args.html);
      if (!html) {
        return {
          ok: false,
          data: null,
          error: { code: "workbench_html_empty", message: "工作台 HTML 清理后为空。", recoverable: true },
        };
      }
      if (!hasTemporaryWorkbenchLayout(html)) {
        return {
          ok: false,
          data: null,
          error: {
            code: "workbench_layout_missing",
            message: "临时工作台不能只是文章；请使用 wb-grid-*，并生成至少两个卡片、统计、列表项或操作按钮。",
            recoverable: true,
          },
        };
      }
      const now = Date.now();
      const workbench: AgentTemporaryWorkbench = {
        schemaVersion: 1,
        id: `workbench-${now}-${Math.random().toString(36).slice(2, 9)}`,
        title: args.title,
        html,
        createdAt: now,
      };
      await saveTemporaryWorkbench(workbench, source);
      return {
        ok: true,
        data: workbench,
      };
    },
    summarizeResult: (result) => result.ok ? "临时工作台已生成。" : "临时工作台生成失败。",
  };
}
