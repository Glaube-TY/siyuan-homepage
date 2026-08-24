import { z } from "zod";
import type { NativeTool, ToolExecutionResult } from "../../../agent-core/tools/native-tool";
import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import type {
  WebSearchOptions,
  WebSearchResponse,
  WebSearchTurnTracker,
} from "./web-search-provider";

export const webSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(4000).describe("生成适合搜索引擎的检索查询，保持用户原意；时效问题必要时包含具体实体、日期或范围。"),
  freshness: z.enum(["realtime", "day", "week", "month", "year", "any"])
    .describe("根据用户语义和当前运行时间选择搜索时效范围；实时或当前信息使用更短范围，稳定知识或明确历史查询可使用 any 或日期范围。由模型填写。"),
  topic: z.enum(["general", "news", "software", "academic", "finance"])
    .describe("根据用户语义选择搜索领域；由模型理解用户语言和上下文后填写。"),
  maxResults: z.number().int().min(1).max(10).optional(),
  includeDomains: z.array(z.string().trim().min(1).max(253)).max(20).optional(),
  excludeDomains: z.array(z.string().trim().min(1).max(253)).max(20).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("可选的包含起始日期，格式为 YYYY-MM-DD。"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("可选的包含结束日期，格式为 YYYY-MM-DD。"),
}).strict();

export type WebSearchToolInput = z.infer<typeof webSearchInputSchema>;

export interface WebSearchToolDeps {
  search(input: WebSearchOptions, ctx: ToolRuntimeContext): Promise<WebSearchResponse>;
  tracker?: WebSearchTurnTracker;
}

export function createWebSearchActionTool(deps: WebSearchToolDeps): ToolContract<WebSearchToolInput, WebSearchResponse> {
  return {
    name: "web_search",
    title: "联网搜索",
    description: "搜索公开网页；模型必须根据语义填写 query、freshness 和 topic。返回的是候选来源，重要事实应继续用 web_fetch.read_page 核验。",
    inputSchema: webSearchInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    boundary: "不接收 Provider 原始参数，不执行远程写入，不返回 API Key；仅返回真实搜索来源。",
    providerVisible: true,
    availability: () => ({ available: true }),
    execute: async (ctx, args) => {
      const response = await deps.search({ ...args, maxResults: args.maxResults ?? 5 }, ctx);
      return webSearchResponseToToolResult(response);
    },
    summarizeResult: (result) => result.ok
      ? `联网搜索完成：${result.data?.results.length ?? 0} 条结果（${result.data?.route ?? "unknown"}/${result.data?.provider ?? "unknown"}）。`
      : `联网搜索失败：${result.error?.code ?? "unknown"}。`,
  };
}

/** Robot Kernel uses this per-turn after the real model/provider is resolved. */
export function createWebSearchNativeTool(deps: WebSearchToolDeps): NativeTool {
  return {
    name: "web_search",
    title: "联网搜索",
    description: "搜索公开网页；模型必须根据语义填写 query、freshness 和 topic。返回候选来源，重要事实应继续读取正文核验。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 4000,
          description: "生成适合搜索引擎的检索查询，保持用户原意；时效问题必要时包含具体实体、日期或范围。",
        },
        freshness: {
          type: "string",
          enum: ["realtime", "day", "week", "month", "year", "any"],
          description: "根据用户语义和当前运行时间选择搜索时效范围；由模型填写。",
        },
        topic: {
          type: "string",
          enum: ["general", "news", "software", "academic", "finance"],
          description: "根据用户语义选择搜索领域；由模型填写。",
        },
        maxResults: { type: "integer", minimum: 1, maximum: 10 },
        includeDomains: { type: "array", items: { type: "string" }, maxItems: 20 },
        excludeDomains: { type: "array", items: { type: "string" }, maxItems: 20 },
        startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "可选的包含起始日期，格式为 YYYY-MM-DD。" },
        endDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "可选的包含结束日期，格式为 YYYY-MM-DD。" },
      },
      required: ["query", "freshness", "topic"],
      additionalProperties: false,
    },
    readOnly: true,
    parallelSafe: true,
    riskLevel: "low",
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: true },
    isReadOnlyCall: () => true,
    preflightValidate: (args) => {
      const parsed = webSearchInputSchema.safeParse(args);
      return parsed.success
        ? { ok: true }
        : { ok: false, error: { code: "invalid_web_search_args", message: "联网搜索参数不符合契约。" } };
    },
    execute: async (args, ctx) => {
      const parsed = webSearchInputSchema.safeParse(args);
      if (!parsed.success) return invalidNativeResult();
      return webSearchResponseToNativeResult(await deps.search({ ...parsed.data, maxResults: parsed.data.maxResults ?? 5 }, ctx));
    },
  };
}

function webSearchResponseToToolResult(response: WebSearchResponse): ToolResult<WebSearchResponse> {
  if (response.results.length > 0) return { ok: true, data: response };
  const failure = response.warnings.find((warning) => [
    "fallback_not_configured",
    "fallback_auth_failed",
    "fallback_failed",
  ].includes(warning));
  const code = failure ?? "search_no_results";
  return {
    ok: false,
    data: response,
    error: {
      code,
      message: failure ? "联网搜索未完成，未返回可用的搜索结果。" : "本次搜索没有获得可用的网页来源。",
      recoverable: true,
    },
  };
}

function webSearchResponseToNativeResult(response: WebSearchResponse): ToolExecutionResult {
  const result = webSearchResponseToToolResult(response);
  const content = JSON.stringify(result.data ?? response);
  return result.ok
    ? {
        ok: true,
        content,
        data: result.data ?? response,
        summary: `联网搜索完成：${response.results.length} 条结果。`,
      }
    : {
        ok: false,
        content,
        data: result.data ?? response,
        summary: "联网搜索未完成。",
        errorCode: result.error?.code,
      };
}

function invalidNativeResult(): ToolExecutionResult {
  return {
    ok: false,
    content: JSON.stringify({ ok: false, errorCode: "invalid_web_search_args" }),
    summary: "联网搜索参数无效。",
    errorCode: "invalid_web_search_args",
  };
}
