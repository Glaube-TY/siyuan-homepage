/**
 * System tool: progress_answer。全局 system tool，不属于任何 Skill。
 * 执行后不终止 Agent loop。
 */

import { z } from "zod";
import type {
  ToolContract,
  ToolResult,
  ToolObservation,
  ToolRuntimeContext,
} from "../../../workbench/contracts/tool-contract";

const PROGRESS_ANSWER_INPUT_SCHEMA = z.object({
  body: z.string().min(1, "body must be a non-empty string"),
});

const PROGRESS_ANSWER_OUTPUT_SCHEMA = z.object({
  body: z.string(),
  kind: z.literal("progress"),
});

export function createProgressAnswerTool(): ToolContract {
  return {
    name: "progress_answer",
    title: "进展回答",
    description: "向用户展示阶段性进展，不结束当前回合；调用后由 Planner 自主决定工具调用或最终回答。仅在需要可见进度、较长等待或阶段状态时使用；不要把 progress_answer 当作任务完成。",
    capability: "展示进展但不结束当前回合。",
    inputSchema: PROGRESS_ANSWER_INPUT_SCHEMA,
    outputSchema: PROGRESS_ANSWER_OUTPUT_SCHEMA,
    outputKind: "progress",
    source: "system",
    safety: { readOnly: true },
    boundary: "不结束 Agent 回合，不读取资料，不决定下一步业务动作，不替代 final_answer。",
    budgetCategory: "none",

    availability(_ctx: ToolRuntimeContext) {
      return { available: true };
    },

    async execute(args: unknown, _ctx: ToolRuntimeContext): Promise<ToolResult> {
      const parsed = PROGRESS_ANSWER_INPUT_SCHEMA.parse(args);
      return {
        ok: true,
        outputKind: "progress",
        data: {
          body: parsed.body,
          kind: "progress" as const,
        },
      };
    },

    observationFormatter(result: ToolResult, _ctx: ToolRuntimeContext): ToolObservation {
      return {
        toolName: "progress_answer",
        ok: result.ok,
        outputKind: "progress",
        facts: {},
        summary: "进展信息已展示给用户。",
      };
    },
  };
}
