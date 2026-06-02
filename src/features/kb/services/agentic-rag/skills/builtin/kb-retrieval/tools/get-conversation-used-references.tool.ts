import type {
  PlannerVisibleConversationReference,
  ToolAvailability,
  ToolContract,
  ToolObservation,
  ToolResult,
  ToolRuntimeContext,
} from "../../../../workbench/contracts/tool-contract";
import type { KbRetrievalToolDeps } from "../adapters/kb-retrieval-tool-deps";
import { executeGetConversationUsedReferences } from "../adapters/get-conversation-used-references.adapter";
import {
  getConversationUsedReferencesInputSchema,
  getConversationUsedReferencesOutputSchema,
} from "../schemas/get-conversation-used-references.schema";

export function createGetConversationUsedReferencesTool(
  deps: KbRetrievalToolDeps,
): ToolContract {
  return {
    name: "get_conversation_used_references",
    title: "Get Conversation Used References",
    description: "List safe handles for references already shown in this conversation.",
    capability: "Return safe reference handles and titles from already displayed conversation references.",
    inputSchema: getConversationUsedReferencesInputSchema,
    outputSchema: getConversationUsedReferencesOutputSchema,
    outputKind: "references",
    safety: { readOnly: true },
    boundary: "Does not search, read document bodies, or expose internal identifiers.",
    source: "builtin",
    boundSkillName: "builtin_knowledge_base_qa",

    availability(_ctx: ToolRuntimeContext): ToolAvailability {
      if (!deps.getConversationTurns) {
        return {
          available: false,
          reasonCode: "prerequisite_missing",
          hint: "Conversation reference provider is not available.",
        };
      }
      return { available: true };
    },

    async execute(_args: unknown, _ctx: ToolRuntimeContext): Promise<ToolResult> {
      if (!deps.getConversationTurns) {
        return {
          ok: false,
          outputKind: "references",
          data: null,
          errorCode: "prerequisite_missing",
        };
      }

      try {
        const result = executeGetConversationUsedReferences(deps);

        try {
          getConversationUsedReferencesOutputSchema.parse(result.safeOutput);
        } catch {
          return {
            ok: false,
            outputKind: "references",
            data: null,
            errorCode: "references_failed",
          };
        }

        try {
          if (result.internalMapping.length > 0) {
            deps.saveHandleMapping(result.internalMapping);
          }
        } catch {
          return {
            ok: false,
            outputKind: "references",
            data: null,
            errorCode: "adapter_failed",
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
          errorCode: "references_failed",
        };
      }
    },

    observationFormatter(result: ToolResult, _ctx: ToolRuntimeContext): ToolObservation {
      if (!result.ok) {
        return {
          toolName: "get_conversation_used_references",
          ok: false,
          outputKind: "references",
          facts: {
            errorCode: result.errorCode ?? "unknown_error",
          },
          summary: "Conversation references failed to load.",
        };
      }

      const data = result.data as {
        references: PlannerVisibleConversationReference[];
        referenceCount: number;
        truncated: boolean;
      };

      return {
        toolName: "get_conversation_used_references",
        ok: true,
        outputKind: "references",
        facts: {
          referenceCount: data.referenceCount,
        },
        summary: "Conversation references loaded.",
        content: {
          type: "conversation_references",
          references: data.references,
          truncated: data.truncated,
        },
      };
    },
  };
}
