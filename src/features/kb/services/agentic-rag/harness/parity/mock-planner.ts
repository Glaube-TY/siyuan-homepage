import type { AgentActionName } from "../../actions/action-types";
import type { PlannerContextPack } from "../context/context-pack-types";

export interface MockPlannerDecision {
  actionType: AgentActionName;
  args?: unknown;
}

export interface MockPlanner {
  decide(context: PlannerContextPack): MockPlannerDecision;
}

export function createDefaultMockPlanner(): MockPlanner {
  return {
    decide(context) {
      if (context.state.allowedActions.includes("list_knowledge_map")) {
        return { actionType: "list_knowledge_map", args: {} };
      }
      if (context.state.allowedActions.includes("focus_doc_scope")) {
        return { actionType: "focus_doc_scope", args: { handles: ["km_0"], mode: "subtree" } };
      }
      if (context.state.allowedActions.includes("read_candidate_docs")) {
        return { actionType: "read_candidate_docs", args: { selection: "unread_top_k", k: 3 } };
      }
      if (context.state.allowedActions.includes("search_scope")) {
        return { actionType: "search_scope", args: { queries: [{ text: context.turn.question }] } };
      }
      return { actionType: "answer", args: { evidenceMode: context.evidenceSummary.evidenceItemCount > 0 ? "with_evidence" : "insufficient_evidence" } };
    },
  };
}
