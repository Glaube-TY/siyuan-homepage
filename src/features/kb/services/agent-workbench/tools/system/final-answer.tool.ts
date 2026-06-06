/**
 * System tool: final_answer — ends the current turn.
 * final_answer is the system action behind the answer protocol.
 * NOT listed in the ordinary Planner tool manifest.
 * NOT written to the ordinary ObservationLog.
 */

import { z } from "zod";
import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";

const INPUT_SCHEMA = z.object({
  body: z.string().min(1, "body must be a non-empty string"),
  references: z.array(z.object({
    sourceType: z.enum(["siyuan_doc", "web_page", "file", "mcp_resource", "api_result"]).optional(),
    docId: z.string().optional(),
    blockId: z.string().optional(),
    url: z.string().optional(),
    fileId: z.string().optional(),
    resourceId: z.string().optional(),
    title: z.string().optional(),
    provider: z.string().optional(),
  }).strict()).optional().default([]),
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
    inputHint: '普通回答默认不带 stageSummary，需要历史摘要时才带。body（必填，回答正文）；references（可选，来源引用数组）；stageSummary（可选，阶段摘要对象，格式为 {"summary":"..."}，summary 最多 1500 字，仅当上一个阶段摘要之后的对话已积累对后续有帮助的信息时才填写，默认不要写，不显示给用户，仅用于当前会话上下文压缩边界）。references 只能引用：1) 本轮工具 observation 中真实返回过的资源 ID；2) 历史对话上下文中 grounded:true 的 reference。不要编造 docId、blockId、title。未真实出现或未 grounded 的 ID 会被系统丢弃。底部"参考资料"只显示你在 references 中显式列出的资源；系统不会自动追加 structure_result、search_candidate 或 read_content。如果你没写 references，底部参考资料为空。stageSummary 不得记录工具 observation 原文、ToolDispatch、ToolResult、workbenchEvents、debug trace、full prompt、internal path、realPath 或工具返回正文。普通回答示例：{"body":"根据资料显示...","references":[{"sourceType":"siyuan_doc","docId":"xxx","blockId":"xxx","title":"文档标题"}]}。需要阶段摘要时示例：{"body":"...","references":[],"stageSummary":{"summary":"这段对话中确定了...，后续需要注意..."}}',
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
