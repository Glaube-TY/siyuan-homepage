/**
 * System tool: list_knowledge_map. V3 ToolContract.
 *
 * 只返回知识结构 observation，不读取正文，不自动调用其他业务工具。
 */

import type {
  PlannerVisibleKnowledgeMapNotebook,
  PlannerVisibleScopeDoc,
  ToolAvailability,
  ToolContract,
  ToolObservation,
  ToolResult,
  ToolRuntimeContext,
} from "../../../../workbench/contracts/tool-contract";
import { extractErrorFacts } from "../../../../workbench/contracts/tool-contract";
import type { KbRetrievalToolDeps } from "../adapters/kb-retrieval-tool-deps";
import { executeListKnowledgeMap } from "../adapters/list-knowledge-map.adapter";
import { listKnowledgeMapInputSchema, listKnowledgeMapOutputSchema } from "../schemas/list-knowledge-map.schema";

type KnowledgeMapResultScope = "notebooks" | "notebook_roots" | "children" | "subtree" | "neighborhood" | "list";

export function createListKnowledgeMapTool(deps: KbRetrievalToolDeps): ToolContract {
  return {
    name: "list_knowledge_map",
    title: "知识结构",
    description:
      "参数化查看当前知识范围内的笔记本、根文档、子节点、有限深度子树、中心文档邻域或扁平候选列表。只返回结构 observation，不读取正文，不自动调用搜索或读取工具。返回的 docId/notebookId/blockId 均为真实可调用资源 ID。",
    capability:
      "支持 view=notebooks/notebook_roots/children/subtree/neighborhood/list，支持 notebookId、rootDocId、centerDocId、limit、cursor、maxDepth、includeLinkedDocs、relationLimit。",
    inputSchema: listKnowledgeMapInputSchema,
    outputSchema: listKnowledgeMapOutputSchema,
    outputKind: "tree",
    safety: { readOnly: true },
    boundary:
      "不读取文档正文；不自动调用 read_candidate_docs；不把双链关系当作证据门槛；includeLinkedDocs 只返回轻量关系摘要，不返回 dom/content/markdown/path。",
    source: "builtin",
    inputHint:
      "view 可选；notebookId/rootDocId/centerDocId 使用工具返回的真实 ID；limit/cursor 用于分页；includeLinkedDocs=false 默认不查双链。",

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
      const scope = deps.getScope();
      if (!scope) {
        return {
          ok: false,
          outputKind: "tree",
          data: null,
          error: {
            errorCode: "scope_missing",
            message: "当前知识范围不可用，无法查看知识结构。",
            recoverable: false,
            hint: "请确认当前作用域已经初始化。",
          },
        };
      }

      const parsed = listKnowledgeMapInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          outputKind: "tree",
          data: null,
          error: {
            errorCode: "invalid_args",
            message: "知识结构工具参数格式不正确。",
            recoverable: true,
            hint: "请检查 view、limit、cursor、notebookId、rootDocId、centerDocId、maxDepth 等参数。",
          },
        };
      }

      try {
        const result = await executeListKnowledgeMap(deps, parsed.data);

        try {
          listKnowledgeMapOutputSchema.parse(result.safeOutput);
        } catch {
          return {
            ok: false,
            outputKind: "tree",
            data: null,
            error: {
              errorCode: "tool_internal_error",
              message: "知识结构工具输出格式校验失败。",
              recoverable: false,
              hint: "请稍后重试。",
            },
          };
        }

        return {
          ok: true,
          outputKind: "tree",
          data: result.safeOutput,
        };
      } catch {
        return {
          ok: false,
          outputKind: "tree",
          data: null,
          error: {
            errorCode: "tool_internal_error",
            message: "知识结构工具执行异常。",
            recoverable: true,
            hint: "请调整结构查看参数后重试。",
          },
        };
      }
    },

    observationFormatter(result: ToolResult, _ctx: ToolRuntimeContext): ToolObservation {
      if (!result.ok) {
        const errorFacts = extractErrorFacts(result);
        return {
          toolName: "list_knowledge_map",
          ok: false,
          outputKind: "tree",
          facts: {
            errorCode: errorFacts.errorCode,
            errorMessage: errorFacts.errorMessage,
            errorHint: errorFacts.errorHint,
            errorRecoverable: errorFacts.errorRecoverable,
          },
          summary: errorFacts.errorMessage ?? "知识结构查看失败。",
        };
      }

      const data = result.data as {
        mode?: "tree" | "list";
        view?: KnowledgeMapResultScope;
        resultScope: KnowledgeMapResultScope;
        notebooks: PlannerVisibleKnowledgeMapNotebook[];
        docs?: PlannerVisibleScopeDoc[];
        totalNodeCount: number;
        returnedNodeCount: number;
        returnedDocCount?: number;
        truncated: boolean;
        hasMore: boolean;
        nextCursor?: string;
        notebookApiLoaded?: boolean;
        notebookCount?: number;
        missingNotebookNameCount?: number;
        linkedDocsRequested?: boolean;
        linkedDocsErrorCount?: number;
      };

      if (data.docs) {
        return {
          toolName: "list_knowledge_map",
          ok: true,
          outputKind: "tree",
          facts: {
            totalNodeCount: data.totalNodeCount,
            returnedNodeCount: data.returnedNodeCount,
            candidateDocCount: data.totalNodeCount,
            returnedCandidateCount: data.returnedDocCount ?? data.returnedNodeCount,
            notebookApiLoaded: data.notebookApiLoaded,
            notebookCount: data.notebookCount,
            missingNotebookNameCount: data.missingNotebookNameCount,
            hasMore: data.hasMore,
            linkedDocsRequested: data.linkedDocsRequested,
            linkedDocsErrorCount: data.linkedDocsErrorCount,
          },
          summary: data.hasMore
            ? `知识结构已返回 ${data.returnedDocCount ?? data.returnedNodeCount}/${data.totalNodeCount} 个节点；仍有更多，可使用 nextCursor 继续查看。`
            : `知识结构已返回 ${data.returnedDocCount ?? data.returnedNodeCount} 个节点。`,
          content: {
            type: "scope_docs",
            resultScope: data.resultScope,
            docs: data.docs,
            truncated: data.truncated,
            hasMore: data.hasMore,
            nextCursor: data.nextCursor,
          },
        };
      }

      return {
        toolName: "list_knowledge_map",
        ok: true,
        outputKind: "tree",
        facts: {
          totalNodeCount: data.totalNodeCount,
          returnedNodeCount: data.returnedNodeCount,
          notebookCount: data.notebooks?.length ?? 0,
          notebookApiLoaded: data.notebookApiLoaded,
          sourceNotebookCount: data.notebookCount,
          missingNotebookNameCount: data.missingNotebookNameCount,
          hasMore: data.hasMore,
          linkedDocsRequested: data.linkedDocsRequested,
          linkedDocsErrorCount: data.linkedDocsErrorCount,
        },
        summary: data.hasMore
          ? `知识结构已返回 ${data.returnedNodeCount}/${data.totalNodeCount} 个节点；仍有更多，可使用 nextCursor 继续查看。`
          : `知识结构已返回 ${data.returnedNodeCount} 个节点。`,
        content: {
          type: "knowledge_map",
          resultScope: data.resultScope,
          notebooks: data.notebooks,
          truncated: data.truncated,
          hasMore: data.hasMore,
          nextCursor: data.nextCursor,
        },
      };
    },
  };
}
