# Agent Workbench Refactoring — Task List

## Phase 1: Create new directory structure & migrate core contracts
- [ ] 1.1 Create `agent-workbench/` directory tree with sub-directories
- [ ] 1.2 Migrate & simplify `contracts/tool-contract.ts` (thin ToolContract)
- [ ] 1.3 Migrate `contracts/planner-decision.ts` (remove progress normalization)
- [ ] 1.4 Migrate `contracts/skill-contract.ts` (keep as-is, already thin)
- [ ] 1.5 Migrate & clean `contracts/turn-result.ts` (standardize event types)
- [ ] 1.6 Migrate `registries/tool-registry.ts` (add plannerVisible, remove EXECUTION_ONLY)
- [ ] 1.7 Migrate `registries/skill-registry.ts` (keep as-is)
- [ ] 1.8 Migrate `runtime/observation-store.ts` (keep as-is)

## Phase 2: Write agent-loop.ts (thin loop, no maxSteps)
- [ ] 2.1 Create `runtime/agent-loop.ts` — thin `while true` loop
- [ ] 2.2 Create `runtime/tool-executor.ts` — validate → execute → observe
- [ ] 2.3 Create `runtime/observation-log.ts` — observation accumulator
- [ ] 2.4 Create `runtime/planner-context-builder.ts` — build context + render prompt
- [ ] 2.5 Create `runtime/prompt-renderer.ts` — render context to planner prompt string
- [ ] 2.6 Create `runtime/turn-trace-store.ts` — debug trace storage

## Phase 3: Write tool implementations
- [ ] 3.1 Write `tools/system/final-answer.tool.ts` — answer tool
- [ ] 3.2 Write `tools/siyuan/list-knowledge-map.tool.ts` — structure tool (simplified observation)
- [ ] 3.3 Write `tools/siyuan/search-scope.tool.ts` — search tool (simplified observation)
- [ ] 3.4 Write `tools/siyuan/read-candidate-docs.tool.ts` — read tool (simplified observation)

## Phase 4: Write built-in skill as capability manual
- [ ] 4.1 Write `skills/builtin/knowledge-base-qa.skill.ts` — clean Chinese manual
- [ ] 4.2 Create `skills/builtin/index.ts` — skill registry helpers

## Phase 5: Create index.ts and update wiring
- [ ] 5.1 Create `agent-workbench/index.ts` — public exports
- [ ] 5.2 Update `create-agentic-rag-workbench.ts` to use new structure
- [ ] 5.3 Update `run-v3-agentic-rag-turn.ts` to use new agent-loop
- [ ] 5.4 Update `agentic-rag-mode-flow.ts` imports (if needed)

## Phase 6: Delete old patches and verify
- [ ] 6.1 Delete `progress-answer` from Planner manifest
- [ ] 6.2 Remove all `maxSteps` / `devUnlimitedSteps` cruft
- [ ] 6.3 Verify `npm run build` passes
- [ ] 6.4 Verify `npx tsc --noEmit` passes
