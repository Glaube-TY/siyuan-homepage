/**
 * Tool Contract Adapters
 *
 * 第一铁律：Harness 只能 validate / execute / observe / return_to_planner，
 * 不拦截或推荐业务动作。
 */

import type { AgentActionName } from "../../actions/action-types";
import { AgentActionSchema } from "../../actions/action-schema";
import {
  KB_AGENT_TOOL_NAMES,
} from "./tool-contract-registry";

export function expectAllContractsCoveredByAgentActionSchema(): {
  ok: boolean;
  actionTypes: AgentActionName[];
  missingActionTypes: AgentActionName[];
  errors: string[];
} {
  const errors: string[] = [];
  const missingActionTypes: AgentActionName[] = [];

  for (const name of KB_AGENT_TOOL_NAMES) {
    const sample = buildAgentActionSchemaSample(name);
    const parsed = AgentActionSchema.safeParse(sample);
    if (!parsed.success) {
      missingActionTypes.push(name);
      errors.push(`${name}: ${parsed.error.message}`);
    }
  }

  return {
    ok: missingActionTypes.length === 0,
    actionTypes: [...KB_AGENT_TOOL_NAMES],
    missingActionTypes,
    errors,
  };
}

function buildAgentActionSchemaSample(name: AgentActionName): Record<string, unknown> {
  const base = { type: name, reason: "contract coverage sample" };
  switch (name) {
    case "search_scope":
      return { ...base, args: { queries: [{ text: "sample" }] } };
    case "list_scope_docs":
      return { ...base, args: { limit: 1 } };
    case "read_docs":
      return { ...base, args: { docIds: ["sample-doc-id"] } };
    case "read_candidate_docs":
      return { ...base, args: { selection: "top_k", k: 1 } };
    case "read_previous_evidence":
      return { ...base, args: { k: 1 } };
    case "read_block_context":
      return { ...base, args: { blockIds: ["sample-block-id"] } };
    case "get_conversation_used_references":
      return { ...base, args: { turnScope: "recent", maxTurns: 1 } };
    case "get_doc_tree_context":
      return { ...base, args: { includeParent: true, maxItems: 1 } };
    case "list_knowledge_map":
      return { ...base, args: { maxDepth: 1, maxNodes: 20 } };
    case "focus_doc_scope":
      return { ...base, args: { handles: ["km_0"], mode: "subtree" } };
    case "answer":
      return { ...base, args: { evidenceMode: "insufficient_evidence" } };
  }
}
