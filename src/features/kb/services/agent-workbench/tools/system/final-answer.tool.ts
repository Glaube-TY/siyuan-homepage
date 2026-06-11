/**
 * System tool: final_answer — ends the current turn.
 * final_answer is the system action behind the answer protocol.
 * NOT listed in the ordinary Planner tool manifest.
 * NOT written to the ordinary ObservationLog.
 */

import { z } from "zod";
import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";

const INPUT_SCHEMA = z.object({
  body: z.string().min(1, "body must be a non-empty string").max(20000, "body 安全上限 20000 字符"),
  references: z.array(z.unknown()).optional().default([]),
  stageSummary: z.object({
    summary: z.string().trim().min(1).max(1500),
  }).strict().optional(),
}).strict();

type FinalAnswerArgs = z.infer<typeof INPUT_SCHEMA>;
type FinalAnswerData = {
  body: string;
  references: unknown[];
  stageSummary?: { summary: string };
};

export function createFinalAnswerTool(): ToolContract<FinalAnswerArgs, FinalAnswerData> {
  return {
    name: "final_answer",
    title: "最终回答",
    description: "根据已获得的信息向用户提供最终回答并结束本轮。",
    inputSchema: INPUT_SCHEMA,
    readOnly: true,
    safety: { readOnly: true },
    source: "system",
    inputHint: 'body（必填，最终用户可见回答正文。内容风格、结构、长短、是否使用 Markdown、列表或表格由你自主决定）。references（可选，JSON 数组，默认 []，列出最终回答实际使用的直接来源）。本地文档引用示例：{"sourceType":"siyuan_doc","docId":"...","title":"..."}。网页引用示例：{"sourceType":"web_page","url":"...","title":"..."}。没有直接来源时使用 []。stageSummary（可选，阶段摘要对象，格式为 {"summary":"..."}，最多 1500 字）。',
    boundary: "如果是正文总结、分析、比较，应基于阅读工具返回的正文。如果只是结构或候选发现，应在回答中说明尚未读取正文。references 只是来源展示，不是证据门槛。",
    plannerVisible: false,

    availability(_ctx: ToolRuntimeContext) {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: FinalAnswerArgs): Promise<ToolResult<FinalAnswerData>> {
      return {
        ok: true,
        data: {
          body: args.body,
          references: args.references ?? [],
          stageSummary: args.stageSummary,
        },
      };
    },

    summarizeResult(result: ToolResult<FinalAnswerData>): string {
      if (!result.ok || !result.data) {
        return "最终回答生成失败。";
      }
      return `已生成回答（${result.data.body.length} 字符）${result.data.references.length > 0 ? `，引用 ${result.data.references.length} 个来源` : ""}。`;
    },
  };
}
