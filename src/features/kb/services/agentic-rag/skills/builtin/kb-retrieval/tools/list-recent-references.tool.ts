import type {
  ToolAvailability,
  ToolContract,
  ToolObservation,
  ToolResult,
  ToolRuntimeContext,
} from "../../../../workbench/contracts/tool-contract";
import { extractErrorFacts } from "../../../../workbench/contracts/tool-contract";
import type { KbRetrievalToolDeps } from "../adapters/kb-retrieval-tool-deps";
import { executeListRecentReferences } from "../adapters/list-recent-references.adapter";
import {
  type PlannerVisibleRecentReference,
  listRecentReferencesInputSchema,
  listRecentReferencesOutputSchema,
} from "../schemas/list-recent-references.schema";

export function createListRecentReferencesTool(deps: KbRetrievalToolDeps): ToolContract {
  return {
    name: "list_recent_references",
    title: "列出本会话已展示来源",
    description: "列出本会话最近已展示给用户的通用来源，不读取正文。思源引用直接返回 docId。",
    capability: "返回本会话已展示来源的安全摘要、标题、来源类型和预览；来源类型可兼容 siyuan_doc、web_page、file、mcp_resource、api_result、operation_result。思源文档引用直接携带 docId。",
    inputSchema: listRecentReferencesInputSchema,
    outputSchema: listRecentReferencesOutputSchema,
    outputKind: "references",
    safety: { readOnly: true },
    boundary: "只列出已展示来源的安全摘要，不搜索、不读取正文、不暴露内部标识。",
    source: "builtin",
    inputHint: "无参数",

    availability(_ctx: ToolRuntimeContext): ToolAvailability {
      if (!deps.getConversationTurns && !deps.getRecentConversationContext) {
        return {
          available: false,
          reasonCode: "prerequisite_missing",
          hint: "当前会话还没有可复用的已展示来源。",
        };
      }
      return { available: true };
    },

    async execute(_args: unknown, _ctx: ToolRuntimeContext): Promise<ToolResult> {
      try {
        const result = executeListRecentReferences(deps);
        try {
          listRecentReferencesOutputSchema.parse(result.safeOutput);
        } catch {
          return {
            ok: false,
            outputKind: "references",
            data: null,
            error: {
              errorCode: "tool_internal_error",
              message: "已展示来源列表输出格式校验失败。",
              recoverable: false,
              hint: "请稍后重试。",
            },
          };
        }

        return {
          ok: true,
          outputKind: "references",
          data: result.safeOutput,
        };
      } catch {
        return {
          ok: false,
          outputKind: "references",
          data: null,
          error: {
            errorCode: "tool_internal_error",
            message: "列出已展示来源时发生异常。",
            recoverable: true,
            hint: "请稍后重试。",
          },
        };
      }
    },

    observationFormatter(result: ToolResult, _ctx: ToolRuntimeContext): ToolObservation {
      if (!result.ok) {
        const errorFacts = extractErrorFacts(result);
        return {
          toolName: "list_recent_references",
          ok: false,
          outputKind: "references",
          facts: {
            errorCode: errorFacts.errorCode,
            errorMessage: errorFacts.errorMessage,
            errorHint: errorFacts.errorHint,
            errorRecoverable: errorFacts.errorRecoverable,
          },
          summary: errorFacts.errorMessage ?? "已展示来源列表读取失败。",
        };
      }

      const data = result.data as {
        references: PlannerVisibleRecentReference[];
        referenceCount: number;
        returnedReferenceCount: number;
        truncated: boolean;
      };

      return {
        toolName: "list_recent_references",
        ok: true,
        outputKind: "references",
        facts: {
          referenceCount: data.referenceCount,
        },
        summary: data.referenceCount === 0
          ? "本会话暂无已展示来源。"
          : `已列出本会话 ${data.returnedReferenceCount} 个已展示来源。`,
        content: {
          type: "conversation_references",
          references: data.references,
          truncated: data.truncated,
        },
      };
    },
  };
}
