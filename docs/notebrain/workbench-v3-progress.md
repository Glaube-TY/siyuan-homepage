# Workbench v3 Progress

## Current Goal

Realize a real Skill-first Agent Workbench v3, v3-only at runtime. The runtime has cut over from legacy Agentic RAG graph/harness/planner state flow to v3. The architecture follows:

- **Tool is a global independent capability.** The ToolRegistry holds all available tools. Tools do not belong to any Skill.
- **Skill is a prompt-only specification / capability manual.** Skill describes what a Planner can do when it chooses to reference the Skill. Skill does not own, bind, filter, or order tools.
- **`answer` is a global system tool**, not owned by any KB Skill, and is always visible to the Planner.
- **AI Planner is the only business action decision maker.** The Workbench only validates, executes, observes, and returns to the Planner. Code must not auto-select search/list/read/answer.

## First Law Summary

- AI Planner chooses business actions.
- Workbench and Harness only validate, execute, observe, and return to Planner.
- Tool is an independent global capability, not a flow node and not bound to a Skill.
- Skill is a prompt specification, not a flow controller. It does not own / bind / filter / order tools.
- Storage, Settings, UI, and Session Store do not choose search/list/read/answer.
- Tool failures return observations only.
- `answer` is produced only when the AI Planner explicitly selects the answer tool.
- `final_answer` is a global system tool, not RAG-specific. `evidenceMode` is optional (Planner self-annotation, not flow control). `references` are optional UI resource IDs.
- `references` are general displayable sources, not KB-exclusive evidence. `DisplayReference` supports `siyuan_doc` / `web_page` / `file` / `mcp_resource` / `api_result` / `operation_result` / `unknown`.
- Tool failures return structured `ToolErrorDetail` (`errorCode` / `message` / `recoverable` / `hint`), not bare `errorCode`. All error messages are in Chinese.
- User scope mode is a neutral runtime fact. Prompt-visible text must render it as natural language such as "whole knowledge base" or "current document"; it does not auto-trigger KB tools, KB Skill, or `answer`.

## Current Mainline Structure

`src/features/kb/services/agentic-rag/`

- `workbench/`: generic Agent Workbench contracts, registries, guards, runtime, evidence, self-check.
- `skills/builtin/kb-retrieval/`: builtin knowledge base skill and v3 KB ToolContracts.
- `skills/system/answer/`: system answer tool.
- `skills/user/`: user markdown skill loader and registry adapter.
- `shared/`: pure shared rules and types.
- `storage/`: notebrain runtime storage.
- `tools/readers/` and `tools/executors/`: bottom-layer reusable capabilities.
- `create-agentic-rag-workbench.ts`: composition root.

## Legacy Quarantine

Legacy graph, harness, actions, planner, old runtime, old safety, old evidence, and `run-agentic-rag-turn.ts` remain quarantined until v3 main entry and main KB tools are stable. New v3 tools must not import legacy graph, harness contracts, planner, or actions.

### Runtime Cutover to v3-only (current step)

- `agentic-rag-mode-flow.ts` (orchestration) is now v3-only. It calls `runV3AgenticRagTurn` for every scopeMode (whole_kb / current_notebook / current_doc_with_children / current_doc / custom_docs).
- `runAgenticRagTurn` is no longer imported or called at runtime in this file.
- v3 returns `V3TurnResult` from `workbench/contracts/turn-result.ts`. The contract is owned by v3 and does not import any legacy module.
- v3 failure surfaces a safe error message (`V3 Workbench 未完成本轮回答：<safe code>`) directly into the current assistant message. No fallback to legacy graph is allowed.
- Expected console markers: `[AgenticRagV3] TURN_STARTED`, `[AgenticRagV3] TURN_SUCCEEDED`, `[AgenticRagV3] TURN_FAILED`, `[AgenticRagV3] V3_RUNTIME_NO_FALLBACK`. The following legacy markers must NOT appear at runtime: `LEGACY_FALLBACK_USED`, `GRAPH_START`, `KB_AGENT_HARNESS_ENTRY_SELECTED_SAFE`.
- `current_doc` / `custom_docs` no longer trigger any "read full fixed doc and answer" shortcut. The Planner chooses KB Skill tools to fetch and read.
- Physical removal of legacy files is pending CodeGraph zero-runtime-callers report.

### V3-only Skill-first Agent Workbench (current step)

This step re-roots v3 into a real Skill-first Agent Workbench. The runtime no longer merely "use v3 by default" — it is v3-only, and the Skill / Tool / Planner responsibilities are re-aligned to the First Law.

#### Tool decoupling (Stage U)

- `ToolContract` and `ToolManifest` no longer carry `boundSkillName`. Tools are no longer bound to any Skill.
- All KB tools (`list_knowledge_map`, `search_scope`, `list_scope_docs`, `focus_doc_scope`, `read_candidate_docs`, `read_previous_evidence`, `get_conversation_used_references`) dropped their `boundSkillName: "builtin_knowledge_base_qa"` field.
- `ToolRegistry.snapshotManifest` and `ToolRegistry.describeRegistry` no longer mention `boundSkillName`.
- `ToolRegistry.getPlannerToolManifest(ctx, budgetGuard)` returns ALL globally registered tools, filtered only by `availability(ctx)` and budget. It does NOT filter by Skill enable state.
- `read_docs` and `read_block_context` remain execution-only targets. They are NOT included in the Planner-visible manifest.
- `answer` (system tool) is a globally registered tool. It is visible to the Planner regardless of any Skill enable state.

#### Skill prompt-only refactor (Stage V)

- `SkillContract.getTools(ctx)` was removed. Skills do not return a tool subset.
- `SkillContract.buildPromptSection(ctx)` only emits `title / description / roleInstruction / whenUseful / boundary / guidance / toolNames` text. It does not modify `ctx` and does not trigger tool execution.
- `SkillRuntimeContext` no longer has `needsKnowledgeBase`. The neutral runtime field is scope mode, rendered to prompt as natural language scope text.
- `toolNames` on `SkillContract` is interpreted as a list of global tools mentioned by this Skill — a prompt hint, NOT ownership, binding, ordering, or enable condition.
- Builtin KB Skill (`builtin_knowledge_base_qa`) prompt section now lists non-answer KB tools under a natural-language heading.
- User markdown skill loader (`skills/user/markdown-skill-loader.ts`) is also refactored: `toolNames` are prompt hints only, no JS execution, no tool binding.

#### Planner identity and KB Skill text (Stage W)

- Global Identity body (in `planner-context.ts`) is now environment/identity only:
  - "你是运行在思源笔记中的 AI 助手，帮助用户处理知识管理相关问题和任务。"
  - Removed: "默认基于知识库资料回答".
- Global Role: `思源笔记 AI 助手`; Default Goal: `帮助用户完成知识管理相关任务`.
- KB Skill text refactored to neutral:
  - `KB_RETRIEVAL_DESCRIPTION`: "说明如何参考思源知识库相关全局工具能力进行检索、读取、引用。"
  - `KB_RETRIEVAL_ROLE_INSTRUCTION`: "可使用思源知识库资料辅助回答。"
  - `KB_RETRIEVAL_WHEN_USEFUL`: "当用户问题涉及知识库资料的检索、查找、总结、解释、对比或引用时可参考。"
  - `KB_RETRIEVAL_GUIDANCE_LINES`: lists capabilities (knowledge map / search / list scope / read candidate / read history) without "先/再/然后/默认/必须" flow ordering.
- `runV3AgenticRagTurn`'s Planner prompt also says: "可参考启用的 Skill 说明，自主选择是否调用全局工具或直接 answer." It no longer says "需要知识库时选择 KB Skill 相关工具".

#### Scope mode replacement (Stage X)

- `needsKnowledgeBase` was removed from `SkillRuntimeContext`, `PlannerContextInput`, `PlannerContext`, `buildPlannerContext`, `PlannerLoopInput`, and all callers.
- Replaced with `activeScopeMode: AgentScopeMode` (typed against `scope/types.ts`). This is a neutral runtime fact.
- The UI / Settings / Session Store still records the user's scope choice, but it does NOT influence tool / answer auto-selection anywhere in code.
- The prompt renders the current scope as natural language, and the AI decides autonomously whether to call KB tools, use the KB Skill, or answer directly.

#### Planner `schema_validation_failed` one-shot retry (Stage Y)

- `runV3AgenticRagTurn`'s `createDecideNextStep` now performs at most one safe retry when the LLM's first response is `errorKind: "schema_validation_failed"`.
- The retry uses the SAME prompt (no rewriting, no fallback text, no tool auto-selection). It simply calls `callLlmObject(prompt, PLANNER_DECISION_SCHEMA, llmOptions)` once more.
- A console marker `[AgenticRagV3] PLANNER_SCHEMA_RETRY_ONCE` is emitted when the retry fires.
- After one retry, `PlannerLoop` reports `fail_closed_no_planner_decision` if the second response is still invalid. There is no fallback to legacy code.

#### V3-only runtime audit (Stage Z, current)

- `agentic-rag-mode-flow.ts` no longer calls `runAgenticRagTurn`. All scopeMode enter `runV3AgenticRagTurn`.
- v3 `PlannerLoop` and `decideNextStep` no longer reference old `run-agentic-rag-turn` types.
- "你能干什么？" is answered by v3 Planner directly via `answer`, `evidenceMode=without_kb_evidence`.
- Expected console markers: `[AgenticRagV3] TURN_STARTED`, `[AgenticRagV3] TURN_SUCCEEDED`, `[AgenticRagV3] TURN_FAILED`, `[AgenticRagV3] V3_RUNTIME_NO_FALLBACK`, `[AgenticRagV3] PLANNER_SCHEMA_RETRY_ONCE` (only when retry fires). Legacy markers MUST NOT appear: `LEGACY_FALLBACK_USED`, `GRAPH_START`, `KB_AGENT_HARNESS_ENTRY_SELECTED_SAFE`.
- Status: `runtime-testing`, **not** `production-verified`.

#### UI / Storage boundary audit (Stage AA, current)

- Removed the legacy "continue search" assistant action from `chat-message-list.svelte`, `chat-message-item.svelte`, and `kb-main-panel.svelte`.
- UI no longer derives `canContinueSearch` from references/evidence and no longer sends the deterministic prompt "请基于上一轮结果继续查找相关资料".
- CodeGraph post-change audit reports `continueSearch` is no longer a symbol in the codebase.
- `window.__kbAgentCopyTrace()` now writes failed clipboard output to `window.__kbAgentLastTraceJson` and returns the JSON string, so runtime trace capture does not depend on clipboard permission.
- Storage boundary grep remains clean: storage does not import skills, UI, old harness contracts, graph, actions, or planner.

## Phase Status

| Stage | Goal | Status | Check Result | Next Step |
|---|---|---|---|---|
| A | Complete `list_knowledge_map` v3 loop | migrated-unverified | build/tsc passed; allocator + duplicate reject; notebook handle via allocator | Needs end-to-end verification |
| B | Migrate `get_conversation_used_references` | migrated-unverified | build/tsc passed; uses deps allocator; no legacy imports | Needs end-to-end verification |
| C | Migrate `search_scope` | migrated-unverified | build/tsc passed; uses effective scope + deps allocator | Needs end-to-end verification |
| D | Migrate scope document range tools | migrated-unverified | build/tsc passed; list_scope_docs uses effective scope | Needs end-to-end verification |
| E | Migrate `read_candidate_docs` | migrated-unverified | build/tsc passed; focus scope filtering active; content reference ID via allocator | Needs end-to-end verification |
| F | Migrate `read_previous_evidence` | migrated-unverified | build/tsc passed; content reference ID via allocator | Needs end-to-end verification |
| G | Register full real KB skill tool set | migrated-unverified | KbRetrievalRuntimeState per-turn; inputHint on all tools | Needs end-to-end verification |
| H | Connect v3 to main QA entry | integrated-unverified | runV3AgenticRagTurn + PlannerLoop + callLlmObject with reasoningEffort/providerOptions; v3-only runtime; build/tsc passed | Needs production verification |
| I | Connect split chat storage | implemented | kb-session-store now reads/writes `notebrain/chat/index.json` + `notebrain/chat/sessions/*.json` through the v3 storage facade; old `kb-chat-sessions` is migration source only | Build/tsc passed; manual production verification still pending |
| J | Connect user markdown skill settings | partial | refreshUserSkills at composition root; user-skill-store reads/writes notebrain/skills/user; no full settings UI | No settings UI; diagnostics only |
| K | Clean legacy code | quarantined | deletion deferred until CodeGraph confirms zero runtime in-edges; legacy fallback removed from main QA entry | Blocked on legacy physical deletion audit |
| L | Fix v3 Planner LLM param passing | implemented | chatModelSelection + reasoningEffort + providerOptions passed to callLlmObject structured + raw fallback | Build/tsc passed |
| M | Inject conversation references | implemented | conversationTurns in params + KbRetrievalRuntimeState + extractConversationTurns in flow | Build/tsc passed |
| N | Fix footerReferences closure | implemented | safeEvidenceHandles in AnswerToolData/AnswerDraft/extractAnswerDraft; merged with displayedReferenceHandles; resolveFooterReferences | Build/tsc passed |
| O | Fix handle/content reference ID uniqueness | implemented | per-turn allocator; throw on duplicate; notebook handle via allocator | Build/tsc passed |
| P | Make focus_doc_scope affect subsequent tools | implemented | getEffectiveScope; read_candidate_docs filters by activeFocusScope | Build/tsc passed |
| Q | Add Planner manifest inputHint | implemented | inputHint on all 8 tools; correct parameter descriptions | Build/tsc passed |
| R | Fix raw fallback providerOptions safe mapping | implemented | extractOpenAICompatibleReasoningEffortFromProviderOptions helper; reads openai/openai-compatible nested keys only | Local build passed |
| S | Builtin Skill read-only catalog + settings tab | implemented-unverified | skill-catalog.ts imports from skill.ts/guidance.ts; skills-settings-tab.svelte with guidance collapsible | Local build passed; not production-verified |
| T | Fix buildReasoningProviderOptions actually returns providerOptions | implemented | buildReasoningProviderOptions now delegates to resolveProviderProfile + buildReasoningProviderOptionsFromProfile; structured fallback / structuredOutputs / streamText paths will write reasoning_effort for mimo family | Local build passed |
| U | Tool decoupling from Skill (remove `boundSkillName`) | implemented | `ToolContract` / `ToolManifest` no longer carry `boundSkillName`; KB tools have no Skill binding; `ToolRegistry.getPlannerToolManifest` returns global tools filtered only by availability + budget; `read_docs` / `read_block_context` excluded from Planner manifest; `answer` global | Local build passed; awaiting CodeGraph impact + tsc check |
| V | Skill prompt-only refactor (no `getTools`) | implemented | `SkillContract.getTools` removed; `buildPromptSection` emits prompt text only; `toolNames` is a global-tool mention hint; builtin KB + user markdown skills follow the same rule | Local build passed |
| W | Planner identity + KB Skill text back-to-neutral | implemented | Global Identity only describes the SiYuan environment and knowledge-management assistant identity; KB Skill text describes capability and boundary without "默认基于知识库资料回答" or flow ordering | Local build passed |
| X | Replace `needsKnowledgeBase` with scope mode | implemented | `needsKnowledgeBase` removed from `SkillRuntimeContext` / `PlannerContextInput` / `PlannerContext` / `PlannerLoopInput` and all call sites; scope mode is a neutral runtime fact rendered to prompt as natural language | Local build passed |
| Y | Planner `schema_validation_failed` one-shot retry | implemented | `createDecideNextStep` performs at most one retry with the same prompt; emits `[AgenticRagV3] PLANNER_SCHEMA_RETRY_ONCE`; no rewrite / fallback text / legacy fallback | Local build passed |
| Z | V3-only runtime + Skill-first architecture audit | runtime-testing | `agentic-rag-mode-flow.ts` no longer calls `runAgenticRagTurn`; legacy markers absent at runtime; "你能干什么？" answered by v3 Planner with `evidenceMode=without_kb_evidence`; docs updated | Not production-verified |
| AA | UI / Storage boundary cleanup | implemented | Continue-search UI event chain removed; UI no longer creates deterministic KB follow-up turns; trace copy fallback improved | Needs manual UI verification |
| AC | Latest-user-request grounding | implemented | `renderPlannerContextPreview` now includes `# 本轮用户请求` with natural-language scope text and the raw user task; prompt forbids treating JSON format instructions as the user task; leakage prevention is at prompt construction, not answer post-processing | Build/tsc passed; needs manual regression check |
| AD | Concrete document content reading | implemented | Safe excerpts increased from 500 to 3000 chars; snippet sanitizer no longer drops Markdown content just because it contains `/`; Planner/Skill/tool guidance now states list/search are not document bodies and content tasks should read candidate resource IDs; V3 actionHistory records safe tool names | Build/tsc passed; needs manual regression check |
| AF | Global prompt and Skill prompt purity | implemented | Global identity no longer mentions Skills/Tools as capabilities; observations render as natural language; builtin/user Skill prompt sections are concise capability manuals without duplicate headings | Build/tsc passed; needs manual regression check |
| AG | final_answer global tool refactor | implemented | final_answer is global system tool, not RAG-specific; evidenceMode optional (not flow control); references optional (no forced evidence); handle validation filters invalid resource IDs instead of rejecting answer; KB Skill guidance adds reference suggestions without enforcement | Build/tsc passed |
| AH | DisplayReference / ResourceRef abstraction | implemented | New `display-reference.ts` contract + `InMemoryDisplayReferenceStore`; KB resource IDs registered as `DisplayReference` with `sourceType=siyuan_doc`; `resolveDisplayReferences` unifies multi-source reference resolution; `final_answer` uses `DisplayReferenceStore` for reference parsing | Build/tsc passed |
| AI | Tool result and error observation standardization | implemented | `ToolResult` adds `ToolErrorDetail` structured error; `ToolObservation.facts` adds `errorMessage`/`errorHint`/`errorRecoverable`; all 7 KB tools updated with Chinese error messages and hints; `extractErrorFacts` helper added | Build/tsc passed |
| AJ | Documentation back-to-principles | implemented | `00-first-principles.md` adds DisplayReference/ResourceRef section + tool error standardization; removes `evidenceMode` required from allowed list; `agent-skill-workbench-v3-design.md` adds sections 18/19; `workbench-v3-progress.md` updated with AH/AI/AJ status | Build/tsc passed |
| AK | references unification + DisplayReference main chain + progress UI + error observation + stop narrowing | implemented | `ALLOWED_ANSWER_KEYS` 加入 `references`；`assertAnswerArgsShape` 校验；`extractAnswerDraft` 提取；`AnswerDraft` 兼容旧字段；`runV3` 合并解析；`resolveDisplayReferences` 主链路；`ExecutionOutcome` 添加 `progressBody`；`PlannerLoopResult` 添加 `progressBodies`；`V3ProgressEvent` 添加 `kind`/`body`；`makeToolFailedObservation` 接受 `detail` 参数；所有错误填充结构化信息；`STOP_DECISION_SCHEMA` 删除 `planner_declined_to_act`；文档同步 | Build/tsc passed; runtime-testing |

## Tool Migration Status

| Tool | v3 Status | Planner Visible | Read Only | Schema | Observation | Safe Handle | Replaces Legacy |
|---|---|---|---|---|---|---|---|
| `list_knowledge_map` | migrated-unverified | yes | yes | yes | yes | yes | partial |
| `get_conversation_used_references` | migrated-unverified | yes | yes | yes | yes | yes | partial |
| `search_scope` | migrated-unverified | yes | yes | yes | yes | yes | partial |
| `list_scope_docs` | migrated-unverified | yes | yes | yes | yes | yes | partial |
| `focus_doc_scope` | migrated-unverified | yes | yes | yes | yes | yes | partial |
| `get_doc_tree_context` | removed_from_skill | no | N/A | N/A | N/A | N/A | no |
| `read_candidate_docs` | migrated-unverified | yes | yes | yes | yes | yes | partial |
| `read_previous_evidence` | migrated-unverified | yes | yes | yes | yes | yes | partial |
| `read_docs` | Execution-only target | no | yes | legacy | legacy | no | no |
| `read_block_context` | Execution-only target | no | yes | legacy | legacy | no | no |
| `answer` | migrated-unverified | yes | yes | yes | yes | safe reference resource IDs (optional) | partial |

## Module Boundaries

| Module | Responsibility | Allowed Dependencies | Forbidden Dependencies | Status |
|---|---|---|---|---|
| `workbench/` | Generic Agent Workbench | own modules, `shared/flow-control`, zod/types | skills, storage, UI, settings, legacy graph/harness/actions/planner | Enforced by review and rg |
| `skills/` | Skill descriptions and v3 tools | workbench contracts/registries/guards, internal modules, bottom readers for KB adapters | storage implementation, UI, settings, legacy graph/harness/actions/planner | Stage F adapters use bottom readonly reader and injected safe mapping storage only; Stage V: `getTools` removed; `toolNames` is prompt hint only |
| `storage/` | notebrain runtime data read/write | plugin storage API, storage internals, pure shared storage types | skills, UI, old harness contracts, fs/path | Split chat storage is runtime primary; legacy single-file storage is migration-only |
| `shared/` | Pure rules and types | own modules, pure contracts where documented | storage, UI, legacy, runtime registries | Not changed in Stage C |
| `tools/readers/` | Bottom read/search capabilities | retrieval/search services and local types | v3 flow control | Search/list/full document readers reused by v3 adapters |
| `create-agentic-rag-workbench.ts` | Composition root | workbench, skills, storage adapters | hard-coded business flow | Already registers migrated tools via deps |

## Build And Tsc

| Check | Last Result | Notes |
|---|---|---|
| `npm run build` | ✅ Phase R-S local | 2325 modules; 3844 KB; existing warnings only |
| `npx tsc --noEmit` | ✅ Phase R-S local | exit 0, no type errors |
| `npm run build` (Stage U–Z/AA) | ✅ current local | 2258 modules; dist/index.js 3,466.88 kB (gzip 1,080.33 kB); existing warnings only |
| `npx.cmd tsc --noEmit` (Stage U–Z/AA) | ✅ current local | exit 0, no type errors |

| `npm run build` (Stage AB storage split) | ✅ current local | 2258 modules; dist/index.js 3,466.70 kB (gzip 1,080.31 kB); existing warnings only |
| `npx.cmd tsc --noEmit` (Stage AB storage split) | ✅ current local | exit 0, no type errors |

| `npm run build` (Stage AC planner grounding) | ✅ current local | 2258 modules; dist/index.js 3,467.57 kB (gzip 1,080.73 kB); existing warnings only |
| `npx.cmd tsc --noEmit` (Stage AC planner grounding) | ✅ current local | exit 0, no type errors |

## Final Audit (Phase R-S local)

| # | Check | Result |
|---|---|---|
| 1 | `npm run build` | ✅ 2325 modules, 3844 KB |
| 2 | `npx tsc --noEmit` | ✅ exit 0 |
| 3 | workbench/ → skills/storage/UI imports | ✅ 0 matches |
| 4 | skills/ → legacy harness/graph/planner/actions | ✅ 0 matches |
| 5 | Planner manifest → read_docs/read_block_context | ✅ excluded |
| 6 | Planner-visible observation → docId/blockId/notebookId/path/internalMapping | ✅ excluded |
| 7 | No new flow-control fields | ✅ only whitelist |
| 8 | Module-level counters | ✅ per-turn allocator |
| 9 | Sanitize logic | ✅ kb-safe-text.ts |
| 10 | KbRetrievalToolDeps runtime | ✅ KbRetrievalRuntimeState per-turn |
| 11 | focus scope deps | ✅ get/save ActiveFocusScope + getEffectiveScope |
| 12 | v3 PlannerLoop + LLM | ✅ callLlmObject with reasoningEffort/providerOptions |
| 13 | Chat storage split | ✅ split storage primary; legacy `kb-chat-sessions` migration-only |
| 14 | User skill registration | partial (no settings UI) |
| 15 | Handle allocator | ✅ per-turn; throw on duplicate |
| 16 | footerReferences closure | ✅ safeEvidenceHandles + displayedReferenceHandles |
| 17 | read_candidate_docs focus scope | ✅ filters by activeFocusScope.docIds |
| 18 | Raw fallback providerOptions | ✅ extractOpenAICompatibleReasoningEffortFromProviderOptions reads nested openai/openai-compatible keys only |
| 19 | Builtin Skill catalog | ✅ skill-catalog.ts imports from skill.ts/guidance.ts; no hardcoded duplicates |
| 20 | Skills settings tab | ✅ read-only; guidance collapsible; no register/unregister/enable/disable |

## Final Audit (Stage U–Z, current)

| # | Check | Result |
|---|---|---|
| 21 | `ToolContract` / `ToolManifest` → no `boundSkillName` | ✅ field removed from interface and all call sites |
| 22 | KB tools → no `boundSkillName` | ✅ grep finds 0 matches in `skills/builtin/kb-retrieval/tools/*` and `register.ts` |
| 23 | `ToolRegistry.getPlannerToolManifest` filters by Skill enable state | ✅ does NOT filter by Skill; only by `availability` + budget |
| 24 | `SkillContract.getTools` | ✅ removed; `buildPromptSection` is the only contract surface |
| 25 | `SkillRuntimeContext.needsKnowledgeBase` | ✅ replaced by neutral scope mode rendered as natural language in prompt |
| 26 | Global Identity "默认基于知识库资料回答" | ✅ removed; replaced by required neutral AI Agent identity |
| 27 | KB Skill "先/再/然后/默认/必须" | ✅ removed from `KB_RETRIEVAL_GUIDANCE_LINES`; guidance is capability description only |
| 28 | `runV3AgenticRagTurn` "需要知识库时选择 KB Skill 相关工具" | ✅ removed; replaced by "可参考启用的 Skill 说明，自主选择是否调用全局工具或直接 answer" |
| 29 | Planner `schema_validation_failed` retry | ✅ one-shot retry, same prompt, no rewrite, no legacy fallback |
| 30 | `agentic-rag-mode-flow.ts` → `runAgenticRagTurn` | ✅ does NOT import or call legacy entry |
| 31 | Console markers `LEGACY_FALLBACK_USED` / `GRAPH_START` | ✅ absent at runtime |
| 32 | `npm run build` (Stage U–Z/AA) | ✅ 2258 modules; dist/index.js 3,466.88 kB (gzip 1,080.33 kB); pre-existing warnings only |
| 33 | `npx.cmd tsc --noEmit` (Stage U–Z/AA) | ✅ exit 0, no type errors |
| 34 | Chat storage runtime primary | ✅ `kb-session-store` imports v3 storage facade; old single-file storage is migration-only |
| 35 | `npm run build` (Stage AB storage split) | ✅ 2258 modules; dist/index.js 3,466.70 kB (gzip 1,080.31 kB); pre-existing warnings only |
| 36 | `npx.cmd tsc --noEmit` (Stage AB storage split) | ✅ exit 0, no type errors |
| 34 | UI continue-search event chain | ✅ `continueSearch` / `canContinueSearch` / `CONTINUE_SEARCH_*` removed |
| 35 | UI deterministic KB follow-up prompt | ✅ removed; UI does not send "请基于上一轮结果继续查找相关资料" |
| 36 | Debug trace copy fallback | ✅ failed clipboard writes JSON to `window.__kbAgentLastTraceJson` and returns it |

| 37 | Planner prompt latest user request | ✅ prompt uses `# 本轮用户请求` and includes the raw user task |
| 38 | Prompt-visible scope text | ✅ internal `activeScopeMode` values are rendered as natural scope labels such as `整个知识库` / `当前文档` |
| 39 | Answer-layer leakage guard | ✅ removed; leakage is prevented at prompt construction, not by answer post-processing |
| 40 | Skill/tool visible wording | ✅ prompt-visible text now uses natural capability and scope wording, without old control-plane phrasing |
| 41 | V3 chain confirmation | ✅ Skill only contributes prompt guidance; global tools remain visible; AI decision selects tool/answer; no old flow-control fallback added |
| 42 | `npx.cmd tsc --noEmit` (Stage AE prompt cleanup) | ✅ exit 0, no type errors |
| 43 | `npm run build` (Stage AE prompt cleanup) | ✅ 2258 modules; dist/index.js 3,468.52 kB (gzip 1,081.37 kB); pre-existing warnings only |
| 44 | Global prompt purity | ✅ global identity only describes SiYuan environment and knowledge-management assistant identity |
| 45 | Observation prompt wording | ✅ observation previews use natural language labels instead of `kind/facts/reason` field syntax |
| 46 | Skill prompt compactness | ✅ builtin and user Skill prompt sections avoid duplicate headings and internal manifest labels |

## Known Issues (Phase 1 audit)

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | `get_doc_tree_context` was in `BUILTIN_KB_SKILL_TOOL_NAMES` and guidance without v3 ToolContract | 🔴 | Fixed — removed from skill.ts + guidance.ts |
| 2 | `focus_doc_scope` saves `ActiveFocusScope` but no `getActiveFocusScope` in deps — not closed-loop | ✅ | Fixed — `getActiveFocusScope?` added to `KbRetrievalToolDeps` + `KbRetrievalRuntimeState` implements both save/get |
| 3 | handle/evidence mapping lifecycle unclear — per-turn vs per-session undefined, no actual implementation | ✅ | Fixed — `KbRetrievalRuntimeState` created as per-turn instance; throw on duplicate; clearMappings() provided |
| 4 | Module-level `evidenceHandleCounter` / `previousEvidenceHandleCounter` — cross-session pollution | 🔴 | Fixed — replaced with per-turn allocator via deps |
| 5 | Duplicate `sanitizeTitle` / `sanitizeSnippet` / `containsInternalReference` across 4+ adapters | 🟡 | Fixed — extracted to `adapters/kb-safe-text.ts` |
| 6 | Progress doc overstated A-F as "Done" | 🟡 | Fixed — recategorized as "migrated-unverified" |
| 7 | callLlmObject structured path didn't pass reasoningEffort/providerOptions | 🔴 | Fixed — both structured and raw fallback paths now pass |
| 8 | footerReferences always empty in v3 | 🔴 | Fixed — safeEvidenceHandles + displayedReferenceHandles merged and resolved |
| 9 | Handle duplicate silently skipped | 🟡 | Fixed — throw on duplicate; callers catch and return adapter_failed |
| 10 | read_candidate_docs ignored focus scope | 🟡 | Fixed — resolveDocs filters by activeFocusScope.docIds |
| 11 | inputHint inaccurate for focus_doc_scope/read_previous_evidence/answer | 🟡 | Fixed — correct parameter descriptions |

## Blockers

- ~~`KbRetrievalToolDeps` interface has no runtime implementation~~ → Resolved.
- ~~`saveActiveFocusScope` / `getActiveFocusScope` not wired~~ → Resolved.
- ~~No v3 PlannerLoop / ExecutionEngine wired to LLM~~ → Resolved: `runV3AgenticRagTurn` uses `callLlmObject`.
- ~~`activeFocusScope` does not yet influence `getScope()` narrowing~~ → Resolved: `getEffectiveScope()` returns `custom_docs` scope when focus active.
- ~~v3 `decideNextStep` prompt is minimal — no conversation history / recent context injected yet~~ → Resolved: conversationTurns injected via KbRetrievalRuntimeState.
- ~~v3 Planner LLM params not passed~~ → Resolved: chatModelSelection + reasoningEffort + providerOptions passed to structured + raw fallback paths.
- ~~footerReferences always empty~~ → Resolved: safeEvidenceHandles + displayedReferenceHandles merged and resolved via resolveFooterReferences.
- ~~Handle uniqueness not guaranteed~~ → Resolved: per-turn allocator; throw on duplicate.
- ~~No inputHint for Planner~~ → Resolved: inputHint on all 8 v3 tools with correct parameter descriptions.
- ~~read_candidate_docs ignores focus scope~~ → Resolved: resolveDocs filters by activeFocusScope.docIds.
- v3 main entry **not production-verified**; runtime is v3-only since Stage H runtime cutover.
- v3 answer is non-streaming (batch output via onAnswerChunk).
- `buildReasoningProviderOptions` now delegates to `resolveProviderProfile` + `buildReasoningProviderOptionsFromProfile`; returns `undefined` for non-mimo providers or `effort === "none"`. Reasoning control still limited to mimo family by profile config.
- Legacy graph/harness/actions/planner still contain old flow references. They remain quarantined; physical deletion blocked until v3 production-verified and CodeGraph confirms zero runtime in-edges.
- Raw fallback providerOptions only extracts reasoning_effort; does not forward other provider-specific options (temperature etc. handled by existing buildBody logic).
- Stage U–Z/AA final build/tsc: ✅ `npm run build` 2258 modules, `npx.cmd tsc --noEmit` exit 0.
- Stage AB storage split final build/tsc: ✅ `npm run build` 2258 modules, `npx.cmd tsc --noEmit` exit 0. CodeGraph impact audit is the next gate before physical legacy deletion.
- Stage AE prompt cleanup final build/tsc: ✅ prompt construction now uses natural scope labels and skill/tool capability wording; `npx.cmd tsc --noEmit` exit 0; `npm run build` 2258 modules.
- Stage AF prompt purity final build/tsc: ✅ `npx.cmd tsc --noEmit` exit 0; `npm run build` 2258 modules, dist/index.js 3,470.62 kB (gzip 1,082.02 kB); pre-existing warnings only.
- `workbench-v3-runtime-test.md` is the primary manual runtime check doc; it is updated alongside this progress doc.

## Old Code Deletion Plan

1. Finish v3 Planner-visible KB tools one stage at a time.
2. Connect v3 to the main QA entry with no legacy fallback.
3. Move chat storage to notebrain split files.
4. Confirm UI no longer depends on legacy graph/harness for normal turns.
5. Verify no runtime in-edges remain for legacy modules.
6. Delete legacy graph, harness, actions, planner, old runtime, old safety, old evidence, and obsolete wrappers.

**Current status (Stage AF):**

- Step 2 ✅ — runtime is v3-only. `agentic-rag-mode-flow.ts` no longer calls `runAgenticRagTurn`.
- Step 3 ✅ — chat session runtime now uses split `notebrain/chat/` storage; old `kb-chat-sessions` remains only for one-time migration.
- Step 4 ✅ — old continue-search UI flow is removed; manual end-to-end UI verification is still pending.
- Step 5 ⏳ — CodeGraph impact report pending.
- Step 6 ⛔ — physical deletion blocked on Step 5.
- Tool / Skill / Planner decoupling (Stages U, V, W, X) is implemented; awaiting final build/tsc confirmation and CodeGraph audit.

### Stage AG — answer → progress_answer + final_answer (current)

- **Deleted**: 基于 answer body 自然语言的正则/关键词判断逻辑（当前代码中不存在此类逻辑，已确认安全）。
- **New**: `progress_answer` 全局 system tool — 过程输出，不终止 Agent loop（decision.type="tool"）。
- **Renamed**: `answer` → `final_answer` 全局 system tool — 最终回答，终止 Agent loop（decision.type="answer"）。
- `PlannerDecision` 接受 `toolName: "final_answer"` 或 `toolName: "answer"`（legacy 兼容），归一化为 `"final_answer"`。
- `ExecutionEngine` 中 answer 提取适配 `final_answer`。
- `ToolOutputKind` 新增 `"progress"` 类型。
- KB Skill `BUILTIN_KB_SKILL_TOOL_NAMES` 不含 `final_answer`/`progress_answer`/`answer`。
- `runV3AgenticRagTurn` prompt 明确说明 `progress_answer` vs `final_answer` 语义差异。
- Planner 必须显式选择 `progress_answer` 或 `final_answer`，不由代码根据文本内容判断。
- `npm run build`: ✅ 2260 modules, 3472 KB; `npx tsc --noEmit`: ✅ exit 0。

### Stage AK — references unification + DisplayReference main chain + progress UI + error observation + stop narrowing

- **final_answer 入参统一为 references**：`ALLOWED_ANSWER_KEYS` 加入 `references`；`assertAnswerArgsShape` 校验 `references?: string[]`；`extractAnswerDraft` 提取 `references`；`AnswerDraft` 保留 `references`，`displayedReferenceHandles` / `safeEvidenceHandles` 标为兼容字段；`runV3AgenticRagTurn` 合并 `draft.references + displayedReferenceHandles + safeEvidenceHandles` 后调用 `resolveDisplayReferences`；Planner prompt 示例改为 `references`。
- **DisplayReference 主链路**：`runV3` 使用 `resolveDisplayReferences` 解析引用；`resolveFooterReferences` 保留为兼容别名；`createAgenticRagWorkbench` 注入 `displayReferenceStore`，`resolveEvidenceHandles` 为兼容钩子；`final_answer` 只处理 Planner 显式传入的 `references`；`references` 为空时正常回答；`references` 解析失败返回结构化 observation。
- **候选 handle 与展示引用语义**：AI 可见安全 handle，底层真实 ID 仅在工具内部；search/list 产生的 handle 是 resourceId；read 工具产生的 handle 注册为 DisplayReference；UI 文案不暗示"已读证据"；`final_answer` 只叫"展示引用解析"。
- **progress_answer 真正展示给用户**：`ExecutionOutcome` 添加 `progressBody` 字段；`ExecutionEngine` 提取 `progress_answer` 的 body；`PlannerLoopResult` 添加 `progressBodies` 数组；`PlannerLoop` 收集所有 progressBody；`V3ProgressEvent` 添加 `kind`/`body` 字段；`runV3` 在 answer_ready 前通过 `onProgress` 推送 progress bodies。
- **结构化工具错误 observation**：`makeToolFailedObservation` 接受 `detail` 参数（`recoverable`/`field`/`expected`/`received`/`hint`）；所有错误调用点填充结构化信息；`validation_failed` 标记 `recoverable=true`；`execution_error`/`output_validation_failed`/`observation_format_failed` 标记 `recoverable=false`；`budget_exhausted`/`unavailable` 直接填充 facts 中的 `errorRecoverable`/`errorHint`；所有 message/hint 改为中文。
- **收窄 stop 和全局 prompt**：`STOP_DECISION_SCHEMA` 删除 `planner_declined_to_act`；stop 仅保留 `user_canceled`/`internal_aborted`；Planner prompt 中 stop 说明合并为一句，强调需要澄清或说明不能完成时用 `final_answer`。
- **文档同步**：`00-first-principles.md` / `agent-skill-workbench-v3-design.md` / `workbench-v3-progress.md` 已更新。
- **V3-only**：未 fallback 旧 run-agentic-rag-turn；未出现 GRAPH_START / LEGACY_FALLBACK_USED；Planner manifest 不含 read_docs / read_block_context；Planner-visible observation 不含真实 docId/blockId/path/internalMapping。
- 状态仍为 `runtime-testing`，不写 `production verified`。

### Stage AL — handle 兼容层删除，真实资源 ID 直传

- **PlannerDecision BLACKLIST_KEYS**：删除 `docId`/`blockId`/`notebookId`/`sourceDocIds`/`sourceBlockIds`，仅保留 `path`/`realPath`/`realDocId`/`realBlockId`/`internalMapping`。
- **planner-visible-data-guard**：不再禁止 `docId`/`blockId`/`notebookId`，仅禁止内部路径和映射。
- **final_answer**：`references` 从 `string[]`（resource IDs）改为 `ResourceRef[]`（结构化 `{sourceType, docId, blockId, url, title}`）。
- **answer.tool.ts**：删除 `assertSafeHandles` 和 `DisplayReferenceStore` 依赖。
- **ExecutionEngine**：`extractAnswerDraft` 简化，不再调用 `assertSafeResourceRef`。
- **Planner prompt**：改为"可以使用工具返回的 docId/blockId/url 作为后续参数"；final_answer 示例改为结构化 ResourceRef。
- **create-agentic-rag-workbench**：删除 `displayReferenceStore` 参数。
- `display-reference-store.ts`/`safe-resource-handle.ts`：保留为 dead code（仅 workbench/index.ts 导出，无运行时调用者）。
- `npm run build`: ✅ 2254 modules, 3476 KB; `npx tsc --noEmit`: ✅ exit 0。
