/**
 * System tool: final_answer — ends the current turn.
 * final_answer is the system action behind the answer protocol.
 * NOT listed in the ordinary Planner tool manifest.
 * NOT written to the ordinary ObservationLog.
 */

import { z } from "zod";
import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";

const INPUT_SCHEMA = z.object({
  body: z.string().min(1, "body must be a non-empty string").max(2000, "body 建议保持短文本，不超过 2000 字符"),
  references: z.array(z.object({
    sourceType: z.enum(["siyuan_doc", "web_page", "file", "mcp_resource", "api_result"]).optional(),
    docId: z.string().optional(),
    blockId: z.string().optional(),
    url: z.string().optional(),
    fileId: z.string().optional(),
    resourceId: z.string().optional(),
    title: z.string().optional(),
    sourceName: z.string().optional(),
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
    inputHint: 'body（必填，短草稿/回答意图/要点，建议 1-3 句，保持短文本，不超过 2000 字符，不写 Markdown 长文，不写多级列表；最终用户可见文本将由 composer 根据草稿和当前轮证据正文合成）。references（可选，默认 []）。references 是"最终回答实际使用的直接证据来源清单"：1) 如果最终回答直接使用了某个已读取正文来源（本地文档或网页），必须把它列入 references；2) 读过但最终没用的资料不要列；3) 搜索结果只是候选线索，不可引用；4) 没有直接来源时使用 []；5) 不要为了显示参考而凑来源。网页引用使用 {"sourceType":"web_page","url":"...","title":"..."}；只有 web_read_page 读取过的 URL 可作为网页参考；web_search 候选不能直接引用。本地文档引用使用 {"sourceType":"siyuan_doc","docId":"...","title":"..."}。底部"参考资料"只显示你在 references 中显式列出的资源；系统不会自动追加任何 observation 结果。如果你没写 references，底部参考资料为空。stageSummary（可选，阶段摘要对象，格式为 {"summary":"..."}，summary 最多 1500 字，仅当上一个阶段摘要之后的对话已积累对后续有帮助的信息时才填写，默认不要写，不显示给用户，仅用于当前会话上下文压缩边界）。不要编造 docId、blockId、title、url。未真实出现或未 grounded 的 ID 会被系统丢弃。stageSummary 不得记录工具 observation 原文、ToolDispatch、ToolResult、workbenchEvents、debug trace、full prompt、internal path、realPath 或工具返回正文。普通回答示例：{"body":"根据资料显示...","references":[{"sourceType":"siyuan_doc","docId":"xxx","blockId":"xxx","title":"文档标题"}]}。不需要引用时示例：{"body":"...","references":[]}。需要阶段摘要时示例：{"body":"...","references":[],"stageSummary":{"summary":"这段对话涉及...，主要结论为...，后续可参考..."}}',
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
