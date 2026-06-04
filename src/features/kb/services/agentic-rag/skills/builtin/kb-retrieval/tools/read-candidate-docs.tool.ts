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
  readCandidateDocsInputSchema,
  readCandidateDocsOutputSchema,
} from "../schemas/read-candidate-docs.schema";

export function createReadCandidateDocsTool(deps: KbRetrievalToolDeps): ToolContract {
  return {
    name: "read_candidate_docs",
    title: "读取候选文档内容",
    description:
      "读取指定 docId 或 blockId 的文档正文。只有此工具返回的正文，才能用于详细总结、分析、比较。截断时返回 nextCursor，只绑定当前文档。",
    capability:
      "读取 docId/blockId 的正文。返回 docId、title、content/snippet、truncated、nextCursor、contentChars。docId 必须来自 search_scope、list_knowledge_map 等工具返回。",
    inputSchema: readCandidateDocsInputSchema,
    outputSchema: readCandidateDocsOutputSchema,
    outputKind: "content",
    safety: { readOnly: true },
    boundary:
      "只读取 Planner 显式传入的 docId/blockId/cursor，不自动继续读，不自动换 ID。不暴露内部标识。失败时区分 resource_not_found、empty_content、container_without_content、invalid_resource_id。",
    source: "builtin",
    inputHint:
      "docIds（字符串数组，推荐）或 blockIds（字符串数组），readMode（default/full/range/next），cursor（next 模式必填），maxCharsPerDoc（可选）。",
    budgetCategory: "read",

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
        items: Array<{
          docId?: string;
          title: string;
          content?: string;
          snippet: string;
          truncated?: boolean;
          returnedContentChars?: number;
          nextCursor?: string;
        }>;
        contentItemCount: number;
        readDocCount: number;
        truncated: boolean;
        requestedDocIdCount?: number;
        resolvedDocCount?: number;
        errors?: Array<{
          docId?: string;
          blockId?: string;
          code: string;
          message: string;
          hint?: string;
        }>;
      };
      const firstTruncated = data.items.find((item) => item.truncated);

      let summary: string;
      if (data.contentItemCount === 0) {
        if (data.errors && data.errors.length > 0) {
          const errorLines = data.errors
            .map((e) => {
              const idPart = e.docId ? `docId ${e.docId}` : e.blockId ? `blockId ${e.blockId}` : "";
              return idPart ? `${idPart}：${e.message}` : e.message;
            })
            .join("；");
          summary = `这些 docId 没有解析到可读取正文。失败原因：${errorLines}。`;
        } else if ((data.requestedDocIdCount ?? 0) > 0 && (data.resolvedDocCount ?? 0) === 0) {
          summary = "这些 docId 没有解析到可读取正文。请确认 ID 来自工具返回，且格式正确。";
        } else {
          summary = "未读取到内容片段。";
        }
      } else {
        const titles = data.items
          .filter((item) => item.title)
          .map((item) => item.title)
          .join("、");
        const titlePart = titles ? `：${titles}` : "";
        if (data.truncated && firstTruncated) {
          summary = `已读取正文${titlePart}。共 ${data.contentItemCount} 条内容，当前片段 ${firstTruncated.returnedContentChars ?? 0} 字符，可用 nextCursor 继续读取同一文档。这些正文可用于详细总结、分析、比较。`;
        } else {
          summary = `已读取正文${titlePart}。共 ${data.contentItemCount} 条内容片段。这些正文可用于详细总结、分析、比较。`;
        }
      }

      return {
        toolName: "read_candidate_docs",
        ok: true,
        outputKind: "content",
        facts: {
          contentItemCount: data.contentItemCount,
          readDocCount: data.readDocCount,
          requestedDocIdCount: data.requestedDocIdCount,
          resolvedDocCount: data.resolvedDocCount,
        },
        summary,
        content: {
          type: "content_items" as const,
          items: data.items.map((item) => ({
            docId: item.docId,
            title: item.title,
            content: item.content,
            snippet: item.snippet,
            truncated: item.truncated,
            contentChars: item.returnedContentChars,
            nextCursor: item.nextCursor,
          })),
          errors: data.errors,
        },
      };
    },
  };
}
