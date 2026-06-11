import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  replaceDocContentInputSchema,
  replaceDocContentOutputSchema,
} from "./contracts/replace-doc-content.contract";
import type { ReplaceDocContentInput, ReplaceDocContentOutput } from "./contracts/replace-doc-content.contract";
import { replaceDocContentInputJsonSchemaOverride } from "./contracts/replace-doc-content.contract";

export interface ReplaceDocContentDeps {
  executeReplaceDocContent(args: ReplaceDocContentInput): Promise<{ output: ReplaceDocContentOutput }>;
}

export function createReplaceDocContentTool(deps: ReplaceDocContentDeps): ToolContract<ReplaceDocContentInput, ReplaceDocContentOutput> {
  return {
    name: "replace_doc_content",
    title: "替换文档正文",
    description:
      "替换指定文档的整篇正文 Markdown 内容，并返回操作结果。",
    inputSchema: replaceDocContentInputSchema,
    outputSchema: replaceDocContentOutputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    source: "builtin",
    inputHint: "docId（目标文档 ID），markdown（替换后的 Markdown 正文，允许空字符串）",
    boundary: "只能替换明确给出的真实 docId 对应文档的正文内容。不编造 ID。",
    plannerVisible: true,
    inputJsonSchemaOverride: replaceDocContentInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ReplaceDocContentInput): Promise<ToolResult<ReplaceDocContentOutput>> {
      try {
        const result = await deps.executeReplaceDocContent(args);
        return { ok: true, data: result.output };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          data: null,
          error: {
            code: "tool_internal_error",
            message: `文档正文替换失败：${message}`,
            recoverable: true,
            hint: "请检查 docId 是否有效。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ReplaceDocContentOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "文档正文替换失败。";
      }
      const data = result.data;
      if (data.status === "success") {
        return "文档正文已替换。";
      }
      if (data.status === "rejected") {
        return "用户已拒绝操作。";
      }
      return `文档正文未替换：${data.message}`;
    },
  };
}
