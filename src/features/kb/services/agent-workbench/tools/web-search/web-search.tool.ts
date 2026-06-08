/**
 * web_search Tool — search the web via a configured provider.
 * Pure factory function. No side effects at module level.
 */

import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  webSearchInputSchema,
  webSearchOutputSchema,
  webSearchInputJsonSchemaOverride,
} from "./contracts/web-search.contract";
import type { WebSearchInput, WebSearchOutput } from "./contracts/web-search.contract";
import type { WebSearchProvider } from "./web-search-provider";

export interface WebSearchDeps {
  getProvider(): WebSearchProvider;
  maxResults: number;
  timeoutMs: number;
}

export function createWebSearchTool(deps: WebSearchDeps): ToolContract<WebSearchInput, WebSearchOutput> {
  return {
    name: "web_search",
    title: "联网搜索",
    description: "根据关键词搜索公开网络信息。返回候选结果列表，每项包含标题、URL、摘要和来源。搜索结果只是候选线索，不是正文证据。",
    inputSchema: webSearchInputSchema,
    outputSchema: webSearchOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "query（必填，搜索关键词），limit（可选，返回条数，1-10，默认5）。",
    boundary: "只返回搜索候选，不读取完整网页正文。搜索结果只是候选，不可作为最终引用依据。",
    plannerVisible: true,
    inputJsonSchemaOverride: webSearchInputJsonSchemaOverride,

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: WebSearchInput): Promise<ToolResult<WebSearchOutput>> {
      const provider = deps.getProvider();
      const limit = Math.min(args.limit ?? 5, deps.maxResults, 10);

      try {
        const results = await provider.search({
          query: args.query,
          maxResults: limit,
          timeoutMs: deps.timeoutMs,
        });

        return {
          ok: true,
          data: {
            results,
            totalReturned: results.length,
            fetchedAt: new Date().toISOString(),
            note: results.length === 0
              ? "搜索未返回结果。请尝试更具体的查询词。"
              : `搜索返回 ${results.length} 个候选。搜索结果只是候选，不代表已读取网页正文；如需详细内容应使用 web_read_page。`,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as { code?: string }).code ?? "tool_execution_error";
        const recoverable = code === "proxy_empty_response" || code === "config_missing";
        return {
          ok: false,
          data: null,
          error: {
            code,
            message: msg,
            recoverable,
            hint: recoverable
              ? "联网搜索不可用，请检查网络连接或搜索服务配置。"
              : "联网搜索执行异常，请稍后重试。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<WebSearchOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "联网搜索失败。";
      }
      return `联网搜索返回 ${result.data.totalReturned} 个候选。`;
    },
  };
}
