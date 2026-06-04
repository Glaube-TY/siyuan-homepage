# Workbench v3 Runtime Test

> Manual / smoke checks for the V3-only Skill-first Agent Workbench runtime.
> Status: **runtime-testing**, **not** `production-verified`.

## Scope

These checks validate that the live chat runtime:

1. Uses `runV3AgenticRagTurn` for every `scopeMode` (whole_kb / current_notebook / current_doc_with_children / current_doc / custom_docs).
2. Does **not** call the legacy `runAgenticRagTurn` entry.
3. Surfaces v3 decisions, not legacy graph flow, on the assistant message and on the console.
4. Lets the Planner autonomously decide whether to call a Tool, reference a Skill, or answer directly.

## Pre-conditions

- A SiYuan plugin dev build that has Stages U–Z compiled in.
- A KB / notebook / doc scope is available in the workspace.
- Browser devtools console is open and the filter is cleared before starting.

## Console Marker Reference

### v3 (must appear)

- `[AgenticRagV3] TURN_STARTED`
- `[AgenticRagV3] TURN_SUCCEEDED`
- `[AgenticRagV3] TURN_FAILED`
- `[AgenticRagV3] V3_RUNTIME_NO_FALLBACK`
- `[AgenticRagV3] PLANNER_SCHEMA_RETRY_ONCE` — only fires if the first LLM response is `schema_validation_failed` and the one-shot retry is invoked.

### Legacy (must NOT appear)

- `LEGACY_FALLBACK_USED`
- `GRAPH_START`
- `KB_AGENT_HARNESS_ENTRY_SELECTED_SAFE`

## Smoke Check List

| # | Action | Expected | Pass? |
|---|---|---|---|
| 1 | Open the KB chat panel, send a "你能干什么？" question. | v3 Planner selects `answer` directly with `evidenceMode=without_kb_evidence`. Console shows `TURN_STARTED` then `TURN_SUCCEEDED`. No legacy markers. | ☐ |
| 2 | Ask a KB question that requires retrieval. | v3 Planner calls `list_knowledge_map` / `search_scope` / `read_candidate_docs` then `answer` with `evidenceMode=with_evidence` and `displayedReferenceHandles` populated. Footer references resolve. | ☐ |
| 3 | Ask a question with `current_doc` scope. | No legacy "read full fixed doc and answer" shortcut. The Planner explicitly chooses KB Skill tools to fetch and read. | ☐ |
| 4 | Ask a question with `custom_docs` scope. | Same as #3 — Planner chooses tools. No code-driven auto-read. | ☐ |
| 5 | Force the LLM to return malformed JSON once. | v3 logs `PLANNER_SCHEMA_RETRY_ONCE`, retries once with the same prompt, then either succeeds or returns `fail_closed_no_planner_decision` with a safe assistant message. No legacy fallback. | ☐ |
| 6 | Disconnect the model provider mid-turn. | v3 logs `TURN_FAILED` and a safe assistant message appears. No legacy fallback. | ☐ |
| 7 | Verify the Planner manifest the LLM receives. | `read_docs` / `read_block_context` are NOT in the manifest. `answer` IS in the manifest. KB tools are present and global. | ☐ |
| 8 | Inspect the Planner prompt. | No "默认基于知识库资料回答". No "需要知识库时选择 KB Skill 相关工具". No "先/再/然后/默认/必须" in KB Skill text. Global Identity only describes the SiYuan environment and knowledge-management assistant identity. All Planner-visible text (tool title/description/capability/boundary/inputHint, observation summary, Skill prompt, error messages) is in Chinese. Tool names may remain English. | ☐ |
| 9 | Inspect Planner-visible observations. | No `docId` / `blockId` / `notebookId` / `path` / `titlePath` / `internalMapping` in any observation content. | ☐ |
| 10 | Open the Skills settings catalog. | Skills are read-only. The tool section describes mentioned global tools, not "Skill tools" or "包含工具". | ☐ |
| 10A | Inspect prompt observations after a tool call. | Observation text uses natural labels such as candidates/evidence/docs, not raw `kind/facts/reason` field syntax. | ☐ |
| 11 | Inspect assistant action buttons after an answer with references. | No "continue search" / search icon action is rendered. UI must not create a deterministic KB follow-up turn. | ☐ |

| 12 | Ask a follow-up such as "微积分这本书的读书笔记已做的咋样，提提意见". | The run must ground on `# 本轮用户请求`; final answer must discuss the requested notes/book and must not mention AI Planner, JSON decision objects, tool manifest wording, or internal role assignment. | ☐ |
| 13 | Verify final_answer evidence closure. | When `evidenceMode=with_evidence`, `final_answer` must include `displayedReferenceHandles` or `safeEvidenceHandles`. If resource IDs are missing, the tool returns `tool_failed` with `errorCode=final_answer_missing_evidence_resource IDs`. If resource IDs cannot resolve to evidence, returns `final_answer_unresolved_evidence_resource IDs`. | ☐ |
| 14 | Verify stop reason codes. | Only `user_canceled`, `planner_declined_to_act`, `internal_aborted` are valid stop reasons. `evidence_sufficient_to_stop` and `ambiguous_need_clarification` are no longer accepted. | ☐ |
| 15 | Verify Skill enablement. | `userEnabledSkillNames` is not hardcoded in `runV3AgenticRagTurn`. Builtin KB Skill is enabled via `enabledByDefault: true` in SkillContract. | ☐ |

## Per-Check Notes

### Check 1: Direct answer without KB

- `evidenceMode=without_kb_evidence` is required. The Planner must select `answer` explicitly; the harness must not auto-select it.
- A common regression is code auto-selecting `answer` when scopeMode !== `whole_kb` and no tool has been called. Watch for that.

### Check 5: `schema_validation_failed` retry

- The retry uses the **same** prompt. There is no prompt rewrite, no fallback text, no `autoRoute` / `autoNextTool` injection. The only state change is a single console marker.
- If the second call also returns `schema_validation_failed`, the loop must close with `fail_closed_no_planner_decision` and surface a safe error message.

### Check 7: Planner manifest

- `read_docs` / `read_block_context` are execution-only targets. They are not registered as global Planner-visible tools. They are wired through `Workbench.executeExecutionOnlyTool` for downstream helpers and must not be advertised to the LLM.
- `answer` is registered under `src/features/kb/services/agentic-rag/skills/system/answer/`. It is always visible to the Planner regardless of any Skill enable state.

### Check 8: Prompt text

- `GLOBAL_IDENTITY_BODY` in `planner-context.ts` must only describe the SiYuan environment and knowledge-management assistant identity.
- `KB_RETRIEVAL_GUIDANCE_LINES` must describe capabilities only, and must not contain "先/再/然后/默认/必须".
- Concrete KB capabilities must come from Skill/tool prompt sections, not from the global identity prompt.

### Check 10: Skills settings stays read-only

- Settings only displays Skill metadata and referenced global tools.
- Settings must not enable / disable workflow behavior and must not change Planner tool selection.

### Check 11: No continue-search UI flow

- Assistant actions may include regenerate and copy.
- There must be no `continueSearch` event path, no `canContinueSearch` visibility gate, and no fixed prompt such as "请基于上一轮结果继续查找相关资料".

## Failure Signatures

- Legacy `GRAPH_START` reappearing → something in `agentic-rag-mode-flow.ts` still routes to legacy. Re-check the file and grep for `runAgenticRagTurn`.
- v3 never reaching `TURN_SUCCEEDED` for a no-KB question → Planner is being silently stopped or auto-routing. Check Planner prompt and `decideNextStep` return.
- `read_docs` / `read_block_context` in the manifest → a global tool is being registered as Planner-visible when it should be execution-only.
- KB Skill text still contains "先/再/然后/默认/必须" → `KB_RETRIEVAL_GUIDANCE_LINES` was edited but not the prompt side. Re-check the export.
- `LEGACY_FALLBACK_USED` in console → v3 threw and code still has a fallback. Remove the fallback branch in `agentic-rag-mode-flow.ts`.
- `CONTINUE_SEARCH_VISIBILITY_SAFE` in console → old continue-search visibility logic is still mounted in the UI.

## Status Update Procedure

When all checks pass, update:

- `docs/notebrain/workbench-v3-progress.md` Final Audit rows 32–33 with the actual `npm run build` and `npx.cmd tsc --noEmit` result.
- This file's "Status" line from `runtime-testing` to `runtime-verified` (still **not** `production-verified`).

Production verification is a separate step and is gated on:

- KB Skill settings UI complete.
- Chat storage split remains primary at runtime (`notebrain/chat/index.json` + session files), with old `kb-chat-sessions` used only for one-time migration.
- CodeGraph impact report confirms zero runtime in-edges for legacy modules.
- Manual run of this check list on a real user session.
