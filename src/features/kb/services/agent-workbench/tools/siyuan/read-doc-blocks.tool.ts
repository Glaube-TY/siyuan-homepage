import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  readDocBlocksInputSchema,
  readDocBlocksOutputSchema,
} from "./contracts/read-doc-blocks.contract";
import type {
  ReadDocBlocksInput,
  ReadDocBlocksOutput,
} from "./contracts/read-doc-blocks.contract";
import { readDocBlocksInputJsonSchemaOverride } from "./contracts/read-doc-blocks.contract";

export interface ReadDocBlocksDeps {
  executeReadDocBlocks(args: ReadDocBlocksInput): Promise<{ safeOutput: ReadDocBlocksOutput }>;
}

export function createReadDocBlocksTool(deps: ReadDocBlocksDeps): ToolContract<ReadDocBlocksInput, ReadDocBlocksOutput> {
  return {
    name: "read_doc_blocks",
    title: "读取文档块",
    description: "按块读取文档内容。支持读取自身、直接子块、文档顶层块或同层邻近块窗口。",
    inputSchema: readDocBlocksInputSchema,
    outputSchema: readDocBlocksOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "targetId（块或文档 ID），scope（self/children/siblings_window/document_top），before/after（siblings_window 时前后条数，0-20），maxBlocks（最大块数，1-50，默认20），maxChars（最大字符数，1-30000，默认8000）",
    boundary: "只能读取已经明确给出的真实 docId/blockId。不编造 ID。只读，不修改文档或块。",
    plannerVisible: true,
    inputJsonSchemaOverride: readDocBlocksInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ReadDocBlocksInput): Promise<ToolResult<ReadDocBlocksOutput>> {
      try {
        const result = await deps.executeReadDocBlocks(args);
        return { ok: true, data: result.safeOutput };
      } catch {
        return {
          ok: false, data: null,
          error: {
            code: "tool_internal_error",
            message: "读取文档块执行异常。",
            recoverable: true,
            hint: "请检查 targetId 是否有效。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ReadDocBlocksOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "读取失败。";
      }
      const data = result.data;
      return `已读取文档块 ${data.items.length} 条${data.truncated ? "（已截断）" : ""}。`;
    },
  };
}
