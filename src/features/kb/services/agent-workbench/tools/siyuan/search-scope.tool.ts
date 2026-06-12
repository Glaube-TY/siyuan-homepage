import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  searchScopeInputSchema,
  searchScopeOutputSchema,
} from "./contracts/search-scope.contract";
import type {
  SearchScopeInput,
  SearchScopeOutput,
} from "./contracts/search-scope.contract";

export { searchScopeInputSchema } from "./contracts/search-scope.contract";
export type {
  SearchCandidate,
  SearchScopeInput,
  SearchScopeOutput,
} from "./contracts/search-scope.contract";

export interface SearchScopeDeps {
  executeSearchScope(args: SearchScopeInput): Promise<{ safeOutput: SearchScopeOutput }>;
}

export function createSearchScopeTool(deps: SearchScopeDeps): ToolContract<SearchScopeInput, SearchScopeOutput> {
  return {
    name: "search_scope",
    title: "搜索知识库",
    description: "根据关键词查找候选结果。返回候选列表，每项包含 docId、标题、预览、命中位置和匹配原因。检索范围由聊天框当前知识库范围限定。搜索结果只是候选线索，不是正文证据。",
    inputSchema: searchScopeInputSchema,
    outputSchema: searchScopeOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "query（必填，搜索关键词），limit（可选，1-50，默认20）。",
    boundary: "只返回候选列表，不读取文档正文。不自动过滤或者修改结果。检索范围由聊天框当前知识库范围限定。",
    providerVisible: true,

    // search_scope has a simple schema; z.toJSONSchema handles it fine
    // but we provide an override for stability around optional+default semantics
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 500 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      required: ["query"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: SearchScopeInput): Promise<ToolResult<SearchScopeOutput>> {
      try {
        const result = await deps.executeSearchScope(args);
        return { ok: true, data: result.safeOutput };
      } catch {
        return {
          ok: false, data: null,
          error: {
            code: "tool_internal_error",
            message: "搜索执行异常。",
            recoverable: true,
            hint: "请检查查询词是否合理后重试。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<SearchScopeOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "搜索失败。";
      }
      const data = result.data;
      const count = data.returnedCandidateCount ?? data.candidates.length;
      return `搜索 "${data.query}" 返回 ${count} 个候选。`;
    },
  };
}
