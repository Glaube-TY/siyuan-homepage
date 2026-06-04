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
    description: "在当前知识库范围内搜索，返回候选文档资源，每个候选携带 docId。搜索结果仅标识可能相关的文档，不包含文档正文。",
    capability: "返回与查询相关的文档候选，每个候选包含 docId、标题和预览。需要具体内容时，使用返回的 docId 调用 read_candidate_docs。支持按文档标题、标题路径、父级目录名、文档树中的标题文本命中文档候选。",
    inputSchema: searchScopeInputSchema,
    outputSchema: searchScopeOutputSchema,
    outputKind: "candidates",
    safety: { readOnly: true },
    boundary: "不读取文档正文，不暴露内部标识。候选 docId 是 read_candidate_docs 的安全输入。",
    source: "builtin",
    inputHint: "query（字符串，必填），limit（数字，可选）",

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
          ? "当前检索词未命中，可由 Planner 自主换用相关词或查看文档树。"
          : `本次检索返回 ${data.returnedCandidateCount} 个可读取文档资源，包含 docId，可用于 read_candidate_docs。`,
        content: {
          type: "search_results",
          candidates: data.candidates,
          truncated: data.truncated,
        },
      };
    },
  };
}
