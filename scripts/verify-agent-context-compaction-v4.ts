import assert from "node:assert/strict";
import type { ChatMessage } from "../src/features/kb/types/chat";
import {
  buildPromptBudget,
  DEFAULT_PROVIDER_STATIC_RESERVE_TOKENS,
  DEFAULT_NEXT_TOOL_RESULT_HEADROOM_TOKENS,
  resolveIdleProviderReserve,
  resolveRuntimeObservationBudget,
  estimateContextUsage,
  RUNTIME_TOOL_RESULT_MAX_CHARS,
  RUNTIME_TOOL_RESULT_MAX_TOKENS,
  estimateTextTokensConservative,
  estimateValueTokens,
  PROMPT_HARD_THRESHOLD_RATIO,
  PROMPT_SOFT_THRESHOLD_RATIO,
} from "../src/features/kb/types/context-usage";
import {
  isCompactionSnapshotStale,
  markCompactionSnapshotStale,
  runContextCompaction,
  estimateCompactionPromptTokens,
  compactionProviderInputBudget,
  selectNextCompactionBatch,
  selectCompactionTurns,
} from "../src/features/kb/services/context-compression";
import {
  buildConversationContext,
  buildUncoveredVerbatimAgentMessages,
} from "../src/features/kb/services/agent-workbench/runtime/conversation-context-builder";
import { renderContextInstructions } from "../src/features/kb/services/agent-core/prompts/context-instruction-renderer";
import { compactAgentMessages, compactAgentSessionMessagesForStorage } from "../src/features/kb/services/agent-core/messages/message-compactor";
import { normalizeToolCallMessages } from "../src/features/kb/services/agent-core/messages/message-normalizer";
import { toPersistedConversation, parseLegacyConversationRecord } from "../src/features/kb/services/session/kb-chat-session-storage";
import type { AgentMessage } from "../src/features/kb/services/agent-core/messages/agent-message";
import type { NativeTool } from "../src/features/kb/services/agent-core/tools/native-tool";
import { NativeToolRegistry, resolveNativeToolReadOnly } from "../src/features/kb/services/agent-core/tools/native-tool-registry";

function makeMessages(turnCount: number): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let index = 1; index <= turnCount; index += 1) {
    messages.push({ id: `user-${index}`, role: "user", content: `第 ${index} 轮问题 ${"细节 ".repeat(index)}`, createdAt: index * 2 });
    messages.push({ id: `assistant-${index}`, role: "assistant", content: `第 ${index} 轮安全回答`, createdAt: index * 2 + 1, isComplete: true });
  }
  return messages;
}

const budget = buildPromptBudget({
  contextWindowTokens: 12_000,
  maxOutputTokens: 1_000,
  nextToolResultHeadroomTokens: 500,
  systemPrompt: "真实系统提示",
  contextInstructions: "真实上下文指令",
  activeToolDefinitions: [{ name: "read_docs", parameters: { type: "object" } }],
  currentQuestion: "当前问题",
});
assert.equal(budget.softThresholdTokens, Math.floor(budget.effectiveInputBudget * PROMPT_SOFT_THRESHOLD_RATIO));
assert.equal(budget.hardThresholdTokens, Math.floor(budget.effectiveInputBudget * PROMPT_HARD_THRESHOLD_RATIO));
assert.ok(budget.breakdown.systemPrompt > 0);
assert.ok(budget.breakdown.activeToolDefinitions > 0);

const messages = makeMessages(8);
const withCurrentUser: ChatMessage[] = [
  ...messages,
  { id: "current-user", role: "user", content: "当前用户问题不应进入过去轮次", createdAt: 99 },
  { id: "pending", role: "assistant", content: "", createdAt: 100, isComplete: false, agentStatus: "streaming" },
];
const selection = selectCompactionTurns({ messages: withCurrentUser, currentUserMessageId: "current-user", promptBudget: budget, trigger: "auto" });
assert.equal(selection.recentTurns.length, 6);
assert.deepEqual(selection.compactableTurns.map((turn) => turn.turnIndex), [1, 2]);
assert.ok(!selection.completeTurns.some((turn) => turn.user.id === "current-user"));
assert.ok(!selection.completeTurns.some((turn) => turn.assistant.id === "pending"));

const uncoveredWithoutSnapshot = buildUncoveredVerbatimAgentMessages({ messages, currentUserMessageId: "user-8" });
assert.equal(uncoveredWithoutSnapshot.length, 14, "无 snapshot 时必须发送全部已完成历史");
assert.deepEqual(uncoveredWithoutSnapshot.map((message) => message.role), [
  "user", "assistant", "user", "assistant", "user", "assistant", "user", "assistant",
  "user", "assistant", "user", "assistant", "user", "assistant",
]);

const noDuplicateBudget = buildPromptBudget({
  providerMessages: [
    { role: "system", content: "系统" },
    { role: "system", content: "上下文" },
    { role: "user", content: "当前问题" },
  ],
  providerTools: [{ name: "read_docs" }],
  systemPrompt: "系统",
  contextInstructions: "上下文",
  currentQuestion: "当前问题",
  activeToolDefinitions: [{ name: "read_docs" }],
});
const explicitBudget = buildPromptBudget({
  systemPrompt: "系统",
  contextInstructions: "上下文",
  currentQuestion: "当前问题",
  activeToolDefinitions: [{ name: "read_docs" }],
});
assert.equal(noDuplicateBudget.inputTokens, explicitBudget.inputTokens, "实际 payload 不能因重复组件 double count");
assert.ok(estimateTextTokensConservative("中文🙂") > estimateTextTokensConservative("plain ascii"));
assert.equal(DEFAULT_NEXT_TOOL_RESULT_HEADROOM_TOKENS, resolveRuntimeObservationBudget(128_000));
assert.ok(DEFAULT_NEXT_TOOL_RESULT_HEADROOM_TOKENS < RUNTIME_TOOL_RESULT_MAX_TOKENS);
assert.ok(estimateTextTokensConservative("x".repeat(RUNTIME_TOOL_RESULT_MAX_CHARS)) > 0);
assert.ok(estimateTextTokensConservative("中".repeat(RUNTIME_TOOL_RESULT_MAX_CHARS)) > 0);

function registerSafetyTool(
  registry: NativeToolRegistry,
  name: string,
  readOnly: boolean,
  isReadOnlyCall?: (args: Record<string, unknown>) => boolean,
): void {
  registry.register({
    name,
    title: name,
    description: name,
    parameters: { type: "object", properties: {} },
    readOnly,
    providerVisible: true,
    source: "builtin",
    safety: { readOnly, canWrite: !readOnly },
    isReadOnlyCall,
    execute: async () => ({ ok: true, content: "{}", summary: "ok" }),
  } as NativeTool);
}

const safetyRegistry = new NativeToolRegistry();
registerSafetyTool(safetyRegistry, "notebrain_file", false, (args) => args.action === "read_file");
registerSafetyTool(safetyRegistry, "siyuan_asset", false, (args) => {
  const nested = args.args && typeof args.args === "object" ? args.args as Record<string, unknown> : args;
  return args.action === "workspace_file" && nested.action === "read_dir";
});
for (const name of ["homepage_components", "notification_manage", "automation_manage", "skill_manage", "mcp_manage"]) {
  registerSafetyTool(safetyRegistry, name, false, (args) => {
    const action = typeof args.action === "string" ? args.action : "";
    return action.endsWith(".get") || action.endsWith(".list") || ["read", "list", "overview"].includes(action);
  });
}
const safetyResolver = (toolName: string, args?: Record<string, unknown>) =>
  resolveNativeToolReadOnly(safetyRegistry, toolName, args);
assert.equal(safetyResolver("notebrain_file", { action: "write_file" }), false);
assert.equal(safetyResolver("notebrain_file", { action: "read_file" }), true);
assert.equal(safetyResolver("siyuan_asset", { action: "workspace_file", args: { action: "read_dir" } }), true);
assert.equal(safetyResolver("homepage_components", { action: "weather.instance.get" }), true);
for (const name of ["homepage_components", "notification_manage", "automation_manage", "skill_manage", "mcp_manage"]) {
  assert.equal(safetyResolver(name, { action: "write" }), false);
}

const writeAndReads = normalizeToolCallMessages([
  { role: "assistant", content: "", toolCalls: [
    { id: "write-call", name: "notebrain_file", arguments: JSON.stringify({ action: "write_file" }) },
    { id: "read-call-1", name: "notebrain_file", arguments: JSON.stringify({ action: "read_file" }) },
    { id: "read-call-2", name: "siyuan_asset", arguments: JSON.stringify({ action: "workspace_file", args: { action: "read_dir" } }) },
  ] },
  { role: "tool", toolCallId: "write-call", name: "notebrain_file", content: JSON.stringify({ ok: true, status: "success", data: { content: "写入完成" } }) },
  { role: "tool", toolCallId: "read-call-1", name: "notebrain_file", content: "中".repeat(20_000) },
  { role: "tool", toolCallId: "read-call-2", name: "siyuan_asset", content: "中".repeat(20_000) },
]);
const compactedWithSafety = compactAgentMessages(writeAndReads, {
  resolveCallReadOnly: safetyResolver,
  maxObservationTokens: 500,
});
const preservedWrite = compactedWithSafety.find((message) => message.role === "tool" && message.toolCallId === "write-call");
assert.ok(preservedWrite && preservedWrite.content.includes("success"), "write outcome must survive observation compaction");
assert.ok(compactedWithSafety.filter((message) => message.role === "tool").every((message) => estimateTextTokensConservative(message.content) < 500));
assert.ok(compactedWithSafety.some((message) => message.role === "assistant" && message.toolCalls?.some((call) => call.id === "write-call")));
assert.ok(compactedWithSafety.filter((message) => message.role === "tool").every((message) => {
  const calls = compactedWithSafety.filter((candidate) => candidate.role === "assistant")
    .flatMap((candidate) => candidate.toolCalls ?? []).map((call) => call.id);
  return calls.includes(message.toolCallId);
}), "tool results must remain paired with assistant calls");

const manualUsage = estimateContextUsage({
  messages,
  attachedDocCount: 0,
  contextWindowTokens: 12_000,
  historicalMessages: buildUncoveredVerbatimAgentMessages({ messages, currentUserMessageId: "user-8" }),
  currentRunMessages: [{ role: "user", content: "当前问题" }],
  providerStaticReserveTokens: resolveIdleProviderReserve(12_000),
  estimateKind: "conversation_context",
});
assert.equal(manualUsage.estimateKind, "conversation_context");
assert.equal(manualUsage.budget?.breakdown.providerStaticReserve, resolveIdleProviderReserve(12_000));
assert.equal(manualUsage.budget?.nextToolResultHeadroomTokens, resolveRuntimeObservationBudget(12_000));
assert.ok((manualUsage.budget?.safetyMarginTokens ?? 0) > 0);
assert.equal(DEFAULT_PROVIDER_STATIC_RESERVE_TOKENS, resolveIdleProviderReserve(128_000));
const fullUsage = estimateContextUsage({
  messages,
  attachedDocCount: 0,
  systemPrompt: "系统提示",
  contextInstructions: "上下文指令",
  providerMessages: [{ role: "system", content: "系统提示" }, { role: "system", content: "上下文指令" }],
  providerTools: [{ name: "homepage_components" }],
});
assert.equal(fullUsage.estimateKind, "full_provider_prompt");
assert.ok((fullUsage.breakdown.prompt?.systemPrompt ?? 0) > 0);
assert.ok((fullUsage.breakdown.prompt?.providerTools ?? 0) > 0);

const beforeCompaction = JSON.stringify(messages);
const first = await runContextCompaction({ messages, promptBudget: budget, trigger: "manual" });
assert.equal(first.success, true);
assert.ok(first.snapshot);
assert.equal(first.snapshot?.version, 2);
assert.equal(JSON.stringify(messages), beforeCompaction);
assert.equal(first.snapshot?.coveredThroughTurnIndex, 2);
assert.equal(first.snapshot?.generation, 1);
assert.ok((first.snapshot?.estimatedTokens ?? 0) >= 0);
assert.ok(!JSON.stringify(first.snapshot?.state).includes("api_key"));

const continued = makeMessages(9);
const second = await runContextCompaction({ messages: continued, previousSnapshot: first.snapshot, promptBudget: budget, trigger: "auto" });
assert.equal(second.success, true);
assert.equal(second.snapshot?.generation, 2);
assert.ok((second.compactedTurnIndices?.length ?? 0) >= 1);
const uncoveredAfterSnapshot = buildUncoveredVerbatimAgentMessages({ messages: continued, currentUserMessageId: "user-9", compactionSnapshot: second.snapshot });
assert.ok(uncoveredAfterSnapshot.length > 0 && uncoveredAfterSnapshot.length <= 14);

const edited = continued.map((message) => message.id === "user-1" && message.role === "user" ? { ...message, content: "已编辑的问题" } : message);
assert.equal(isCompactionSnapshotStale(second.snapshot, edited), true);
assert.equal(markCompactionSnapshotStale(second.snapshot)?.stale, true);

const conversation = buildConversationContext({ messages: continued, currentUserMessageId: "user-9", currentQuestion: "当前问题必须保留原文", compactionSnapshot: second.snapshot, usageRatio: 0.5 });
assert.equal("userQuestion" in conversation.currentTurn, false);
assert.equal(conversation.compactionStatus.coveredThroughTurnIndex, second.snapshot?.coveredThroughTurnIndex);
assert.ok(conversation.manifest.entries.some((entry) => entry.source === "compaction-snapshot"));
assert.equal(conversation.recentTurns.length, uncoveredAfterSnapshot.length / 2);
const rendered = renderContextInstructions({ conversationContext: conversation });
assert.equal(rendered.includes("第 9 轮问题"), false, "历史正文不能再被 JSON 塞进 system context");

const agentMessages: AgentMessage[] = normalizeToolCallMessages([
  { role: "user", content: "读取" },
  { role: "assistant", content: "", toolCalls: [{ id: "call-1", name: "read_docs", arguments: "{}" }] },
  { role: "tool", toolCallId: "call-1", name: "read_docs", content: JSON.stringify({ ok: true, data: { content: "x" } }) },
]);
const runtimeCompacted = compactAgentMessages(agentMessages);
const storageCompacted = compactAgentSessionMessagesForStorage(agentMessages);
assert.equal(runtimeCompacted.length, agentMessages.length);
assert.equal(storageCompacted.length, agentMessages.length);
assert.ok(runtimeCompacted.some((message) => message.role === "tool"));
assert.ok(!storageCompacted.some((message) => message.role === "system" && message.content.includes("Earlier conversation compacted")));
const pending = compactAgentMessages([
  { role: "assistant", content: "", toolCalls: [{ id: "pending-call", name: "read_docs", arguments: "{}" }] },
], { maxInputTokens: 100 });
assert.ok(pending.some((message) => message.role === "assistant" && message.toolCalls?.some((call) => call.id === "pending-call")));

const oversized = compactAgentMessages([
  { role: "user", content: "read" },
  { role: "assistant", content: "", toolCalls: [{ id: "read-call", name: "read_docs", arguments: "{}" }] },
  { role: "tool", toolCallId: "read-call", name: "read_docs", content: "x".repeat(20_000) },
], { maxInputTokens: 500 });
assert.ok(oversized.some((message) => message.role === "tool" && message.content.length < 20_000));

const dynamicBudget = buildPromptBudget({ contextWindowTokens: 3_000, maxOutputTokens: 600, nextToolResultHeadroomTokens: 300 });
const dynamicTurns = selectCompactionTurns({ messages: makeMessages(20), promptBudget: dynamicBudget, trigger: "auto" }).compactableTurns;
const firstBatch = selectNextCompactionBatch(dynamicTurns, 0, undefined, dynamicBudget);
assert.ok(firstBatch.batch.length > 0 || firstBatch.oversizedTurn);
assert.ok(estimateCompactionPromptTokens(undefined, firstBatch.batch) <= firstBatch.inputBudget);
const evolvedState = {
  currentGoal: "目标",
  userConstraints: [],
  importantDecisions: [],
  completedWork: ["上一批已完成"],
  currentState: ["状态"],
  unresolvedIssues: [],
  nextActions: [],
  importantReferences: [],
  verifiedWriteOutcomes: [],
};
const secondBatch = selectNextCompactionBatch(dynamicTurns, firstBatch.nextIndex, evolvedState, dynamicBudget);
assert.ok(secondBatch.batch.length > 0 || secondBatch.oversizedTurn);
assert.ok(estimateCompactionPromptTokens(evolvedState, secondBatch.batch) <= secondBatch.inputBudget);
const growthState = {
  ...evolvedState,
  currentState: ["中".repeat(10_000)],
  completedWork: ["中".repeat(10_000)],
};
const growthBatch = selectNextCompactionBatch(dynamicTurns, firstBatch.nextIndex, growthState, dynamicBudget);
assert.ok(growthBatch.batch.length > 0 || growthBatch.oversizedTurn, "fallback-grown state must recalculate the next batch");
assert.ok(growthBatch.batch.length === 0 || estimateCompactionPromptTokens(growthState, growthBatch.batch) <= growthBatch.inputBudget);
const oversizedTurnMessages: ChatMessage[] = [
  { id: "huge-user", role: "user", content: "中".repeat(20_000), createdAt: 1 },
  { id: "huge-assistant", role: "assistant", content: "回答", createdAt: 2, isComplete: true },
  ...makeMessages(3),
];
const oversizedTurns = selectCompactionTurns({ messages: oversizedTurnMessages, promptBudget: dynamicBudget, trigger: "hard" }).compactableTurns;
const oversizedPlan = selectNextCompactionBatch(oversizedTurns, 0, undefined, dynamicBudget);
assert.equal(oversizedPlan.batch.length, 0, "oversized safeTurn must use deterministic fallback");
assert.ok(oversizedPlan.oversizedTurn, "oversized safeTurn must never be sent to the LLM");

const compaction128Budget = buildPromptBudget({ contextWindowTokens: 128_000 });
const compaction128ProviderBudget = compactionProviderInputBudget(compaction128Budget);
const compaction128WithSmallHeadroom = buildPromptBudget({
  contextWindowTokens: 128_000,
  nextToolResultHeadroomTokens: 4_096,
});
assert.equal(
  compactionProviderInputBudget(compaction128Budget),
  compactionProviderInputBudget(compaction128WithSmallHeadroom),
  "compaction input budget must not include Agent tool-result headroom",
);
assert.ok(compaction128ProviderBudget > compaction128Budget.effectiveInputBudget);

const longSnapshotState = {
  currentGoal: "持续目标",
  userConstraints: [],
  importantDecisions: [],
  completedWork: [],
  currentState: Array.from({ length: 14 }, (_, index) => `状态 ${index} ${"中".repeat(300)}`),
  unresolvedIssues: [],
  nextActions: [],
  importantReferences: [],
  verifiedWriteOutcomes: [],
};
assert.ok(estimateValueTokens(longSnapshotState) >= 4_000 && estimateValueTokens(longSnapshotState) <= 6_000);
const longSnapshotTurns = selectCompactionTurns({
  messages: makeMessages(12),
  promptBudget: compaction128Budget,
  trigger: "auto",
}).compactableTurns;
const longSnapshotPlan = selectNextCompactionBatch(
  longSnapshotTurns,
  0,
  longSnapshotState,
  compaction128Budget,
);
assert.ok(longSnapshotPlan.batch.length > 0, "128k snapshot must leave a normal LLM compaction batch");
assert.equal(longSnapshotPlan.oversizedTurn, undefined);
assert.ok(estimateCompactionPromptTokens(longSnapshotState, longSnapshotPlan.batch) <= compaction128ProviderBudget);

const maxSnapshotState = {
  ...longSnapshotState,
  currentState: Array.from({ length: 20 }, (_, index) => `当前状态 ${index} ${"中".repeat(320)}`),
  completedWork: Array.from({ length: 20 }, (_, index) => `完成项 ${index} ${"中".repeat(320)}`),
};
const compaction200Budget = buildPromptBudget({ contextWindowTokens: 200_000 });
const compaction200ProviderBudget = compactionProviderInputBudget(compaction200Budget);
const maxSnapshotPlan = selectNextCompactionBatch(
  longSnapshotTurns,
  0,
  maxSnapshotState,
  compaction200Budget,
);
assert.ok(maxSnapshotPlan.batch.length > 0, "200k near-limit snapshot must continue LLM folding");
assert.ok(estimateCompactionPromptTokens(maxSnapshotState, maxSnapshotPlan.batch) <= compaction200ProviderBudget);

let foldCursor = 0;
let foldBatches = 0;
while (foldCursor < longSnapshotTurns.length && foldBatches < 100) {
  const foldPlan = selectNextCompactionBatch(
    longSnapshotTurns,
    foldCursor,
    longSnapshotState,
    compaction128Budget,
  );
  assert.ok(
    foldPlan.batch.length === 0
      ? !!foldPlan.oversizedTurn
      : estimateCompactionPromptTokens(longSnapshotState, foldPlan.batch) <= compaction128ProviderBudget,
  );
  foldCursor = foldPlan.nextIndex;
  foldBatches += 1;
}
assert.equal(foldCursor, longSnapshotTurns.length, "large history must advance through bounded compaction batches");

const observationBudgets = [32_000, 64_000, 128_000, 200_000].map(resolveRuntimeObservationBudget);
assert.deepEqual(observationBudgets, [...observationBudgets].sort((a, b) => a - b));
assert.ok(observationBudgets[0] < RUNTIME_TOOL_RESULT_MAX_TOKENS);
assert.equal(observationBudgets[3], RUNTIME_TOOL_RESULT_MAX_TOKENS);
for (const contextWindowTokens of [32_000, 64_000, 128_000, 200_000]) {
  const modelBudget = buildPromptBudget({ contextWindowTokens });
  assert.ok(modelBudget.effectiveInputBudget > 0);
  assert.equal(modelBudget.nextToolResultHeadroomTokens, resolveRuntimeObservationBudget(contextWindowTokens));
}
const smallModelBudget = buildPromptBudget({ contextWindowTokens: 32_000 });
assert.ok(smallModelBudget.effectiveInputBudget > 20_000);
const smallRuntimeCompacted = compactAgentMessages(normalizeToolCallMessages([
  { role: "assistant", content: "", toolCalls: [{ id: "small-read", name: "read_docs", arguments: "{}" }] },
  { role: "tool", toolCallId: "small-read", name: "read_docs", content: "中".repeat(20_000) },
]), {
  maxObservationTokens: smallModelBudget.nextToolResultHeadroomTokens,
  maxToolResultTokens: smallModelBudget.nextToolResultHeadroomTokens,
});
assert.ok(smallRuntimeCompacted.some((message) => (
  message.role === "tool"
    && estimateTextTokensConservative(message.content) <= smallModelBudget.nextToolResultHeadroomTokens
)));
assert.ok(resolveIdleProviderReserve(32_000) < resolveIdleProviderReserve(128_000));
assert.ok(resolveIdleProviderReserve(128_000) < RUNTIME_TOOL_RESULT_MAX_TOKENS);

const uiUsage = estimateContextUsage({
  messages: [],
  attachedDocCount: 0,
  contextWindowTokens: 128_000,
  providerMessages: [{ role: "system", content: "系统" }],
  providerTools: [{ name: "homepage_components" }],
});
assert.equal(uiUsage.estimatedTokens, uiUsage.budget?.inputTokens);
assert.equal(
  Math.round(uiUsage.usageRatio * 100),
  Math.round((uiUsage.estimatedTokens / (uiUsage.budget?.effectiveInputBudget ?? 1)) * 100),
  "context percentage and displayed token denominator must use effective input budget",
);

const legacy = parseLegacyConversationRecord({ id: "legacy-1", title: "旧版", schemaVersion: 2, messages: [
  { role: "user", content: "旧问题", attachedDocs: [{ docId: "doc-1", title: "资料", source: "manual_search" }] },
  { role: "assistant", content: "旧回答", compacted: true, citationSegments: [{ text: "引用", citationIds: [0] }], citedReferences: [{ index: 0, docTitle: "资料", headingPathText: "H1", sourceBlockIds: ["b1"] }] },
  { role: "tool", content: "secret" },
  { role: "system", content: "runtime" },
] }, { id: "legacy-1" });
assert.equal(legacy.kind, "legacy");
assert.equal(legacy.readOnly, true);
assert.equal(legacy.messages.length, 2);
assert.equal(legacy.latestCompactionSnapshot, undefined);
assert.equal(toPersistedConversation(legacy).latestCompactionSnapshot, undefined);
assert.equal(legacy.messages[0].role === "user" && legacy.messages[0].attachedDocs?.[0].docId, "doc-1");
assert.equal(legacy.messages[1].role === "assistant" && legacy.messages[1].citationSegments?.[0].citationIds[0], 0);
assert.equal(legacy.ignoredInternalCount, 2);
const corruptedLegacy = parseLegacyConversationRecord({ id: "corrupt", title: "仍可见", messages: [{ role: "user", content: "ok" }, { role: "assistant", content: 123 }, { role: "tool", content: "ignored" }] }, { id: "fallback" });
assert.equal(corruptedLegacy.corrupted, true);
assert.equal(corruptedLegacy.title, "仍可见");
assert.equal(corruptedLegacy.unparseableVisibleCount, 1);
assert.equal(corruptedLegacy.ignoredInternalCount, 1);

console.log("verify-agent-context-compaction-v4: extended assertions passed");
