import { z } from "zod";
import type {
  ToolContract,
  ToolResult,
  ToolRuntimeContext,
  ToolObservation,
} from "../../../workbench/contracts/tool-contract";

/**
 * 资源引用 schema：直接暴露真实资源 ID。
 * - 整篇文档引用：sourceType="siyuan_doc" + docId（不传 blockId）
 * - 具体片段引用：sourceType="siyuan_doc" + docId + blockId
 * - 网页引用：sourceType="web_page" + url
 * - 文件引用：sourceType="file" + fileId
 * - blockId 始终 optional，不强制出现
 */
const RESOURCE_REF_SCHEMA = z.object({
  sourceType: z.enum(["siyuan_doc", "web_page", "file", "mcp_resource", "api_result"]),
  docId: z.string().optional(),
  blockId: z.string().optional(),
  url: z.string().optional(),
  fileId: z.string().optional(),
  resourceId: z.string().optional(),
  title: z.string().optional(),
  provider: z.string().optional(),
}).strict();

const ANSWER_INPUT_SCHEMA = z.object({
  body: z.string().min(1, "answer body must be a non-empty string"),
  references: z.array(RESOURCE_REF_SCHEMA).optional(),
}).strict();

const ANSWER_OUTPUT_SCHEMA = z.object({
  body: z.string(),
  references: z.array(RESOURCE_REF_SCHEMA).optional(),
}).strict();

export type ResourceRef = z.infer<typeof RESOURCE_REF_SCHEMA>;

export function createFinalAnswerTool(): ToolContract {
  return {
    name: "final_answer",
    title: "最终回答",
    description:
      "向用户输出最终回复，并立即结束当前回合。" +
      "仅在任务已完成、需要澄清、无需继续调用工具，或工具失败后无法继续时使用；如果只是说明接下来要做什么，不要使用 final_answer。" +
      "references 是来源展示，不是证据门槛，不强制附带。" +
      "如果回答基于阅读工具返回的正文，建议在 references 中附上对应 docId 和 title；如果只是结构或候选发现，可以不附引用，但正文中应说明尚未读取正文。",
    capability: "输出最终回复并结束当前回合，可附带结构化资源引用。",
    inputSchema: ANSWER_INPUT_SCHEMA,
    outputSchema: ANSWER_OUTPUT_SCHEMA,
    outputKind: "answer",
    source: "system",
    safety: { readOnly: true },
    boundary: "只承载 Planner 提供的最终回复正文和显式 references；不自动读取资料，不自动生成引用，不决定下一步业务动作。调用后当前回合结束。",
    inputHint: "body（字符串，必填），references（ResourceRef 数组，可选）。references 只展示来源，不是证据门槛。基于正文阅读时建议附 docId+title；仅结构/候选时可不附，但需说明尚未读取正文。",
    budgetCategory: "none",

    availability(_ctx: ToolRuntimeContext) {
      return { available: true };
    },

    async execute(args: unknown, _ctx: ToolRuntimeContext): Promise<ToolResult> {
      const parsed = ANSWER_INPUT_SCHEMA.parse(args);
      return {
        ok: true,
        outputKind: "answer",
        data: {
          body: parsed.body,
          references: parsed.references,
        },
      };
    },

    observationFormatter(result: ToolResult, _ctx: ToolRuntimeContext): ToolObservation {
      if (!result.ok) {
        return {
          toolName: "final_answer",
          ok: false,
          outputKind: "error_only",
          facts: { errorCode: result.errorCode },
          summary: "最终回答生成失败。",
        };
      }
      const data = result.data as { references?: ResourceRef[] } | undefined;
      const refCount = data?.references?.length ?? 0;
      return {
        toolName: "final_answer",
        ok: true,
        outputKind: "answer",
        facts: { referenceCount: refCount },
        summary: refCount > 0
          ? `最终回答已生成，附带了 ${refCount} 个引用。`
          : "最终回答已生成。",
      };
    },
  };
}
