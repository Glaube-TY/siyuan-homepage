import type {
  PlannerVisibleScopeDoc,
  ToolAvailability,
  ToolContract,
  ToolObservation,
  ToolResult,
  ToolRuntimeContext,
} from "../../../../workbench/contracts/tool-contract";
import { extractErrorFacts } from "../../../../workbench/contracts/tool-contract";
import type { KbRetrievalToolDeps } from "../adapters/kb-retrieval-tool-deps";
import { executeFocusDocScope } from "../adapters/focus-doc-scope.adapter";
import {
  focusDocScopeInputSchema,
  focusDocScopeOutputSchema,
} from "../schemas/focus-doc-scope.schema";

export function createFocusDocScopeTool(deps: KbRetrievalToolDeps): ToolContract {
  return {
    name: "focus_doc_scope",
    title: "聚焦文档范围",
    description:
      "将选中的 docId 扩展为临时文档范围，返回范围内的文档结构列表。" +
      "不读取文档正文，只返回结构信息（docId、标题、层级等）。" +
      "返回的 docId 可直接传给阅读工具读取正文。",
    capability: "将选中的文档 ID 扩展为文档范围，返回结构列表，不读取文档正文。",
    inputSchema: focusDocScopeInputSchema,
    outputSchema: focusDocScopeOutputSchema,
    outputKind: "navigation",
    safety: { readOnly: true },
    boundary: "只消费 docId；不读取、不搜索、不回答，不暴露内部标识。",
    source: "builtin",
    inputHint: "docIds（字符串数组，必填，必须来自工具返回的真实 docId），mode（\"exact\"|\"subtree\"|\"siblings\"|\"notebook\"，可选），maxDocIds（数字，可选）",

    availability(_ctx: ToolRuntimeContext): ToolAvailability {
      return { available: true };
    },

    async execute(args: unknown, _ctx: ToolRuntimeContext): Promise<ToolResult> {

      const parsed = focusDocScopeInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          outputKind: "navigation",
          data: null,
          error: {
            errorCode: "invalid_args",
            message: "聚焦范围参数格式不正确。",
            recoverable: true,
            field: "docIds",
            expected: "docIds 必须为非空字符串数组，mode 为 exact/subtree/siblings/notebook（可选）。",
            hint: "请提供有效的文档 ID 数组，例如：docIds: ['20210101000000-abc1234'], mode: 'subtree'",
          },
        };
      }

      try {
        const result = executeFocusDocScope(deps, parsed.data);

        try {
          focusDocScopeOutputSchema.parse(result.safeOutput);
        } catch {
          return {
            ok: false,
            outputKind: "navigation",
            data: null,
            error: {
              errorCode: "tool_internal_error",
              message: "聚焦范围输出格式校验失败。",
              recoverable: false,
              hint: "请稍后重试。",
            },
          };
        }

        return {
          ok: true,
          outputKind: "navigation",
          data: result.safeOutput,
        };
      } catch {
        return {
          ok: false,
          outputKind: "navigation",
          data: null,
          error: {
            errorCode: "tool_internal_error",
            message: "聚焦范围执行异常。",
            recoverable: true,
            hint: "请检查 docId 是否有效或换用其他候选文档。",
          },
        };
      }
    },

    observationFormatter(result: ToolResult, _ctx: ToolRuntimeContext): ToolObservation {
      if (!result.ok) {
        const errorFacts = extractErrorFacts(result);
        return {
          toolName: "focus_doc_scope",
          ok: false,
          outputKind: "navigation",
          facts: {
            errorCode: errorFacts.errorCode,
            errorMessage: errorFacts.errorMessage,
            errorHint: errorFacts.errorHint,
            errorRecoverable: errorFacts.errorRecoverable,
          },
          summary: errorFacts.errorMessage ?? "聚焦范围加载失败。",
        };
      }

      const data = result.data as {
        docs: PlannerVisibleScopeDoc[];
        focusedDocCount: number;
        mode: string;
        truncated: boolean;
      };

      return {
        toolName: "focus_doc_scope",
        ok: true,
        outputKind: "navigation",
        facts: {
          focusedDocCount: data.focusedDocCount,
          returnedCandidateCount: data.focusedDocCount,
          isZeroHits: data.focusedDocCount === 0,
        },
        summary: `结构结果只说明资料在哪里，不等于正文内容。聚焦范围已加载（${data.mode} 模式）。`,
        content: {
          type: "scope_docs" as const,
          docs: data.docs.map((d) => ({
            docId: d.docId,
            title: d.title,
            depth: d.depth,
            childCount: d.childCount,
            parentDocId: d.parentDocId,
            hasChildren: d.hasChildren,
            tags: d.tags,
            linkedDocs: d.linkedDocs,
          })),
        },
      };
    },
  };
}
