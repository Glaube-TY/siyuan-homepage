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
      "查看当前知识范围内的笔记本、目录、文档树、子文档、局部子树或邻域。只返回结构信息（目录），不读取正文。结构结果只说明资料在哪里，不等于正文内容。",
    capability:
      "支持 view=notebooks/notebook_roots/children/subtree/neighborhood/list。返回 notebookId、notebookName、docId、title、depth、parentDocId、childCount、hasChildren、hasMore、nextCursor。docId 可直接传给 read_candidate_docs 读取正文。",
    inputSchema: listKnowledgeMapInputSchema,
    outputSchema: listKnowledgeMapOutputSchema,
    outputKind: "tree",
    safety: { readOnly: true },
    boundary:
      "只返回结构/目录信息，不读取正文，不自动调用其他工具。不返回 content、markdown、dom、path、internalMapping。0 结果会说明原因（参数缺失、ID 不存在、无子节点、范围为空）。",
    source: "builtin",
    inputHint:
      "view（可选，默认 notebooks），notebookId/rootDocId/centerDocId（必须来自工具返回的真实 ID），limit/cursor（分页），maxDepth（子树深度）。",
    budgetCategory: "none",

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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("[resource_not_found]")) {
          return {
            ok: false,
            outputKind: "tree",
            data: null,
            error: {
              errorCode: "resource_not_found",
              message: msg.replace(/^\[resource_not_found\]\s*/, ""),
              recoverable: true,
              hint: "请使用工具返回的真实 notebookId 或 rootDocId。",
            },
          };
        }
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
        error?: { code: string; message: string; hint: string };
      };

      const pruneNode = (node: import("../../../../workbench/contracts/tool-contract").PlannerVisibleKnowledgeMapNode) => ({
        docId: node.docId,
        title: node.title,
        depth: node.depth,
        childCount: node.childCount,
        parentDocId: node.parentDocId,
        hasChildren: node.hasChildren,
        tags: node.tags,
        linkedDocs: node.linkedDocs,
        children: node.children ? node.children.map(pruneNode) : undefined,
      });

      if (data.docs) {
        const errorPart = data.error ? `【${data.error.code}】${data.error.message}（${data.error.hint}）` : "";
        return {
          toolName: "list_knowledge_map",
          ok: true,
          outputKind: "tree",
          facts: {
            totalNodeCount: data.totalNodeCount,
            returnedNodeCount: data.returnedNodeCount,
            hasMore: data.hasMore,
            errorCode: data.error?.code,
          },
          summary: data.error
            ? `结构结果只说明资料在哪里，不等于正文内容。${errorPart}`
            : data.hasMore
              ? `结构结果只说明资料在哪里，不等于正文内容。已返回 ${data.returnedDocCount ?? data.returnedNodeCount}/${data.totalNodeCount} 个节点；仍有更多，可使用 nextCursor 继续查看。`
              : `结构结果只说明资料在哪里，不等于正文内容。已返回 ${data.returnedDocCount ?? data.returnedNodeCount} 个节点。`,
          content: {
            type: "scope_docs" as const,
            resultScope: data.resultScope,
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
            hasMore: data.hasMore,
            nextCursor: data.nextCursor,
          },
        };
      }

      const errorPart2 = data.error ? `【${data.error.code}】${data.error.message}（${data.error.hint}）` : "";
      return {
        toolName: "list_knowledge_map",
        ok: true,
        outputKind: "tree",
        facts: {
          totalNodeCount: data.totalNodeCount,
          returnedNodeCount: data.returnedNodeCount,
          hasMore: data.hasMore,
          errorCode: data.error?.code,
        },
        summary: data.error
          ? `结构结果只说明资料在哪里，不等于正文内容。${errorPart2}`
          : data.hasMore
            ? `结构结果只说明资料在哪里，不等于正文内容。已返回 ${data.returnedNodeCount}/${data.totalNodeCount} 个节点；仍有更多，可使用 nextCursor 继续查看。`
            : `结构结果只说明资料在哪里，不等于正文内容。已返回 ${data.returnedNodeCount} 个节点。`,
        content: {
          type: "knowledge_map" as const,
          notebooks: data.notebooks.map((nb) => ({
            notebookId: nb.notebookId,
            title: nb.title,
            notebookName: nb.notebookName,
            docCount: nb.docCount,
            roots: nb.roots.map(pruneNode),
          })),
          hasMore: data.hasMore,
          nextCursor: data.nextCursor,
        },
      };
    },
  };
}
