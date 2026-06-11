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

import { readDocsInputJsonSchemaOverride } from "./contracts/read-docs.contract";

export function createReadDocsTool(deps: ReadDocsDeps): ToolContract<ReadDocsInput, ReadDocsOutput> {
  return {
    name: "read_docs",
    title: "读取文档",
    description: "根据 docId、blockId 读取文档/块正文内容。支持分块返回，按 chunkIndex 返回指定块并告知总块数。内容较长时可通过 chunkIndex 继续读取。",
    inputSchema: readDocsInputSchema,
    outputSchema: readDocsOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "docIds（字符串数组）或 blockIds（字符串数组），至少提供一个。长文继续读取时使用 chunkIndex（可选，默认1）/ chunkChars（可选，默认12000）/ chunkCount。",
    boundary: "只能读取已经明确给出的真实 docId/blockId/cursor。docId/blockId 必须来自用户显式附加、历史 grounded reference 或本轮工具返回。本工具只读取已明确资源 ID 对应的正文；不负责查询、搜索、定位、推断资源 ID 或生成候选资源。不自动继续读，不自动换 ID。失败时区分 resource_not_found、empty_content、container_without_content、invalid_resource_id。",

    plannerVisible: true,
    inputJsonSchemaOverride: readDocsInputJsonSchemaOverride,

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
        const parts: string[] = [`已读取 ${data.items.length} 条片段`];
        const first = data.items[0];
        if (first.chunkCount != null && first.chunkCount > 1) {
          parts.push(`第 ${first.chunkIndex}/${first.chunkCount} 块，当前块 ${first.returnedContentChars ?? first.contentChars} 字符，全文 ${first.fullContentChars} 字符`);
          if (first.hasNextChunk) {
            parts.push("后续块存在，返回值中包含继续读取所需的分页信息");
          }
        }
        if (data.errors && data.errors.length > 0) {
          parts.push(`另有 ${data.errors.length} 个问题`);
        }
        return parts.join("，") + "。";
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
