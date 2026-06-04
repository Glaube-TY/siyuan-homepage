import type {
  PlannerVisibleSearchCandidate,
  ToolAvailability,
  ToolContract,
  ToolObservation,
  ToolResult,
  ToolRuntimeContext,
} from "../../../../workbench/contracts/tool-contract";
import { extractErrorFacts } from "../../../../workbench/contracts/tool-contract";
import type { KbRetrievalToolDeps } from "../adapters/kb-retrieval-tool-deps";
import { executeSearchScope } from "../adapters/search-scope.adapter";
import {
  searchScopeInputSchema,
  searchScopeOutputSchema,
} from "../schemas/search-scope.schema";

export function createSearchScopeTool(deps: KbRetrievalToolDeps): ToolContract {
  return {
    name: "search_scope",
    title: "搜索范围",
    description:
      "根据关键词在当前知识库范围内查找候选文档。返回候选列表，每项包含 docId、标题、预览、命中位置和匹配原因。搜索结果只是候选，不等于已读取正文。",
    capability:
      "用关键词查找可能相关的文档。返回 docId、title、preview、hpath、matchReason 等字段。docId 可直接传给 read_candidate_docs 读取正文。",
    inputSchema: searchScopeInputSchema,
    outputSchema: searchScopeOutputSchema,
    outputKind: "candidates",
    safety: { readOnly: true },
    boundary:
      "只返回候选列表，不读取文档正文，不自动过滤，不自动排序修改结果。不返回内部标识。",
    source: "builtin",
    inputHint:
      "query（字符串，必填，搜索关键词），limit（数字，可选，最多返回多少候选）。",
    budgetCategory: "search",

    availability(_ctx: ToolRuntimeContext): ToolAvailability {
      const scope = deps.getScope();
      if (!scope) {
        return {
          available: false,
          reasonCode: "prerequisite_missing",
          hint: "当前知识范围不可用。",
        };
      }
      if (scope.type === "current_doc" || scope.type === "custom_docs") {
        return {
          available: false,
          reasonCode: "prerequisite_missing",
          hint: "当前知识范围不支持全库搜索。",
        };
      }
      return { available: true };
    },

    async execute(args: unknown, _ctx: ToolRuntimeContext): Promise<ToolResult> {
      const scope = deps.getScope();
      if (!scope) {
        return {
          ok: false,
          outputKind: "candidates",
          data: null,
          error: {
            errorCode: "scope_missing",
            message: "当前知识范围不可用，无法执行搜索。",
            recoverable: false,
            hint: "请确认当前作用域已正确初始化。",
          },
        };
      }

      const parsed = searchScopeInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          outputKind: "candidates",
          data: null,
          error: {
            errorCode: "invalid_args",
            message: "搜索参数格式不正确。",
            recoverable: true,
            field: "query",
            expected: "query 必须为非空字符串，limit 为正整数（可选）。",
            hint: "请提供有效的查询文本，例如：query: 'TypeScript 类型系统'",
          },
        };
      }

      try {
        const result = await executeSearchScope(deps, parsed.data);

        try {
          searchScopeOutputSchema.parse(result.safeOutput);
        } catch {
          return {
            ok: false,
            outputKind: "candidates",
            data: null,
            error: {
              errorCode: "tool_internal_error",
              message: "搜索结果输出格式校验失败。",
              recoverable: false,
              hint: "请换用其他查询词重试。",
            },
          };
        }

        return {
          ok: true,
          outputKind: "candidates",
          data: result.safeOutput,
        };
      } catch {
        return {
          ok: false,
          outputKind: "candidates",
          data: null,
          error: {
            errorCode: "tool_internal_error",
            message: "搜索执行异常。",
            recoverable: true,
            hint: "请检查查询词是否合理，或换用知识图谱/范围文档列表工具。",
          },
        };
      }
    },

    observationFormatter(result: ToolResult, _ctx: ToolRuntimeContext): ToolObservation {
      if (!result.ok) {
        const errorFacts = extractErrorFacts(result);
        return {
          toolName: "search_scope",
          ok: false,
          outputKind: "candidates",
          facts: {
            errorCode: errorFacts.errorCode,
            errorMessage: errorFacts.errorMessage,
            errorHint: errorFacts.errorHint,
            errorRecoverable: errorFacts.errorRecoverable,
          },
          summary: errorFacts.errorMessage ?? "搜索结果加载失败。",
        };
      }

      const data = result.data as {
        candidates: PlannerVisibleSearchCandidate[];
        hitCount: number;
        candidateDocCount: number;
        returnedCandidateCount: number;
        truncated: boolean;
      };

      const topCandidates = (data.candidates ?? []).slice(0, 3);
      const topSummaries = topCandidates.map((c) => {
        const isWeakTitle = !c.title || /^未命名|untitled|无标题|new doc$/i.test(c.title.trim());
        if (isWeakTitle && c.preview) {
          return `${c.preview.slice(0, 40)}${c.preview.length > 40 ? "…" : ""}`;
        }
        return c.title || "（无标题）";
      }).join("、");

      return {
        toolName: "search_scope",
        ok: true,
        outputKind: "candidates",
        facts: {
          hits: data.hitCount,
          candidateDocCount: data.candidateDocCount,
          returnedCandidateCount: data.returnedCandidateCount,
          isZeroHits: data.returnedCandidateCount === 0,
        },
        summary: data.returnedCandidateCount === 0
          ? "当前检索词未命中。"
          : `搜索返回 ${data.returnedCandidateCount} 个候选。${topSummaries ? `前几个：${topSummaries}。` : ""}搜索结果只是候选，不代表已读取正文。`,
        content: {
          type: "search_results" as const,
          candidates: data.candidates.map((c) => ({
            rank: c.rank,
            docId: c.docId,
            title: c.title,
            preview: c.preview,
            hpath: c.hpath,
            hitType: c.hitType,
            matchReason: c.matchReason,
            matchedFields: c.matchedFields,
            tags: c.tags,
            notebookId: c.notebookId,
            blockId: c.blockId,
          })),
        },
      };
    },
  };
}
