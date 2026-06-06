import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  readDocsInputSchema,
  readDocsOutputSchema,
} from "./contracts/read-docs.contract";
import type {
  ReadDocsInput,
  ReadDocsOutput,
} from "./contracts/read-docs.contract";

export { readDocsInputSchema, readDocsOutputSchema } from "./contracts/read-docs.contract";
export type {
  ReadDocsItem,
  ReadDocsError,
  ReadDocsInput,
  ReadDocsOutput,
} from "./contracts/read-docs.contract";

export interface ReadDocsDeps {
  executeReadDocs(args: ReadDocsInput): Promise<{ safeOutput: ReadDocsOutput }>;
}

export function createReadDocsTool(deps: ReadDocsDeps): ToolContract<ReadDocsInput, ReadDocsOutput> {
  return {
    name: "read_docs",
    title: "读取文档",
    description: "根据 docId、blockId 或 cursor 读取文档/块正文内容。",
    inputSchema: readDocsInputSchema,
    outputSchema: readDocsOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "docIds（字符串数组）或 blockIds（字符串数组），至少提供一个；或使用 cursor 继续读取同一文档（互斥，不可同时传）。maxChars 可限制每篇返回字数。",
    boundary: "只读取显式传入的 docId/blockId/cursor，不自动继续读，不自动换 ID。失败时区分 resource_not_found、empty_content、container_without_content、invalid_resource_id、out_of_scope。",
    plannerVisible: true,

    // Explicit override: z.refine with mutually exclusive cursor constraint
    // cannot be expressed by auto-conversion. Root is type: "object" with
    // properties for all params; oneOf expresses cursor-vs-IDs exclusion.
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        docIds: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 256 },
          minItems: 1,
          maxItems: 20,
        },
        blockIds: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 256 },
          minItems: 1,
          maxItems: 20,
        },
        cursor: { type: "string", minLength: 1, maxLength: 240 },
        maxChars: { type: "integer", minimum: 2000, maximum: 100000 },
      },
      additionalProperties: false,
      oneOf: [
        {
          required: ["cursor"],
          not: { anyOf: [{ required: ["docIds"] }, { required: ["blockIds"] }] },
        },
        {
          anyOf: [{ required: ["docIds"] }, { required: ["blockIds"] }],
          not: { required: ["cursor"] },
        },
      ],
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ReadDocsInput): Promise<ToolResult<ReadDocsOutput>> {
      try {
        const result = await deps.executeReadDocs(args);
        return { ok: true, data: result.safeOutput };
      } catch {
        return {
          ok: false, data: null,
          error: {
            code: "tool_internal_error",
            message: "读取文档执行异常。",
            recoverable: true,
            hint: "请检查 docId/blockId 或 cursor 是否有效。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ReadDocsOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "读取失败。";
      }
      const data = result.data;
      if (data.items.length > 0) {
        let summary = `已读取 ${data.items.length} 条片段`;
        if (data.errors && data.errors.length > 0) {
          summary += `，另有 ${data.errors.length} 个问题`;
        }
        return summary + "。";
      }
      // 0 items with errors: show error details
      if (data.errors && data.errors.length > 0) {
        const first = data.errors[0];
        return `未读取到正文：${first.code ?? "unknown"} / ${first.message ?? "无详情"}`;
      }
      return "未读取到正文：未提供有效 docId/blockId。";
    },
  };
}
