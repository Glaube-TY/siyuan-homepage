import type {
  ToolAvailability,
  ToolContract,
  ToolObservation,
  ToolResult,
  ToolRuntimeContext,
} from "../../../../workbench/contracts/tool-contract";
import { extractErrorFacts } from "../../../../workbench/contracts/tool-contract";
import type { KbRetrievalToolDeps } from "../adapters/kb-retrieval-tool-deps";
import { executeReadCandidateDocs } from "../adapters/read-candidate-docs.adapter";
import {
  type PlannerVisibleReadItem,
  readCandidateDocsInputSchema,
  readCandidateDocsOutputSchema,
} from "../schemas/read-candidate-docs.schema";

export function createReadCandidateDocsTool(deps: KbRetrievalToolDeps): ToolContract {
  return {
    name: "read_candidate_docs",
    title: "读取候选文档内容",
    description: "读取 Planner 显式提供的 docId 或 blockId，返回已读取内容。最简单用法：{\"docIds\":[\"...\"]} 或 {\"blockIds\":[\"...\"]}。支持 default/full/range/next 模式；截断时返回 nextCursor。",
    capability: "读取指定 docId/blockId 的文档内容。docId 可来自 search_scope、list_knowledge_map、list_recent_references。",
    inputSchema: readCandidateDocsInputSchema,
    outputSchema: readCandidateDocsOutputSchema,
    outputKind: "content",
    safety: { readOnly: true },
    boundary: "只读取 Planner 显式传入的 docId/blockId/cursor，不自动继续读，不暴露内部标识。",
    source: "builtin",
    inputHint: "docIds（字符串数组，推荐）或 blockIds（字符串数组），readMode（default/full/range/next），cursor（next 模式必填），startOffset（range 可选），maxCharsPerDoc（2000-100000）",

    availability(_ctx: ToolRuntimeContext): ToolAvailability {
      if (!deps.getScope()) {
        return {
          available: false,
          reasonCode: "prerequisite_missing",
          hint: "当前知识范围不可用。",
        };
      }
      return { available: true };
    },

    async execute(args: unknown, _ctx: ToolRuntimeContext): Promise<ToolResult> {
      if (!deps.getScope()) {
        return {
          ok: false,
          outputKind: "content",
          data: null,
          error: {
            errorCode: "scope_missing",
            message: "当前知识范围不可用，无法读取文档。",
            recoverable: false,
            hint: "请确认当前作用域已正确初始化。",
          },
        };
      }

      const parsed = readCandidateDocsInputSchema.safeParse(args);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        const issuePath = firstIssue?.path?.join(".");
        const isSourceTypeIssue = issuePath?.includes("sourceType");
        return {
          ok: false,
          outputKind: "content",
          data: null,
          error: {
            errorCode: "invalid_args",
            message: "读取参数格式不正确。",
            recoverable: true,
            field: issuePath || "args",
            expected: isSourceTypeIssue
              ? "docId 或 blockId 即可；sourceType 不是必填，写了也不做硬校验"
              : "docIds（字符串数组）或 blockIds（字符串数组）；next 模式需要 cursor",
            received: firstIssue?.message ?? "参数格式错误",
            hint: isSourceTypeIssue
              ? "请直接使用 docIds: [...] 传 docId 列表，不需要填 sourceType。"
              : "推荐用法：{\"docIds\":[\"搜索或图谱返回的docId\"]}。",
          },
        };
      }

      try {
        const result = await executeReadCandidateDocs(deps, parsed.data);

        try {
          readCandidateDocsOutputSchema.parse(result.safeOutput);
        } catch {
          return {
            ok: false,
            outputKind: "content",
            data: null,
            error: {
              errorCode: "tool_internal_error",
              message: "读取结果输出格式校验失败。",
              recoverable: false,
              hint: "请稍后重试。",
            },
          };
        }

        return {
          ok: true,
          outputKind: "content",
          data: result.safeOutput,
        };
      } catch {
        return {
          ok: false,
          outputKind: "content",
          data: null,
          error: {
            errorCode: "tool_internal_error",
            message: "读取文档执行异常。",
            recoverable: true,
            hint: "请检查 docId/blockId 或 cursor 是否有效。",
          },
        };
      }
    },

    observationFormatter(result: ToolResult, _ctx: ToolRuntimeContext): ToolObservation {
      if (!result.ok) {
        const errorFacts = extractErrorFacts(result);
        return {
          toolName: "read_candidate_docs",
          ok: false,
          outputKind: "content",
          facts: {
            errorCode: errorFacts.errorCode,
            errorMessage: errorFacts.errorMessage,
            errorHint: errorFacts.errorHint,
            errorRecoverable: errorFacts.errorRecoverable,
          },
          summary: errorFacts.errorMessage ?? "候选文档内容读取失败。",
        };
      }

      const data = result.data as {
        items: PlannerVisibleReadItem[];
        contentItemCount: number;
        readDocCount: number;
        truncated: boolean;
        validDocIdCount?: number;
        resolvedDocCount?: number;
        requestedDocIdCount?: number;
        requestedBlockIdCount?: number;
        resolvedBlockCount?: number;
        resourceMismatchCount?: number;
        emptyContentCount?: number;
        containerCount?: number;
        failedResourceCount?: number;
        errors?: Array<{ code: string; message: string; hint: string; docId?: string; blockId?: string }>;
      };
      const firstError = data.errors?.[0];
      const firstTruncated = data.items.find((item) => item.truncated);
      const returnedChars = firstTruncated?.returnedContentChars ?? 0;
      const remainingChars = firstTruncated?.remainingChars ?? 0;

      // 构建已读资源摘要：让 Planner 知道哪些资源已经读过
      const readItemsSummary = data.items.map((item) => ({
        docId: item.docId,
        title: item.title,
        returnedContentChars: item.returnedContentChars ?? 0,
        truncated: item.truncated ?? false,
        hasNextCursor: !!item.nextCursor,
        status: item.content && item.content.length > 0 ? "content" : "empty",
      }));

      // 构建错误资源摘要：缺失字段就省略，不凑 docId:"" / blockId:""
      const errorItemsSummary = (data.errors ?? []).map((err) => {
        const entry: { code: string; message: string; docId?: string; blockId?: string } = {
          code: err.code,
          message: err.message,
        };
        if (err.docId) entry.docId = err.docId;
        if (err.blockId) entry.blockId = err.blockId;
        return entry;
      });

      // 判断是否为零命中且有不可恢复错误
      const hasUnrecoverableErrors = (data.errors ?? []).some(
        (e) => e.code === "resource_not_found" || e.code === "permission_denied" || e.code === "resource_mismatch",
      );
      const isZeroHitsWithErrors = data.contentItemCount === 0 && hasUnrecoverableErrors;

      // 构建诊断 summary：区分格式有效但资源不存在的情况
      let summary: string;
      if (data.contentItemCount === 0) {
        if ((data.validDocIdCount ?? 0) > 0 && (data.resolvedDocCount ?? 0) === 0) {
          summary = `收到 ${data.validDocIdCount} 个格式有效 ID，但当前范围内没有找到对应资源。`;
        } else if (firstError) {
          summary = firstError.message;
        } else {
          summary = "未读取到候选文档内容片段。";
        }
      } else if (data.truncated) {
        summary = `已读取 ${data.contentItemCount} 条内容片段，前 ${returnedChars} 字符，仍有 ${remainingChars} 字符未读，可使用 nextCursor 继续读取。`;
      } else {
        summary = `已读取 ${data.contentItemCount} 条内容片段。`;
      }

      return {
        toolName: "read_candidate_docs",
        ok: !isZeroHitsWithErrors,
        outputKind: isZeroHitsWithErrors ? "error_only" : "content",
        facts: {
          contentItemCount: data.contentItemCount,
          readDocCount: data.readDocCount,
          validDocIdCount: data.validDocIdCount,
          resolvedDocCount: data.resolvedDocCount,
          requestedDocIdCount: data.requestedDocIdCount,
          requestedBlockIdCount: data.requestedBlockIdCount,
          resolvedBlockCount: data.resolvedBlockCount,
          resourceMismatchCount: data.resourceMismatchCount,
          emptyContentCount: data.emptyContentCount,
          containerCount: data.containerCount,
          failedResourceCount: data.failedResourceCount,
          errorCode: isZeroHitsWithErrors ? "zero_hits_with_errors" : firstError?.code,
          errorMessage: isZeroHitsWithErrors ? summary : firstError?.message,
          errorHint: isZeroHitsWithErrors ? "请检查 docId/blockId 是否正确，或尝试重新搜索。" : firstError?.hint,
          isZeroHits: data.contentItemCount === 0,
          readItemsSummary,
          errorItemsSummary,
        },
        summary,
        content: {
          type: "content_items",
          items: data.items,
          truncated: data.truncated,
        },
      };
    },
  };
}
