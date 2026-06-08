import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  listKnowledgeMapInputSchema,
  listKnowledgeMapOutputSchema,
} from "./contracts/list-knowledge-map.contract";
import type {
  ListKnowledgeMapInput,
  ListKnowledgeMapOutput,
} from "./contracts/list-knowledge-map.contract";

export { listKnowledgeMapInputSchema } from "./contracts/list-knowledge-map.contract";
export type {
  ListKnowledgeMapInput,
  ListKnowledgeMapOutput,
  KnowledgeMapNode,
  KnowledgeMapNotebook,
  KnowledgeLinkedDoc,
} from "./contracts/list-knowledge-map.contract";

export interface ListKnowledgeMapDeps {
  executeListKnowledgeMap(args: ListKnowledgeMapInput): Promise<{ safeOutput: ListKnowledgeMapOutput }>;
}

export function createListKnowledgeMapTool(deps: ListKnowledgeMapDeps): ToolContract<ListKnowledgeMapInput, ListKnowledgeMapOutput> {
  return {
    name: "list_knowledge_map",
    title: "查看知识结构",
    description: "查看思源知识结构：笔记本、文档树、子文档、局部子树、邻域。只返回结构信息（目录），不读取正文。结构范围由聊天框当前知识库范围限定。",
    inputSchema: listKnowledgeMapInputSchema,
    outputSchema: listKnowledgeMapOutputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    inputHint: "view（可选，默认 notebook_roots），notebookId/rootDocId/centerDocId（必须来自工具返回的真实 ID），maxDepth（子树深度，默认2），limit（分页），cursor（继续查看），includeTags/includeLinkedDocs。",
    boundary: "只返回结构/目录信息，不读取正文。0 结果会说明原因：invalid_args / resource_not_found / empty_children / empty_scope。结构范围由聊天框当前知识库范围限定。",
    plannerVisible: true,

    // Explicit override: z.preprocess makes auto-conversion unreliable.
    // All ID fields accept optional strings trimmed to 1-256 chars.
    inputJsonSchemaOverride: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["notebooks", "notebook_roots", "children", "subtree", "neighborhood", "list"],
          default: "notebook_roots",
        },
        rootDocId: { type: "string", minLength: 1, maxLength: 256 },
        centerDocId: { type: "string", minLength: 1, maxLength: 256 },
        notebookId: { type: "string", minLength: 1, maxLength: 256 },
        cursor: { type: "string", minLength: 1, maxLength: 256 },
        maxDepth: { type: "integer", minimum: 1, maximum: 10, default: 2 },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 50 },
        includeLinkedDocs: { type: "boolean", default: false },
        includeTags: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: ListKnowledgeMapInput): Promise<ToolResult<ListKnowledgeMapOutput>> {
      try {
        const result = await deps.executeListKnowledgeMap(args);
        return { ok: true, data: result.safeOutput };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = msg.startsWith("[resource_not_found]") ? "resource_not_found" : "tool_internal_error";
        return {
          ok: false, data: null,
          error: {
            code,
            message: msg.replace(/^\[resource_not_found\]\s*/, ""),
            recoverable: true,
            hint: code === "resource_not_found"
              ? "请使用工具返回的真实 notebookId 或 rootDocId。"
              : "请调整查看参数后重试。",
          },
        };
      }
    },

    summarizeResult(result: ToolResult<ListKnowledgeMapOutput>): string {
      if (!result.ok || !result.data) {
        return result.error?.message ?? "知识结构查看失败。";
      }
      const data = result.data;
      const nodeCount = data.returnedDocCount ?? data.returnedNodeCount;
      if (nodeCount > 0) {
        const canContinue = data.hasMore === true && !!data.nextCursor;
        return `已返回 ${nodeCount} 个节点${canContinue ? "，可使用 cursor 继续" : ""}。`;
      }
      // 0 nodes with error info
      if ((data as { error?: { code?: string; message?: string; hint?: string } }).error) {
        const err = (data as { error: { code?: string; message?: string; hint?: string } }).error;
        return `未返回节点：${err.code ?? "unknown"} / ${err.message ?? "无详情"}`;
      }
      return "未返回节点：当前范围或参数无匹配结果。";
    },
  };
}
