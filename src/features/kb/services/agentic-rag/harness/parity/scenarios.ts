import type { EvidenceWorkspace } from "../../workspace/evidence-workspace";
import type { ExpectedTrace } from "./expected-trace";

export interface KbAgentParityScenario {
  id: string;
  title: string;
  mode: "whole_kb" | "current_doc" | "current_notebook" | "current_doc_with_children";
  question: string;
  mockState?: Partial<EvidenceWorkspace>;
  mockPlannerDecisions?: Array<{
    actionType: string;
    args?: unknown;
  }>;
  mockBridgeFailureActionTypes?: string[];
  mockMaxLoops?: number;
  mockToolResults?: Record<string, unknown>;
  expected: ExpectedTrace;
}

export const KB_AGENT_PARITY_SCENARIOS: KbAgentParityScenario[] = [
  {
    id: "whole_kb_main_link",
    title: "Whole-KB main link: list_knowledge_map -> focus_doc_scope -> read_docs -> evidence_gate sufficient -> compose_answer.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeActionTypes: ["list_knowledge_map", "focus_doc_scope", "read_docs"],
      mustIncludeEvents: ["STRUCTURE_PACK_BUILT", "CANDIDATE_PACK_BUILT", "EVIDENCE_PACK_BUILT", "EVIDENCE_GATE_CHECKED"],
      minCandidateDocCount: 1,
      minReadDocCount: 1,
      minEvidenceItemCount: 1,
      mustNotAnswerBeforeEvidence: true,
    },
  },
  {
    id: "planner_only_action_materialization",
    title: "Planner output read_candidate_docs must be materialized to read_docs; execute_action must never execute read_candidate_docs.",
    mode: "whole_kb",
    question: "__PARITY_FOLLOW_UP_QUERY__",
    expected: {
      mustIncludeActionTypes: ["read_docs"],
      mustNotIncludeActionTypes: ["read_candidate_docs"],
      mustIncludeEvents: ["PLANNER_ONLY_ACTION_MATERIALIZED_SAFE"],
      minReadDocCount: 1,
    },
  },
  {
    id: "node_boundary_no_exec_in_plan_validate",
    title: "plan_next and validate_action phases must not emit EXEC_START/EXEC_END; execute_action must emit them; evidence_gate must not.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeActionTypes: ["list_knowledge_map", "read_docs"],
      mustNotIncludeEvents: ["EXEC_START_in_plan_next", "EXEC_END_in_plan_next", "EXEC_START_in_validate_action", "EXEC_END_in_validate_action", "EXEC_START_in_evidence_gate", "EXEC_END_in_evidence_gate"],
      mustIncludeEvents: ["EXEC_START_in_execute_action", "EXEC_END_in_execute_action"],
    },
  },
  {
    id: "insufficient_with_options_continuation",
    title: "evidence_gate returns insufficient with budget allowed must not auto-compose; Planner decides next action.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeEvents: ["EVIDENCE_GATE_CHECKED"],
      mustNotIncludeActionTypes: ["answer"],
      mustNotIncludeEvents: ["COMPOSE_START", "ANSWER_STREAM_START"],
    },
  },
  {
    id: "sufficient_routes_to_compose",
    title: "evidence_gate returns sufficient must enter compose_guard -> compose_answer with evidenceItemCount > 0.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeActionTypes: ["list_knowledge_map", "focus_doc_scope", "read_docs"],
      mustIncludeEvents: ["EVIDENCE_GATE_CHECKED", "EVIDENCE_PACK_BUILT"],
      minEvidenceItemCount: 1,
      minReadDocCount: 1,
      mustNotAnswerBeforeEvidence: true,
    },
  },
  {
    id: "map_loaded_allows_focus_or_search",
    title: "After list_knowledge_map, allowedActions must include focus_doc_scope and search_scope.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeActionTypes: ["list_knowledge_map"],
      mustIncludeStates: ["MAP_LOADED"],
      mustIncludeEvents: ["STRUCTURE_PACK_BUILT", "PLANNER_CONTEXT_BUILT"],
      mustNotIncludeStates: ["SEARCH_REQUIRED"],
    },
  },
  {
    id: "search_no_hits_finalizes",
    title: "After search_scope with no candidates and budget exhausted, state must be EVIDENCE_INSUFFICIENT_FINAL.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeActionTypes: ["list_knowledge_map", "search_scope"],
      mustIncludeStates: ["EVIDENCE_INSUFFICIENT_FINAL"],
      mustNotIncludeStates: ["EVIDENCE_INSUFFICIENT_WITH_OPTIONS"],
      mustIncludeEvents: ["EVIDENCE_GATE_CHECKED"],
    },
  },
  {
    id: "insufficient_with_options_never_composes",
    title: "Insufficient evidence state must not auto-compose; Planner decides next action.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeEvents: ["EVIDENCE_GATE_CHECKED"],
      mustNotIncludeEvents: ["COMPOSE_START", "ANSWER_STREAM_START"],
      mustNotIncludeStates: ["FINALIZED"],
      mustNotIncludeActionTypes: ["answer"],
    },
  },
  {
    id: "knowledge_map_persists_after_search",
    title: "After search_scope, knowledgeMap should still exist unless scope is explicitly reset.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeActionTypes: ["list_knowledge_map", "search_scope"],
      mustIncludeEvents: ["STRUCTURE_PACK_BUILT", "CANDIDATE_PACK_BUILT"],
    },
  },
  {
    id: "only_structure_does_not_force_search",
    title: "only_structure state should not directly narrow allowedActions to search_scope only.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeEvents: ["STRUCTURE_PACK_BUILT", "PLANNER_CONTEXT_BUILT"],
      mustIncludeActionTypes: ["list_knowledge_map"],
      mustIncludeStates: ["MAP_LOADED"],
      mustNotIncludeStates: ["SEARCH_REQUIRED"],
    },
  },
  {
    id: "forbidden_answer_in_map_loaded_falls_back_to_search",
    title: "When Planner outputs answer in MAP_LOADED state, the answer is rejected and Planner receives observation.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeEvents: ["STRUCTURE_PACK_BUILT", "PLANNER_CONTEXT_BUILT", "TOOL_OBSERVATION_RECORDED_SAFE"],
      mustIncludeStates: ["MAP_LOADED"],
    },
  },
  {
    id: "focus_requires_planner_handles",
    title: "focus_doc_scope without handles must fail and fallback to search_scope.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeEvents: ["PLANNER_CONTEXT_BUILT"],
      mustNotIncludeActionTypes: ["focus_doc_scope"],
    },
  },
  {
    id: "no_auto_focus_from_catalog_order",
    title: "System must not auto-generate focus handles from first N docHandleMappings.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeEvents: ["STRUCTURE_PACK_BUILT", "PLANNER_CONTEXT_BUILT"],
      mustIncludeActionTypes: ["list_knowledge_map"],
    },
  },
  {
    id: "planner_selected_focus_allowed",
    title: "When Planner explicitly outputs valid handles, focus_doc_scope can be executed.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    expected: {
      mustIncludeActionTypes: ["list_knowledge_map", "focus_doc_scope", "read_docs"],
      mustIncludeEvents: ["STRUCTURE_PACK_BUILT", "CANDIDATE_PACK_BUILT"],
      minCandidateDocCount: 2,
      minReadDocCount: 1,
      mustNotAnswerBeforeEvidence: true,
    },
  },
  {
    id: "recovered_search_executes",
    title: "MAP_LOADED planner answer must recover to search_scope and execute it.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    mockPlannerDecisions: [
      { actionType: "list_knowledge_map" },
      { actionType: "answer", args: { evidenceMode: "insufficient_evidence" } },
    ],
    expected: {
      mustIncludeEvents: ["TOOL_OBSERVATION_RECORDED_SAFE", "TOOL_EXEC_END"],
      mustIncludeActionTypes: ["list_knowledge_map", "search_scope"],
      mustIncludeActionSequence: ["list_knowledge_map", "search_scope"],
      mustNotIncludeEvents: ["COMPOSE_START", "ANSWER_STREAM_START"],
      mustNotIncludeActionTypes: ["answer"],
      minCandidateDocCount: 1,
    },
  },
  {
    id: "recovered_action_does_not_fail_tool_plan",
    title: "Forbidden-answer rejection must return observation to Planner.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    mockPlannerDecisions: [
      { actionType: "list_knowledge_map" },
      { actionType: "answer", args: { evidenceMode: "insufficient_evidence" } },
    ],
    expected: {
      mustIncludeEvents: ["TOOL_OBSERVATION_RECORDED_SAFE", "TOOL_EXEC_END"],
      mustIncludeActionTypes: ["search_scope"],
    },
  },
  {
    id: "bridge_failure_uses_continuation",
    title: "Bridge failure must return observation to Planner, not auto-compose.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    mockPlannerDecisions: [
      { actionType: "list_knowledge_map" },
      { actionType: "search_scope", args: { queries: [{ text: "__PARITY_QUERY__" }] } },
    ],
    mockBridgeFailureActionTypes: ["search_scope"],
    expected: {
      mustIncludeEvents: ["TOOL_OBSERVATION_RECORDED_SAFE", "TOOL_EXEC_END"],
      mustIncludeActionTypes: ["search_scope"],
      mustNotIncludeEvents: ["COMPOSE_START", "ANSWER_STREAM_START"],
      minCandidateDocCount: 1,
    },
  },
  {
    id: "empty_evidence_final_no_llm",
    title: "insufficient_final with empty evidence must use fixed answer and no LLM compose.",
    mode: "whole_kb",
    question: "__PARITY_QUERY__",
    mockPlannerDecisions: [
      { actionType: "list_knowledge_map" },
      { actionType: "search_scope", args: { queries: [{ text: "__PARITY_QUERY__" }] } },
    ],
    mockMaxLoops: 3,
    mockToolResults: {
      search_scope: { candidateDocCount: 0, candidateBlockCount: 0 },
    },
    expected: {
      mustIncludeEvents: ["EVIDENCE_GATE_CHECKED", "TOOL_OBSERVATION_RECORDED_SAFE"],
      mustIncludeStates: ["EVIDENCE_INSUFFICIENT_FINAL"],
      mustNotIncludeEvents: ["COMPOSE_START", "ANSWER_STREAM_START"],
      minEvidenceItemCount: 0,
    },
  },
];
