/**
 * System tool: list_knowledge_map。v3 ToolContract。
 */

import type { ToolContract, ToolResult, ToolRuntimeContext, ToolAvailability, ToolObservation, PlannerVisibleKnowledgeMapNotebook } from "../../../../workbench/contracts/tool-contract";
import type { KbRetrievalToolDeps } from "../adapters/kb-retrieval-tool-deps";
import { executeListKnowledgeMap } from "../adapters/list-knowledge-map.adapter";
import { listKnowledgeMapInputSchema, listKnowledgeMapOutputSchema } from "../schemas/list-knowledge-map.schema";

export function createListKnowledgeMapTool(deps: KbRetrievalToolDeps): ToolContract {
  return {
    name: "list_knowledge_map",
    title: "List Knowledge Map",
    description: "返回知识库文档层级结构，不读取正文。",
    capability: "列出当前作用域下的文档树结构，返回安全 handle 供后续聚焦或搜索使用。",
    inputSchema: listKnowledgeMapInputSchema,
    outputSchema: listKnowledgeMapOutputSchema,
    outputKind: "tree",
    safety: { readOnly: true },
    boundary: "不读取文档正文，不暴露真实 docId / blockId / path。",
    source: "builtin",
    boundSkillName: "builtin_knowledge_base_qa",

    availability(_ctx: ToolRuntimeContext): ToolAvailability {
      if (!deps.getScope()) {
        return {
          available: false,
          reasonCode: "prerequisite_missing",
          hint: "Scope not available.",
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
          errorCode: "scope_missing",
        };
      }

      try {
        const parsed = listKnowledgeMapInputSchema.parse(args);
        const result = await executeListKnowledgeMap(deps, parsed);

        try {
          listKnowledgeMapOutputSchema.parse(result.safeOutput);
        } catch {
          return {
            ok: false,
            outputKind: "tree",
            data: null,
            errorCode: "knowledge_map_failed",
          };
        }

        try {
          deps.saveHandleMapping(result.internalMapping);
        } catch {
          return {
            ok: false,
            outputKind: "tree",
            data: null,
            errorCode: "adapter_failed",
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
          errorCode: "knowledge_map_failed",
        };
      }
    },

    observationFormatter(result: ToolResult, _ctx: ToolRuntimeContext): ToolObservation {
      if (!result.ok) {
        return {
          toolName: "list_knowledge_map",
          ok: false,
          outputKind: "tree",
          facts: {
            errorCode: result.errorCode ?? "unknown_error",
          },
          summary: "Failed to build knowledge map.",
        };
      }

      const data = result.data as {
        notebooks: PlannerVisibleKnowledgeMapNotebook[];
        totalNodeCount: number;
        returnedNodeCount: number;
        truncated: boolean;
      };

      return {
        toolName: "list_knowledge_map",
        ok: true,
        outputKind: "tree",
        facts: {
          totalNodeCount: data.totalNodeCount,
          returnedNodeCount: data.returnedNodeCount,
          notebookCount: data.notebooks?.length ?? 0,
        },
        summary: data.truncated
          ? `Knowledge map loaded: ${data.returnedNodeCount} of ${data.totalNodeCount} nodes returned (truncated).`
          : `Knowledge map loaded: ${data.returnedNodeCount} nodes.`,
        content: {
          type: "knowledge_map",
          notebooks: data.notebooks,
          truncated: data.truncated,
        },
      };
    },
  };
}
