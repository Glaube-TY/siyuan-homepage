/**
 * read_candidate_docs Tool — search then read candidate documents.
 * Combines search_scope and read_docs into one orchestrated step.
 * Returns search candidates with their document content pre-loaded.
 */
import { z } from "zod";
import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";

export const readCandidateDocsInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(10).optional().default(5),
  maxCharsPerDoc: z.number().int().min(1000).max(50000).optional().default(8000),
}).strict();

export type ReadCandidateDocsInput = z.infer<typeof readCandidateDocsInputSchema>;

export interface ReadCandidateDocsItem {
  docId: string;
  title: string;
  preview: string;
  content: string;
  contentChars: number;
  truncated: boolean;
  matchReason?: string;
}

export interface ReadCandidateDocsOutput {
  query: string;
  candidates: ReadCandidateDocsItem[];
  totalFound: number;
  returned: number;
  note: string;
}

export interface ReadCandidateDocsDeps {
  executeSearch(args: { query: string; limit: number }): Promise<{
    candidates: Array<{ docId: string; title: string; preview?: string; matchReason?: string }>;
    hitCount?: number;
  }>;
  executeRead(args: { docIds: string[]; maxChars: number }): Promise<{
    items: Array<{ docId: string; title: string; content: string; contentChars: number; truncated?: boolean }>;
  }>;
}

export function createReadCandidateDocsTool(deps: ReadCandidateDocsDeps): ToolContract<ReadCandidateDocsInput, ReadCandidateDocsOutput> {
  return {
    name: "read_candidate_docs",
    title: "搜索并读取候选文档",
    description: "根据关键词搜索候选文档，并直接读取搜索结果中文档的正文内容。搜索+读取合并为一步。适用于先搜索再立即读取的场景。",
    inputSchema: readCandidateDocsInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "query（必填，搜索关键词），limit（可选，1-10，默认5），maxCharsPerDoc（可选，每篇最大字符数）。",
    boundary: "搜索范围由聊天框当前知识库范围限定。只读，不修改文档。",
    providerVisible: true,

    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 500 },
        limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
        maxCharsPerDoc: { type: "integer", minimum: 1000, maximum: 50000, default: 8000 },
      },
      required: ["query"],
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ReadCandidateDocsInput): Promise<ToolResult<ReadCandidateDocsOutput>> {
      try {
        const searchResult = await deps.executeSearch({
          query: args.query,
          limit: args.limit,
        });

        if (searchResult.candidates.length === 0) {
          return {
            ok: true,
            data: {
              query: args.query,
              candidates: [],
              totalFound: 0,
              returned: 0,
              note: "搜索未找到候选文档。",
            },
          };
        }

        const docIds = searchResult.candidates.map((c) => c.docId);
        const readResult = await deps.executeRead({
          docIds,
          maxChars: args.maxCharsPerDoc,
        });

        const readMap = new Map(readResult.items.map((item) => [item.docId, item]));
        const candidates: ReadCandidateDocsItem[] = searchResult.candidates.map((c) => {
          const read = readMap.get(c.docId);
          return {
            docId: c.docId,
            title: c.title,
            preview: c.preview ?? "",
            content: read?.content ?? "",
            contentChars: read?.contentChars ?? 0,
            truncated: read?.truncated ?? false,
            matchReason: c.matchReason,
          };
        });

        return {
          ok: true,
          data: {
            query: args.query,
            candidates,
            totalFound: searchResult.hitCount ?? searchResult.candidates.length,
            returned: candidates.length,
            note: `搜索并读取了 ${candidates.length} 篇候选文档。`,
          },
        };
      } catch (err) {
        return {
          ok: false, data: null,
          error: {
            code: "tool_internal_error",
            message: err instanceof Error ? err.message : "搜索读取执行异常。",
            recoverable: true,
            hint: "请检查查询词是否合理后重试。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ReadCandidateDocsOutput>): string {
      if (!result.ok || !result.data) return result.error?.message ?? "搜索读取失败。";
      return `搜索 "${result.data.query}" 并读取了 ${result.data.returned} 篇文档。`;
    },
  };
}
