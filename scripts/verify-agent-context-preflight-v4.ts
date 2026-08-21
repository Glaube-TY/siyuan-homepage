import assert from "node:assert/strict";
import type { AgentMessage } from "../src/features/kb/services/agent-core/messages/agent-message";
import { dispatchToolCalls } from "../src/features/kb/services/agent-core/loop/dispatch-tool-calls";
import { NativeToolAgentLoop } from "../src/features/kb/services/agent-core/loop/native-tool-agent-loop";
import type { AgentStreamEvent } from "../src/features/kb/services/agent-core/loop/stream-event";
import type { AgentChatRequest, AgentProviderEvent, ProviderAdapter } from "../src/features/kb/services/agent-core/providers/provider-adapter";
import { normalizeProviderError, AgentProviderError } from "../src/features/kb/services/agent-core/providers/provider-error";
import { AllowingConfirmationBridge } from "../src/features/kb/services/agent-core/permissions/confirmation-bridge";
import type { NativeTool, ToolExecutionResult } from "../src/features/kb/services/agent-core/tools/native-tool";
import { NativeToolRegistry, ProviderToolsetController, selectProviderVisibleTools } from "../src/features/kb/services/agent-core/tools/native-tool-registry";
import {
  nativeToolToProviderBudgetDefinition,
  nativeToolsToAnthropicTools,
  nativeToolsToGeminiFunctionDeclarations,
  nativeToolsToOpenAITools,
} from "../src/features/kb/services/agent-core/tools/tool-schema-converter";
import { resolvePreflightCompression } from "../src/features/kb/services/orchestration/agent-workbench-mode-flow";
import type { KbSessionState } from "../src/features/kb/types/session";
import { mapAgentErrorToUserFacing } from "../src/features/kb/services/agent-workbench/runtime/user-facing-agent-error";
import { OPENAI_COMPATIBLE_CAPABILITIES } from "../src/features/kb/services/agent-core/providers/provider-capabilities";
import { parseToolResultContentEnvelope } from "../src/features/kb/services/agent-core/tools/tool-execution-result";
import { createAgentToolHelpTool } from "../src/features/kb/services/agent-workbench/tools/aggregate/agent-tool-help.tool";
import { DEFAULT_EXTERNAL_SKILL_SETTINGS, DEFAULT_MCP_SETTINGS } from "../src/features/kb/constants/default-settings";
import { buildPromptBudget, estimateValueTokens, resolveManualCompressionPresentation } from "../src/features/kb/types/context-usage";
import { runContextCompaction, selectCompactionTurns } from "../src/features/kb/services/context-compression";
import { buildAgentContextInstructions } from "../src/features/kb/services/agent-workbench/runtime/agent-context-instruction-builder";
import { buildConversationContext, buildUncoveredVerbatimAgentMessages } from "../src/features/kb/services/agent-workbench/runtime/conversation-context-builder";
import { getCompleteConversationTurns } from "../src/features/kb/services/agent-workbench/runtime/conversation-turns";
import { createAgentWorkbenchRuntime } from "../src/features/kb/services/agent-workbench/runtime/create-agent-workbench";
import { createNativeToolRegistryFromWorkbench } from "../src/features/kb/services/agent-core/tools/workbench-tool-adapter";
import { buildAgentSystemPrompt } from "../src/features/kb/services/agent-core/prompts/system-prefix";
import { getAgentProfile, KNOWLEDGE_CHAT_AGENT_PROFILE_ID } from "../src/features/agent-platform/agent-profile";
import { setNotebrainPlugin } from "../src/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import {
  formatWorkbenchProcessStats,
  resolveWorkbenchFinalStatus,
} from "../src/features/kb/services/agent-workbench/presentation/tool-step-presentation";

function makeTool(name: string, description = "tool"): NativeTool {
  const result: ToolExecutionResult = { ok: true, content: "{}", summary: "ok" };
  return {
    name,
    title: name,
    description,
    parameters: {
      type: "object",
      properties: { value: { type: "string" } },
      additionalProperties: false,
    },
    readOnly: true,
    parallelSafe: true,
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: true },
    async execute() { return result; },
  };
}

function makeSchemaOverflowTool(name = "real_schema_overflow"): NativeTool {
  const tool = makeTool(name, "small provider-visible description");
  tool.parameters = {
    type: "object",
    properties: {
      payload: {
        type: "string",
        description: "x".repeat(40_000),
      },
    },
    additionalProperties: false,
  };
  return tool;
}

function emptyState(): KbSessionState {
  return { error: "", asking: false, qaError: "", messages: [] };
}

async function verifyNoHistoryDoesNotCompact(): Promise<void> {
  let compactionCalls = 0;
  const state = emptyState();
  const hugeTool = makeSchemaOverflowTool("siyuan_asset");
  const result = await resolvePreflightCompression({
    getState: () => state,
    updateState: () => undefined,
    actualPromptContext: {
      systemPrompt: "Agent",
      contextInstructions: "",
      activeToolDefinitions: [hugeTool],
      currentQuestion: "普通问题",
      historicalMessages: [],
      contextWindowTokens: 8_192,
      maxOutputTokens: 512,
      toolsetReduced: true,
      rebuildProviderContext: (_context, historicalMessages) => ({
        contextInstructions: "",
        historicalMessages,
        manifest: { entries: [] },
      }),
    },
    currentUserMessageId: "current",
    chatModelSelection: null,
    abortSignal: undefined,
    persistConversationNow: undefined,
    runCompaction: async () => {
      compactionCalls += 1;
      return { success: false, reason: "no_compactable_turns" as const };
    },
  });
  assert.equal(compactionCalls, 0, "无历史首轮不得调用会话压缩");
  assert.equal(result.ok, false);
  assert.equal(result.failureCode, "provider_toolset_budget_exceeded");
  assert.equal(result.pressureSource, "tool_definitions");

  const history: AgentMessage[] = [
    { role: "user", content: "历史".repeat(2_000) },
    { role: "assistant", content: "回答".repeat(2_000) },
  ];
  const historyBudget = buildPromptBudget({
    providerMessages: [
      { role: "system", content: "Agent" },
      ...history,
      { role: "user", content: "当前问题" },
    ],
    historicalMessages: history,
    currentRunMessages: [{ role: "user", content: "当前问题" }],
    providerTools: [],
  });
  assert.equal(historyBudget.breakdown.toolDefinitionTokens, 0);
  assert.equal(historyBudget.breakdown.conversationTokens > historyBudget.breakdown.currentUserTokens, true);
}

class AnswerProvider implements ProviderAdapter {
  readonly id = "verify:context-preflight";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  requestCount = 0;
  seenToolNames: string[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requestCount += 1;
    this.seenToolNames = request.tools.map((tool) => tool.name);
    yield { type: "text_delta", delta: "首轮请求已建立" };
    yield { type: "done", finishReason: "stop" };
  }
}

class ToolCallProvider implements ProviderAdapter {
  readonly id = "verify:context-preflight-tool-call";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  requestCount = 0;
  readonly requests: AgentChatRequest[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requestCount += 1;
    this.requests.push(request);
    if (this.requestCount === 1) {
      yield {
        type: "tool_call_done",
        toolCall: {
          id: "verify-help-call",
          name: "agent_tool_help",
          arguments: JSON.stringify({ action: "list_tools" }),
        },
      };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "text_delta", delta: "已收到真实工具结果" };
    yield { type: "done", finishReason: "stop" };
  }
}

async function verifyDeferredProviderToolset(): Promise<void> {
  const registry = new NativeToolRegistry();
  registry.register(makeTool("agent_tool_help"));
  registry.register(makeTool("siyuan_asset", "asset"));
  for (let index = 0; index < 12; index += 1) {
    registry.register(makeTool(`large_tool_${index}`, "x".repeat(5_000)));
  }
  const selected = selectProviderVisibleTools({
    tools: registry.listProviderVisible(),
    question: "普通问题",
    contextWindowTokens: 32_000,
    maxOutputTokens: 2_000,
  });
  assert.equal(selected.activeProviderToolNames.has("agent_tool_help"), true);
  assert.equal(selected.toolsetReduced, true);
  assert.equal(selected.activeProviderToolNames.has("large_tool_11"), false);

  const explicit = selectProviderVisibleTools({
    tools: registry.listProviderVisible(),
    question: "请测试 siyuan_asset",
    contextWindowTokens: 32_000,
    maxOutputTokens: 2_000,
  });
  assert.equal(explicit.activeProviderToolNames.has("siyuan_asset"), true);

  const provider = new AnswerProvider();
  const controller = new ProviderToolsetController();
  controller.resolve({ tools: registry.listProviderVisible(), question: "普通问题", contextWindowTokens: 32_000, maxOutputTokens: 2_000 });
  const loop = new NativeToolAgentLoop({
    provider,
    toolRegistry: registry,
    providerToolsetController: controller,
    systemPrompt: "Agent",
    contextWindowTokens: 32_000,
    maxOutputTokens: 2_000,
  });
  const result = await loop.run("普通问题");
  assert.equal(result.status, "answer_ready");
  assert.deepEqual(provider.seenToolNames, selected.tools.map((tool) => tool.name));

  const activated = new Set<string>();
  const help = createAgentToolHelpTool({
    externalSkillSettings: DEFAULT_EXTERNAL_SKILL_SETTINGS,
    availableTools: [{ name: "siyuan_asset" }],
    onToolDescribed: (toolName) => { activated.add(toolName); },
  });
  const helpResult = await help.execute({} as never, { action: "describe_tool", toolName: "siyuan_asset" });
  assert.equal(helpResult.ok, true);
  assert.equal(activated.has("siyuan_asset"), true);
}

async function verifyHiddenDispatchAndErrors(): Promise<void> {
  let writeExecuteCalls = 0;
  let readExecuteCalls = 0;
  let activeController: ProviderToolsetController;
  const registry = new NativeToolRegistry();
  registry.register({
    ...makeTool("agent_tool_help"),
    async execute(args) {
      const target = typeof (args as Record<string, unknown>).target === "string"
        ? (args as Record<string, unknown>).target as string
        : "";
      return { ok: true, content: JSON.stringify(activeController.requestActivation(target)), summary: "requested" };
    },
  });
  registry.register({
    ...makeTool("hidden_write"),
    readOnly: false,
    parallelSafe: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    async execute() {
      writeExecuteCalls += 1;
      return { ok: true, content: "written", summary: "written" };
    },
  });
  registry.register({
    ...makeTool("hidden_read"),
    async execute() {
      readExecuteCalls += 1;
      return { ok: true, content: "read", summary: "read" };
    },
  });

  const writeController = new ProviderToolsetController();
  activeController = writeController;
  const writeStep = writeController.resolve({ tools: registry.listProviderVisible(), question: "test" });
  let confirmationCalls = 0;
  const sameBatchWrite = await dispatchToolCalls({
    calls: [
      { id: "help-write", name: "agent_tool_help", arguments: JSON.stringify({ target: "hidden_write" }) },
      { id: "hidden-write", name: "hidden_write", arguments: "{}" },
    ],
    registry,
    modelStepAllowedToolNames: new Set(writeStep.tools.map((tool) => tool.name)),
    ctx: { question: "test", callCounts: {} },
    bridge: {
      async request() {
        confirmationCalls += 1;
        return { type: "allow" as const };
      },
    },
  });
  assert.equal(parseToolResultContentEnvelope(sameBatchWrite.toolMessages[1].content)?.code, "tool_not_active");
  assert.equal(writeExecuteCalls, 0, "同批 Help 后隐藏写工具仍不得执行");
  assert.equal(confirmationCalls, 0, "同批隐藏写工具不得触发确认");
  assert.equal(writeController.getActiveProviderToolNames().has("hidden_write"), false, "当前 step 快照不得被 Help 改写");
  const nextWriteStep = writeController.resolve({ tools: registry.listProviderVisible(), question: "test" });
  assert.equal(nextWriteStep.activeProviderToolNames.has("hidden_write"), true, "Help 请求应在下一 Provider step 激活");

  const allowed = await dispatchToolCalls({
    calls: [{ id: "allowed-write", name: "hidden_write", arguments: "{}" }],
    registry,
    modelStepAllowedToolNames: new Set(nextWriteStep.tools.map((tool) => tool.name)),
    ctx: { question: "test", callCounts: {} },
    bridge: {
      async request() {
        confirmationCalls += 1;
        return { type: "allow" as const };
      },
    },
  });
  assert.equal(allowed.toolMessages.length, 1);
  assert.equal(writeExecuteCalls, 1);
  assert.equal(confirmationCalls, 1);

  const readController = new ProviderToolsetController();
  activeController = readController;
  const readStep = readController.resolve({ tools: registry.listProviderVisible(), question: "test" });
  const sameBatchRead = await dispatchToolCalls({
    calls: [
      { id: "help-read", name: "agent_tool_help", arguments: JSON.stringify({ target: "hidden_read" }) },
      { id: "hidden-read", name: "hidden_read", arguments: "{}" },
    ],
    registry,
    modelStepAllowedToolNames: new Set(readStep.tools.map((tool) => tool.name)),
    ctx: { question: "test", callCounts: {} },
    bridge: new AllowingConfirmationBridge(),
  });
  assert.equal(parseToolResultContentEnvelope(sameBatchRead.toolMessages[1].content)?.code, "tool_not_active");
  assert.equal(readExecuteCalls, 0, "同批 Help 后隐藏只读工具也不得执行");
  const nextReadStep = readController.resolve({ tools: registry.listProviderVisible(), question: "test" });
  const allowedRead = await dispatchToolCalls({
    calls: [{ id: "allowed-read", name: "hidden_read", arguments: "{}" }],
    registry,
    modelStepAllowedToolNames: new Set(nextReadStep.tools.map((tool) => tool.name)),
    ctx: { question: "test", callCounts: {} },
    bridge: new AllowingConfirmationBridge(),
  });
  assert.equal(allowedRead.toolMessages.length, 1);
  assert.equal(readExecuteCalls, 1, "下一 Provider step 才允许隐藏只读工具");

  const unexpected = normalizeProviderError(new TypeError("bad"));
  assert.equal(unexpected.code, "agent_workbench_unexpected_error");
  assert.equal(unexpected.errorName, "TypeError");
  const structured = normalizeProviderError(new AgentProviderError("budget", { code: "context_budget_exceeded" }));
  assert.equal(structured.code, "context_budget_exceeded");
  assert.match(mapAgentErrorToUserFacing({ agentErrorCode: "irreducible_context_overflow" }).message, /上下文窗口/);
}

async function verifyCompactionFullRebuildPromptState(): Promise<void> {
  const history: AgentMessage[] = [
    { role: "user", content: "第 1 轮长问题".repeat(600) },
    { role: "assistant", content: "第 1 轮长回答".repeat(600) },
    { role: "user", content: "第 2 轮长问题".repeat(600) },
    { role: "assistant", content: "第 2 轮长回答".repeat(600) },
    { role: "user", content: "第 3 轮长问题".repeat(600) },
    { role: "assistant", content: "第 3 轮长回答".repeat(600) },
    { role: "user", content: "第 4 轮长问题".repeat(600) },
    { role: "assistant", content: "第 4 轮长回答".repeat(600) },
  ];
  let state: KbSessionState = {
    error: "",
    asking: false,
    qaError: "",
    messages: [
      { id: "u1", role: "user", content: "第 1 轮长问题".repeat(600), createdAt: 1 },
      { id: "a1", role: "assistant", content: "第 1 轮长回答".repeat(600), createdAt: 2, isComplete: true },
      { id: "u2", role: "user", content: "第 2 轮长问题".repeat(600), createdAt: 3 },
      { id: "a2", role: "assistant", content: "第 2 轮长回答".repeat(600), createdAt: 4, isComplete: true },
      { id: "u3", role: "user", content: "第 3 轮长问题".repeat(600), createdAt: 5 },
      { id: "a3", role: "assistant", content: "第 3 轮长回答".repeat(600), createdAt: 6, isComplete: true },
      { id: "u4", role: "user", content: "第 4 轮长问题".repeat(600), createdAt: 7 },
      { id: "a4", role: "assistant", content: "第 4 轮长回答".repeat(600), createdAt: 8, isComplete: true },
      { id: "u5", role: "user", content: "第 5 轮当前问题", createdAt: 9 },
    ],
  };

  const oldTool = makeTool("agent_tool_help");
  const newTool = makeTool("siyuan_asset");

  let rebuildCount = 0;
  const actualPromptContext = {
    systemPrompt: "old_system_prompt",
    contextInstructions: "old_instructions",
    activeToolDefinitions: [oldTool],
    registeredToolCount: 1,
    toolsetReduced: true,
    currentQuestion: "第 5 轮当前问题",
    historicalMessages: [...history],
    contextWindowTokens: 32_768,
    maxOutputTokens: 512,
    rebuildProviderPromptState: (conversationContext: any, nextHistoricalMessages: AgentMessage[]) => {
      rebuildCount += 1;
      return {
        conversationContext,
        contextInstructions: `new_instructions_gen_${rebuildCount}`,
        historicalMessages: [...nextHistoricalMessages],
        manifest: { entries: [] },
        systemPrompt: `new_system_prompt_gen_${rebuildCount}`,
        toolDefinitions: [oldTool, newTool],
        registeredToolCount: 2,
        toolsetReduced: false,
      };
    },
  };

  const preflight = await resolvePreflightCompression({
    getState: () => state,
    updateState: (updater) => { state = { ...state, ...updater(state) }; },
    actualPromptContext,
    currentUserMessageId: "u5",
    chatModelSelection: null,
    abortSignal: undefined,
    persistConversationNow: undefined,
    runCompaction: async () => ({
      success: true,
      snapshot: {
        version: 2,
        coveredThroughTurnIndex: 2,
        generation: 1,
        createdAt: Date.now(),
        state: { userProfile: {}, activeTopics: [], ongoingTasks: [], recentDecisions: [], keyEntities: {}, memoryRevisions: [] },
        summary: "compaction summary",
        estimatedTokens: 100,
      },
    }),
    buildConversationContextForState: () => ({
      conversationContext: {} as any,
      historicalMessages: history.slice(4),
    }),
  });

  assert.equal(rebuildCount >= 1, true, "压缩成功后必须调用 rebuildProviderPromptState");
  assert.equal(actualPromptContext.systemPrompt.startsWith("new_system_prompt_gen_"), true, "压缩后 systemPrompt 必须已刷新");
  assert.equal(actualPromptContext.contextInstructions.startsWith("new_instructions_gen_"), true, "压缩后 contextInstructions 必须已刷新");
  assert.equal(actualPromptContext.historicalMessages.length, 4, "压缩后 historicalMessages 必须已缩短");
  assert.equal(actualPromptContext.activeToolDefinitions.length, 2, "压缩后 toolDefinitions 必须已刷新");
  assert.equal(actualPromptContext.registeredToolCount, 2);
  assert.equal(actualPromptContext.toolsetReduced, false);
  assert.equal(preflight.ok, true);
  assert.ok(preflight.budget);
  assert.equal(preflight.budget.breakdown.systemPrompt > 0, true);
  assert.equal(preflight.budget.breakdown.toolDefinitionTokens > 0, true);
}

async function verifyControlledFailureFullProviderPromptUsage(): Promise<void> {
  const hugeTool = makeSchemaOverflowTool("huge_tool");
  let state: KbSessionState = {
    error: "",
    asking: false,
    qaError: "",
    messages: [
      { id: "u1", role: "user", content: "普通问题", createdAt: 1 },
    ],
  };

  const actualPromptContext = {
    systemPrompt: "system_huge",
    contextInstructions: "instructions_huge",
    activeToolDefinitions: [hugeTool],
    registeredToolCount: 1,
    toolsetReduced: true,
    currentQuestion: "普通问题",
    historicalMessages: [],
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
    rebuildProviderPromptState: (conversationContext: any, historicalMessages: AgentMessage[]) => ({
      conversationContext,
      contextInstructions: "instructions_huge",
      historicalMessages,
      manifest: { entries: [] },
      systemPrompt: "system_huge",
      toolDefinitions: [hugeTool],
      registeredToolCount: 1,
      toolsetReduced: true,
    }),
  };

  const preflight = await resolvePreflightCompression({
    getState: () => state,
    updateState: (updater) => { state = { ...state, ...updater(state) }; },
    actualPromptContext,
    currentUserMessageId: "u1",
    chatModelSelection: null,
    abortSignal: undefined,
    persistConversationNow: undefined,
    runCompaction: async () => ({ success: false, reason: "no_compactable_turns" as const }),
  });

  assert.equal(preflight.ok, false);
  assert.equal(preflight.failureCode, "provider_toolset_budget_exceeded");
  assert.ok(preflight.budget);
  assert.equal(preflight.budget.inputTokens >= preflight.budget.hardThresholdTokens, true);
}

function fixtureHashText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fixtureSourceHash(messages: KbSessionState["messages"], throughTurnIndex: number): string {
  const turns = getCompleteConversationTurns(messages);
  return fixtureHashText(JSON.stringify(turns
    .filter((turn) => turn.turnIndex <= throughTurnIndex)
    .map((turn) => ({
      turnIndex: turn.turnIndex,
      user: {
        id: turn.user.id,
        createdAt: turn.user.createdAt,
        content: turn.user.content,
        attachedDocs: turn.user.attachedDocs,
        requestContext: turn.user.requestContext,
      },
      assistant: {
        id: turn.assistant.id,
        createdAt: turn.assistant.createdAt,
        content: turn.assistant.content,
        isComplete: turn.assistant.isComplete,
        agentMemory: turn.assistant.agentMemory,
        citedReferences: turn.assistant.citedReferences,
      },
    }))));
}

function verifyManualCompressionPresentation(): void {
  const snapshot = {
    version: 2 as const,
    generation: 1,
    createdAt: 1,
    trigger: "manual" as const,
    coveredThroughTurnIndex: 2,
    coveredThroughMessageId: "a2",
    sourceHash: "fixture",
    state: {
      currentGoal: "",
      userConstraints: [],
      importantDecisions: [],
      completedWork: [],
      currentState: [],
      unresolvedIssues: [],
      nextActions: [],
      importantReferences: [],
      verifiedWriteOutcomes: [],
    },
  };
  const compressible = resolveManualCompressionPresentation({
    asking: false,
    compactableTurnCount: 1,
    uncoveredCompletedTurnCount: 2,
    pressureSource: "conversation",
  });
  assert.equal(compressible.canCompress, true);
  assert.equal(compressible.buttonLabel, "压缩历史对话");

  const covered = resolveManualCompressionPresentation({
    asking: false,
    compactableTurnCount: 0,
    uncoveredCompletedTurnCount: 0,
    latestCompactionSnapshot: snapshot,
    pressureSource: "tool_definitions",
  });
  assert.equal(covered.canCompress, false);
  assert.match(covered.disabledReason, /历史已压缩到最新可压缩轮次/);
  assert.match(covered.disabledReason, /工具定义/);

  const stale = resolveManualCompressionPresentation({
    asking: false,
    compactableTurnCount: 1,
    uncoveredCompletedTurnCount: 3,
    latestCompactionSnapshot: { ...snapshot, stale: true },
    pressureSource: "fixed_prompt",
  });
  assert.equal(stale.canCompress, true, "过期快照应允许按 transcript 重建");

  const asking = resolveManualCompressionPresentation({
    asking: true,
    compactableTurnCount: 1,
    uncoveredCompletedTurnCount: 2,
    pressureSource: "conversation",
  });
  assert.equal(asking.canCompress, false);
  assert.match(asking.disabledReason, /回答进行中/);
}

async function verifyManualCompactionStaysLocal(): Promise<void> {
  const messages: KbSessionState["messages"] = [];
  for (let index = 1; index <= 8; index += 1) {
    messages.push(
      { id: `u${index}`, role: "user", content: `历史问题 ${index}`, createdAt: index * 2 - 1 },
      { id: `a${index}`, role: "assistant", content: `历史回答 ${index}`, createdAt: index * 2, isComplete: true },
    );
  }
  messages.push({ id: "u9", role: "user", content: "当前问题", createdAt: 17 });
  const budget = buildPromptBudget({
    contextWindowTokens: 128_000,
    maxOutputTokens: 4_096,
    providerMessages: messages,
    providerTools: [],
    historicalMessages: messages.slice(0, 16),
    currentRunMessages: [{ role: "user", content: "当前问题" }],
  });
  const selection = selectCompactionTurns({
    messages,
    currentUserMessageId: "u9",
    previousSnapshot: undefined,
    promptBudget: budget,
    trigger: "manual",
  });
  console.log("manual local compaction selection", selection.completeTurns.length, selection.compactableTurns.length);
  const result = await runContextCompaction({
    messages,
    currentUserMessageId: "u9",
    promptBudget: budget,
    trigger: "manual",
    chatModelSelection: null,
    abortSignal: AbortSignal.abort(),
    providerCallAllowed: false,
  });
  console.log("manual local compaction result", JSON.stringify(result));
  assert.equal(result.success, true);
  assert.equal(result.fallbackUsed, true, "手动压缩必须使用本地确定性回退");
  assert.ok(result.snapshot);
}

async function verifyCoveredHistoryToolPressure(): Promise<void> {
  const question = "请检查 homepage_manage 和 homepage_components，并告诉我当前主页的可用组件。";
  setNotebrainPlugin({ isMobile: false } as never);
  const messages: KbSessionState["messages"] = [];
  for (let index = 1; index <= 11; index += 1) {
    messages.push(
      { id: `u${index}`, role: "user", content: `历史问题 ${index}`, createdAt: index * 2 - 1 },
      { id: `a${index}`, role: "assistant", content: `历史回答 ${index}`, createdAt: index * 2, isComplete: true },
    );
  }
  messages.push({ id: "u12", role: "user", content: question, createdAt: 23 });
  const snapshot = {
    version: 2 as const,
    generation: 3,
    createdAt: 1_000,
    trigger: "hard" as const,
    coveredThroughTurnIndex: 11,
    coveredThroughMessageId: "a11",
    sourceHash: fixtureSourceHash(messages, 11),
    state: {
      currentGoal: "主页工具预算回归",
      userConstraints: [],
      importantDecisions: [],
      completedWork: ["历史已压缩"],
      currentState: [],
      unresolvedIssues: [],
      nextActions: [],
      importantReferences: [],
      verifiedWriteOutcomes: [],
    },
    estimatedTokens: 4_464,
  };
  const state: KbSessionState = {
    error: "",
    asking: false,
    qaError: "",
    messages,
    latestCompactionSnapshot: snapshot,
  };
  const historicalMessages = buildUncoveredVerbatimAgentMessages({
    messages,
    currentUserMessageId: "u12",
    compactionSnapshot: snapshot,
  });
  assert.equal(historicalMessages.length, 0, "快照覆盖的 11 轮不得重新进入 Provider 历史");

  const hardBudget = buildPromptBudget({
    contextWindowTokens: 128_000,
    maxOutputTokens: 4_096,
    providerMessages: [{ role: "system", content: "probe" }, { role: "user", content: question }],
    providerTools: [],
  });
  const selectionProbe = selectCompactionTurns({
    messages,
    currentUserMessageId: "u12",
    previousSnapshot: snapshot,
    promptBudget: hardBudget,
    trigger: "hard",
  });
  assert.equal(selectionProbe.previousSnapshotUsable, true, `生产快照必须可校验: ${snapshot.sourceHash}`);
  assert.equal(selectionProbe.compactableTurns.length, 0, "覆盖到第 11 轮后不得重复压缩");

  const providerToolsetController = new ProviderToolsetController();
  const workbench = createAgentWorkbenchRuntime({
    profile: getAgentProfile(KNOWLEDGE_CHAT_AGENT_PROFILE_ID),
    providerToolsetController,
    kbRetrievalToolDeps: {
      getScope: () => ({ type: "whole_kb" as const }),
      getEffectiveScope: () => ({ type: "whole_kb" as const }),
      loadPluginData: async <T>(_key: string) => null as T | null,
      savePluginData: async <T>(_key: string, _data: T) => {},
    },
    globalToolAccess: { agentToolHelp: true, webFetch: false },
    builtinCapabilityAccess: {
      knowledgeBase: true,
      scheduleTaskDiary: true,
      databaseAssistant: true,
      docContentEditing: true,
      notebookDocTree: true,
      tagBookmarkOutline: true,
      assetManagement: true,
      riffReview: true,
      homepageManagement: true,
      homepageComponents: true,
      temporaryWorkbench: true,
      homepageQuickNote: true,
      homepageFocus: true,
      homepageAccounting: true,
      homepageFixedAssets: true,
      homepageAnniversary: true,
      homepageFavorites: true,
      homepageReview: true,
      homepageMusic: true,
    },
    externalSkillSettings: DEFAULT_EXTERNAL_SKILL_SETTINGS,
    mcpSettings: DEFAULT_MCP_SETTINGS,
  });
  const nativeRegistry = createNativeToolRegistryFromWorkbench({
    toolRegistry: workbench.toolRegistry,
    observationLog: workbench.observationLog,
    question,
  });
  const productionTools = nativeRegistry.listProviderVisible();
  assert.equal(productionTools.some((tool) => tool.name === "homepage_manage"), true);
  assert.equal(productionTools.some((tool) => tool.name === "homepage_components"), true);
  const openAiWireTools = nativeToolsToOpenAITools(productionTools);
  const geminiWireTools = nativeToolsToGeminiFunctionDeclarations(productionTools);
  const anthropicWireTools = nativeToolsToAnthropicTools(productionTools);
  assert.deepEqual(Object.keys(openAiWireTools[0] ?? {}).sort(), ["function", "type"]);
  assert.deepEqual(Object.keys(openAiWireTools[0]?.function ?? {}).sort(), ["description", "name", "parameters"]);
  assert.deepEqual(Object.keys(geminiWireTools[0] ?? {}).sort(), ["description", "name", "parameters"]);
  assert.deepEqual(Object.keys(anthropicWireTools[0] ?? {}).sort(), ["description", "input_schema", "name"]);
  const wireToolTokens = estimateValueTokens(openAiWireTools);
  const perWireToolTokens = openAiWireTools.map((tool) => estimateValueTokens(tool));
  const perWireToolSum = perWireToolTokens.reduce((sum, tokens) => sum + tokens, 0);
  assert.equal(perWireToolTokens.length, productionTools.length);
  assert.equal(perWireToolTokens.every((tokens) => tokens > 0), true);
  assert.equal(Math.abs(wireToolTokens - perWireToolSum) <= productionTools.length * 2, true);

  const metadataProbe = makeTool("metadata_probe");
  metadataProbe.aggregateActionHelp = Object.fromEntries(Array.from({ length: 160 }, (_, index) => [
    `action_${index}`,
    { readOnly: index % 2 === 0, requiresConfirmation: index % 3 === 0 },
  ]));
  const metadataOnlyTokens = estimateValueTokens(nativeToolToProviderBudgetDefinition(metadataProbe));
  const metadataBaseline = makeTool("metadata_probe");
  const metadataBaselineTokens = estimateValueTokens(nativeToolToProviderBudgetDefinition(metadataBaseline));
  assert.equal(metadataOnlyTokens, metadataBaselineTokens, "内部 aggregateActionHelp 不得进入 Provider 工具预算");
  const schemaProbe = makeTool("schema_probe");
  schemaProbe.parameters = {
    type: "object",
    properties: { payload: { type: "string", description: "x".repeat(12_000) } },
    additionalProperties: false,
  };
  assert.equal(
    estimateValueTokens(nativeToolToProviderBudgetDefinition(schemaProbe)) > metadataBaselineTokens,
    true,
    "Provider 实际 parameters 变大必须增加工具预算",
  );
  const conversationContext = buildConversationContext({
    messages,
    currentUserMessageId: "u12",
    currentQuestion: question,
    compactionSnapshot: snapshot,
    usageRatio: 0.97,
  });
  const builtContext = buildAgentContextInstructions({
    toolRegistry: workbench.toolRegistry,
    skillRegistry: workbench.skillRegistry,
    observationLog: workbench.observationLog,
    question,
    conversationContext,
    globalMemory: "",
    includeKnowledgeGuidance: true,
    includeSkillInstructions: true,
    runtimeToolCapabilities: {
      sandboxEnabled: false,
      localCommandToolEnabled: false,
      mcpClientEnabled: false,
    },
  });

  const buildScenario = (supportsCoreFallback: boolean) => ({
    systemPrompt: buildAgentSystemPrompt({ isToolAvailable: (name) => productionTools.some((tool) => tool.name === name) }),
    contextInstructions: builtContext.contextInstructions,
    activeToolDefinitions: productionTools,
    registeredToolCount: productionTools.length,
    toolsetReduced: false,
    currentQuestion: question,
    historicalMessages,
    conversationContext,
    manifest: conversationContext.manifest,
    rebuildProviderPromptState: (
      nextContext: typeof conversationContext,
      nextHistoricalMessages: AgentMessage[],
      options?: { toolsetMode?: "active" | "core" },
    ) => {
      const selection = providerToolsetController.resolve({
        tools: productionTools,
        question,
        contextWindowTokens: 128_000,
        maxOutputTokens: 4_096,
        coreOnly: supportsCoreFallback && options?.toolsetMode === "core",
      });
      const toolDefinitions = supportsCoreFallback && options?.toolsetMode === "core"
        ? selection.tools
        : productionTools;
      const activeNames = new Set(toolDefinitions.map((tool) => tool.name));
      return {
        conversationContext: nextContext,
        contextInstructions: builtContext.contextInstructions,
        historicalMessages: nextHistoricalMessages,
        manifest: nextContext.manifest,
        systemPrompt: buildAgentSystemPrompt({ isToolAvailable: (name) => activeNames.has(name) }),
        providerToolSelection: selection,
        toolDefinitions,
        registeredToolCount: productionTools.length,
        toolsetReduced: toolDefinitions.length < productionTools.length,
      };
    },
  });
  const runScenario = async (supportsCoreFallback: boolean) => {
    let scenarioState = state;
    const preflight = await resolvePreflightCompression({
      getState: () => scenarioState,
      updateState: (updater) => { scenarioState = { ...scenarioState, ...updater(scenarioState) }; },
      actualPromptContext: buildScenario(supportsCoreFallback),
      currentUserMessageId: "u12",
      chatModelSelection: null,
      abortSignal: undefined,
      persistConversationNow: undefined,
      runCompaction: async () => ({ success: false, reason: "no_compactable_turns" as const }),
      buildConversationContextForState: (nextState) => ({
        conversationContext: buildConversationContext({
          messages: nextState.messages,
          currentUserMessageId: "u12",
          currentQuestion: question,
          compactionSnapshot: nextState.latestCompactionSnapshot,
        }),
        historicalMessages: buildUncoveredVerbatimAgentMessages({
          messages: nextState.messages,
          currentUserMessageId: "u12",
          compactionSnapshot: nextState.latestCompactionSnapshot,
        }),
      }),
    });
    return { preflight, scenarioState };
  };

  const normal = await runScenario(false);
  assert.equal(normal.preflight.ok, true, "生产 Registry 的真实 wire 工具预算应低于硬阈值");
  assert.ok(normal.preflight.budget);
  assert.equal(normal.preflight.pressureSource, normal.preflight.budget.pressureSource);
  assert.equal(normal.preflight.budget.inputTokens < normal.preflight.budget.hardThresholdTokens, true);
  assert.equal(normal.preflight.compactableCompletedTurnCount, 0);
  assert.equal(normal.preflight.budget.breakdown.providerTools, wireToolTokens);
  assert.equal(
    normal.preflight.budget.breakdown.providerMessages
      + normal.preflight.budget.breakdown.providerTools
      + normal.preflight.budget.breakdown.providerStaticReserve,
    normal.preflight.budget.inputTokens,
  );
  const activeToolNames = normal.preflight.finalPromptState?.toolDefinitions.map((tool) => tool.name) ?? [];
  assert.equal(activeToolNames.length, productionTools.length);
  assert.equal(activeToolNames.includes("agent_tool_help"), true);
  assert.equal(activeToolNames.includes("homepage_manage"), true);
  assert.equal(activeToolNames.includes("homepage_components"), true);

  const finalState = normal.preflight.finalPromptState!;
  const normalProvider = new ToolCallProvider();
  const normalEvents: AgentStreamEvent[] = [];
  const loopResult = await new NativeToolAgentLoop({
    provider: normalProvider,
    toolRegistry: nativeRegistry,
    providerToolsetController,
    systemPrompt: finalState.systemPrompt,
    contextInstructions: finalState.contextInstructions,
    historicalMessages: finalState.historicalMessages,
    contextWindowTokens: 128_000,
    maxOutputTokens: 4_096,
    onEvent: (event) => normalEvents.push(event),
    initialPreparedPayload: {
      messages: [
        { role: "system", content: finalState.systemPrompt },
        ...(finalState.contextInstructions ? [{ role: "system" as const, content: finalState.contextInstructions }] : []),
        ...finalState.historicalMessages,
        { role: "user", content: question },
      ],
      tools: finalState.toolDefinitions,
      systemPrompt: finalState.systemPrompt,
      budget: finalState.budget,
      selection: finalState.providerToolSelection,
    },
  }).run(question);
  assert.equal(loopResult.status, "answer_ready");
  assert.equal(normalProvider.requestCount, 2, "fake Provider 必须先发起工具调用，再消费 tool_result 完成回答");
  const firstRequestToolNames = normalProvider.requests[0]?.tools.map((tool) => tool.name) ?? [];
  assert.equal(firstRequestToolNames.includes("agent_tool_help"), true);
  assert.equal(firstRequestToolNames.includes("homepage_manage"), true);
  assert.equal(firstRequestToolNames.includes("homepage_components"), true);
  assert.equal(
    estimateValueTokens(nativeToolsToOpenAITools(normalProvider.requests[0]?.tools ?? [])),
    wireToolTokens,
    "fake Provider 收到的 wire 工具预算必须与 Preflight 一致",
  );
  assert.equal(normalEvents.filter((event) => event.type === "tool_start").length, 1);
  const normalToolResults = normalEvents.filter((event) => event.type === "tool_result");
  assert.equal(normalToolResults.length, 1);
  assert.equal(normalToolResults[0]?.type === "tool_result" && normalToolResults[0].result.ok, true);
  console.log("covered-history wire budget", JSON.stringify({
    inputTokens: normal.preflight.budget.inputTokens,
    effectiveInputBudget: normal.preflight.budget.effectiveInputBudget,
    hardThresholdTokens: normal.preflight.budget.hardThresholdTokens,
    pressureSource: normal.preflight.pressureSource,
    compactableCompletedTurnCount: normal.preflight.compactableCompletedTurnCount,
    providerRequestCount: normalProvider.requestCount,
    toolCallCount: normalEvents.filter((event) => event.type === "tool_start").length,
    toolResultCount: normalToolResults.length,
    providerWireToolTokens: wireToolTokens,
    providerWireToolTokenSum: perWireToolSum,
    breakdown: normal.preflight.budget.breakdown,
    activeToolNames,
    perWireToolTokens,
  }));
}

async function verifyTrueWireSchemaFallback(): Promise<void> {
  const question = "请调用 real_schema_overflow";
  const tools = [makeTool("agent_tool_help"), makeSchemaOverflowTool()];
  const currentUserMessageId = "u-wire-overflow";
  const messages: KbSessionState["messages"] = [{
    id: currentUserMessageId,
    role: "user",
    content: question,
    createdAt: 1,
  }];
  let state: KbSessionState = { ...emptyState(), messages };
  const controller = new ProviderToolsetController();
  let coreRebuildCount = 0;
  const buildContext = (nextMessages: KbSessionState["messages"]) => buildConversationContext({
    messages: nextMessages,
    currentUserMessageId,
    currentQuestion: question,
  });
  const initialConversationContext = buildContext(messages);
  const rebuildProviderPromptState = (
    nextContext: ReturnType<typeof buildConversationContext>,
    nextHistoricalMessages: AgentMessage[],
    options?: { toolsetMode?: "active" | "core" },
  ) => {
    const coreOnly = options?.toolsetMode === "core";
    if (coreOnly) coreRebuildCount += 1;
    const selection = controller.resolve({
      tools,
      question,
      contextWindowTokens: 8_192,
      maxOutputTokens: 512,
      coreOnly,
    });
    return {
      conversationContext: nextContext,
      contextInstructions: "",
      historicalMessages: nextHistoricalMessages,
      manifest: nextContext.manifest,
      systemPrompt: "真实 wire schema fallback",
      providerToolSelection: selection,
      toolDefinitions: coreOnly ? selection.tools : tools,
      registeredToolCount: tools.length,
      toolsetReduced: coreOnly,
    };
  };
  const initialWireBudget = buildPromptBudget({
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
    providerMessages: [{ role: "system", content: "真实 wire schema fallback" }, { role: "user", content: question }],
    providerTools: tools,
  });
  assert.equal(initialWireBudget.pressureSource, "tool_definitions");
  assert.equal(initialWireBudget.inputTokens >= initialWireBudget.hardThresholdTokens, true);

  const preflight = await resolvePreflightCompression({
    getState: () => state,
    updateState: (updater) => { state = { ...state, ...updater(state) }; },
    actualPromptContext: {
      systemPrompt: "真实 wire schema fallback",
      contextInstructions: "",
      activeToolDefinitions: tools,
      registeredToolCount: tools.length,
      toolsetReduced: false,
      currentQuestion: question,
      historicalMessages: [],
      conversationContext: initialConversationContext,
      manifest: initialConversationContext.manifest,
      contextWindowTokens: 8_192,
      maxOutputTokens: 512,
      rebuildProviderPromptState,
    },
    currentUserMessageId,
    chatModelSelection: null,
    abortSignal: undefined,
    persistConversationNow: undefined,
    runCompaction: async () => ({ success: false, reason: "no_compactable_turns" as const }),
    buildConversationContextForState: (nextState) => ({
      conversationContext: buildContext(nextState.messages),
      historicalMessages: [],
    }),
  });
  assert.equal(preflight.ok, true, "真实 parameters 超大时也应只在最后保护阶段回退核心工具");
  assert.equal(coreRebuildCount > 0, true);
  assert.deepEqual(preflight.finalPromptState?.toolDefinitions.map((tool) => tool.name), ["agent_tool_help"]);
  assert.ok(preflight.budget);
  assert.equal(preflight.budget.inputTokens < preflight.budget.hardThresholdTokens, true);
  const provider = new AnswerProvider();
  const finalState = preflight.finalPromptState!;
  const result = await new NativeToolAgentLoop({
    provider,
    toolRegistry: new NativeToolRegistry(),
    systemPrompt: finalState.systemPrompt,
    contextInstructions: finalState.contextInstructions,
    historicalMessages: finalState.historicalMessages,
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
    initialPreparedPayload: {
      messages: [
        { role: "system", content: finalState.systemPrompt },
        { role: "user", content: question },
      ],
      tools: finalState.toolDefinitions,
      systemPrompt: finalState.systemPrompt,
      budget: finalState.budget,
      selection: finalState.providerToolSelection,
    },
  }).run(question);
  assert.equal(result.status, "answer_ready");
  assert.equal(provider.requestCount, 1);
  assert.deepEqual(provider.seenToolNames, ["agent_tool_help"]);
}

function verifyWorkbenchOutcomeSemantics(): void {
  const zeroToolEvents = [
    { type: "assistant_final", answer: "provider_toolset_budget_exceeded：本轮未执行工具。" },
    { type: "done", status: "answer_ready" as const },
  ];
  assert.equal(resolveWorkbenchFinalStatus(zeroToolEvents), "answer_ready");
  assert.equal(
    formatWorkbenchProcessStats([], { isGenerating: false, isComplete: true, doneStatus: "answer_ready" }),
    "回答已完成（未执行工具）",
  );
  assert.equal(
    formatWorkbenchProcessStats([{ isToolExecution: true, ok: true }], { isGenerating: false, isComplete: true, doneStatus: "answer_ready" }),
    "工具 1 次 · 成功 1 · 失败 0 · 最终成功",
  );
  assert.match(
    formatWorkbenchProcessStats([
      { isToolExecution: true, ok: true },
      { isToolExecution: true, ok: false },
    ], { isGenerating: false, isComplete: true, doneStatus: "answer_ready" }),
    /部分工具失败/,
  );
  assert.match(
    formatWorkbenchProcessStats([{ isToolExecution: true, ok: false }], { isGenerating: false, isComplete: true, doneStatus: "answer_ready" }),
    /最终失败/,
  );
  assert.equal(
    formatWorkbenchProcessStats([], { isGenerating: false, isComplete: true, doneStatus: "failed" }),
    "最终失败",
  );
}

async function verifyPreflightFirstStepAlignment(): Promise<void> {
  const registry = new NativeToolRegistry();
  const preparedTool = makeTool("prepared_tool_sentinel");
  const fallbackTool = makeTool("dynamic_tool_fallback");
  registry.register(preparedTool);
  registry.register(fallbackTool);

  const controller = new ProviderToolsetController();
  let dynamicResolverCallCount = 0;
  const originalResolve = controller.resolve.bind(controller);
  controller.resolve = (p: any) => {
    dynamicResolverCallCount += 1;
    return originalResolve(p);
  };

  let dynamicBuildSystemPromptCallCount = 0;
  const buildSystemPrompt = () => {
    dynamicBuildSystemPromptCallCount += 1;
    return "DYNAMIC_REBUILT_SYSTEM_WRONG";
  };

  const initialPreparedPayload = {
    messages: [
      { role: "system" as const, content: "PREPARED_PREFLIGHT_SYSTEM_SENTINEL" },
      { role: "system" as const, content: "PREPARED_PREFLIGHT_CONTEXT_SENTINEL" },
      { role: "user" as const, content: "历史问题" },
      { role: "assistant" as const, content: "历史回答" },
      { role: "user" as const, content: "当前问题" },
    ],
    tools: [preparedTool],
    systemPrompt: "PREPARED_PREFLIGHT_SYSTEM_SENTINEL",
    budget: {
      contextWindowTokens: 8_192,
      maxOutputTokens: 512,
      effectiveInputBudget: 7_680,
      softThresholdTokens: 5_760,
      hardThresholdTokens: 7_372,
      inputTokens: 120,
      usageRatio: 0.015,
      breakdown: { systemPrompt: 30, contextInstructions: 30, conversationTokens: 40, currentUserTokens: 10, toolDefinitionTokens: 10, runtimeObservationTokens: 0 },
    },
    selection: {
      tools: [preparedTool],
      activeProviderToolNames: new Set([preparedTool.name]),
      registeredToolCount: 2,
      budgetTokens: 1_000,
      toolsetReduced: false,
      activationBudgetExceeded: false,
      unavailableToolNames: [],
    },
  };

  const preflightSummary = {
    snapshotGeneration: 1,
    inputTokens: 120,
    activeToolNames: [preparedTool.name],
    systemPromptTokenCount: 30,
    contextInstructionTokenCount: 30,
    historicalTokenCount: 40,
    toolDefinitionTokenCount: 10,
  };

  const provider = new (class implements ProviderAdapter {
    readonly id = "verify:integrated-alignment";
    readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
    receivedRequest: AgentChatRequest | undefined;
    async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
      this.receivedRequest = request;
      yield { type: "text_delta", delta: "回答完毕" };
      yield { type: "done", finishReason: "stop" };
    }
  })();

  const loop = new NativeToolAgentLoop({
    provider,
    toolRegistry: registry,
    providerToolsetController: controller,
    systemPrompt: "FALLBACK_SYSTEM_PROMPT",
    buildSystemPrompt,
    contextInstructions: "FALLBACK_CONTEXT_INSTRUCTIONS",
    historicalMessages: [{ role: "user", content: "历史问题" }, { role: "assistant", content: "历史回答" }],
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
    initialPreparedPayload,
    preflightPromptSummary: preflightSummary,
  });

  const result = await loop.run("当前问题");
  assert.equal(result.status, "answer_ready");
  assert.equal(result.providerRequestCount, 1, "首轮必须发起且仅发起1次请求");
  assert.equal(dynamicResolverCallCount, 0, "首轮使用 initialPreparedPayload 时不得调用动态 resolveProviderToolset");
  assert.equal(dynamicBuildSystemPromptCallCount, 0, "首轮使用 initialPreparedPayload 时不得调用动态 buildSystemPrompt");
  assert.ok(provider.receivedRequest);
  assert.equal(provider.receivedRequest.messages[0]?.content, "PREPARED_PREFLIGHT_SYSTEM_SENTINEL", "首轮必须使用 preflight 核准的 systemPrompt");
  assert.equal(provider.receivedRequest.messages[1]?.content, "PREPARED_PREFLIGHT_CONTEXT_SENTINEL", "首轮必须使用 preflight 核准的 contextInstructions");
  assert.deepEqual(
    provider.receivedRequest.tools.map((t) => t.name),
    [preparedTool.name],
    "首轮必须使用 preflight 核准的 tools",
  );
}

async function verifySecondStepDynamicToolsetAfterInitialPreparedPayload(): Promise<void> {
  const controller = new ProviderToolsetController();
  const registry = new NativeToolRegistry();
  const helpTool: NativeTool = {
    name: "agent_tool_help",
    title: "帮助工具",
    description: "帮助工具",
    parameters: {
      type: "object",
      properties: { toolName: { type: "string" } },
    },
    readOnly: true,
    async execute(params: any) {
      if (params?.toolName) controller.requestActivation(params.toolName);
      return { ok: true, content: JSON.stringify({ status: "requested", toolName: params?.toolName }), summary: "ok" };
    },
  };
  const assetTool = makeTool("siyuan_asset", "资产工具");
  registry.register(helpTool);
  registry.register(assetTool);
  let stepCount = 0;
  const requests: AgentChatRequest[] = [];

  const provider = new (class implements ProviderAdapter {
    readonly id = "verify:second-step-dynamic";
    readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
    async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
      stepCount += 1;
      requests.push(request);
      if (stepCount === 1) {
        yield {
          type: "tool_call_done",
          toolCall: {
            id: "call_help",
            name: "agent_tool_help",
            arguments: JSON.stringify({ toolName: "siyuan_asset" }),
          },
        };
        yield { type: "done", finishReason: "tool_calls" };
      } else {
        yield { type: "text_delta", delta: "第二步完成" };
        yield { type: "done", finishReason: "stop" };
      }
    }
  })();

  const initialPreparedPayload = {
    messages: [
      { role: "system" as const, content: "SYS_INITIAL" },
      { role: "user" as const, content: "需要资产工具" },
    ],
    tools: [helpTool],
    systemPrompt: "SYS_INITIAL",
    budget: {
      contextWindowTokens: 16_384,
      maxOutputTokens: 512,
      effectiveInputBudget: 15_000,
      softThresholdTokens: 11_000,
      hardThresholdTokens: 14_000,
      inputTokens: 80,
      usageRatio: 0.005,
      breakdown: { systemPrompt: 20, contextInstructions: 0, conversationTokens: 0, currentUserTokens: 10, toolDefinitionTokens: 50, runtimeObservationTokens: 0 },
    },
    selection: {
      tools: [helpTool],
      activeProviderToolNames: new Set([helpTool.name]),
      registeredToolCount: 2,
      budgetTokens: 1_000,
      toolsetReduced: false,
      activationBudgetExceeded: false,
      unavailableToolNames: [],
    },
  };

  const preflightSummary = {
    snapshotGeneration: 0,
    inputTokens: 80,
    activeToolNames: [helpTool.name],
    systemPromptTokenCount: 20,
    contextInstructionTokenCount: 0,
    historicalTokenCount: 0,
    toolDefinitionTokenCount: 50,
  };

  const loop = new NativeToolAgentLoop({
    provider,
    toolRegistry: registry,
    providerToolsetController: controller,
    systemPrompt: "DYNAMIC_SYSTEM",
    buildSystemPrompt: () => "DYNAMIC_SYSTEM",
    contextWindowTokens: 16_384,
    maxOutputTokens: 512,
    initialPreparedPayload,
    preflightPromptSummary: preflightSummary,
  });

  const result = await loop.run("需要资产工具");
  assert.equal(result.status, "answer_ready");
  assert.equal(result.providerRequestCount, 2);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].tools.map((t) => t.name), ["agent_tool_help"], "第一步仅消费 initialPreparedPayload 的工具");
  assert.equal(requests[1].tools.some((t) => t.name === "siyuan_asset"), true, "第二步必须动态激活新工具 siyuan_asset");
}

async function verifyResumeDoesNotUseInitialPreparedPayload(): Promise<void> {
  const registry = new NativeToolRegistry();
  const assetTool = makeTool("siyuan_asset");
  registry.register(assetTool);
  const controller = new ProviderToolsetController();

  let receivedRequest: AgentChatRequest | undefined;
  const provider = new (class implements ProviderAdapter {
    readonly id = "verify:resume-no-initial";
    readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
    async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
      receivedRequest = request;
      yield { type: "text_delta", delta: "恢复完成" };
      yield { type: "done", finishReason: "stop" };
    }
  })();

  const checkpointMessages: AgentMessage[] = [
    { role: "user", content: "前次未完成问题" },
    { role: "assistant", content: "思考中...", toolCalls: [{ id: "c1", name: "siyuan_asset", arguments: "{}" }] },
    { role: "tool", toolCallId: "c1", name: "siyuan_asset", content: "{ ok: true }" },
  ];

  const loop = new NativeToolAgentLoop({
    provider,
    toolRegistry: registry,
    providerToolsetController: controller,
    session: new (class {
      private msgs = [...checkpointMessages];
      snapshot() { return [...this.msgs]; }
      append(m: AgentMessage) { this.msgs.push(m); }
    })() as any,
    systemPrompt: "DYNAMIC_RESUME_SYSTEM",
    buildSystemPrompt: () => "DYNAMIC_RESUME_SYSTEM",
    contextWindowTokens: 16_384,
    maxOutputTokens: 512,
    resumeAttempt: 1,
    resumeStepIndex: 1,
    initialPreparedPayload: {
      messages: [{ role: "system", content: "WRONG_FRESH_SYSTEM" }],
      tools: [],
      systemPrompt: "WRONG_FRESH_SYSTEM",
      budget: {
        contextWindowTokens: 16_384,
        maxOutputTokens: 512,
        effectiveInputBudget: 15_000,
        softThresholdTokens: 11_000,
        hardThresholdTokens: 14_000,
        inputTokens: 50,
        usageRatio: 0.003,
        breakdown: { systemPrompt: 10, contextInstructions: 0, conversationTokens: 0, currentUserTokens: 10, toolDefinitionTokens: 0, runtimeObservationTokens: 0 },
      },
    },
    preflightPromptSummary: {
      snapshotGeneration: 0,
      inputTokens: 50,
      activeToolNames: ["agent_tool_help"],
      systemPromptTokenCount: 10,
      contextInstructionTokenCount: 0,
      historicalTokenCount: 0,
      toolDefinitionTokenCount: 0,
    },
  });

  const result = await loop.resume();
  assert.equal(result.status, "answer_ready");
  assert.equal(result.providerRequestCount, 1, "Resume 恢复必须成功发起恰好 1 次 Provider 请求");
  assert.equal(result.errorCode, undefined, "Resume 不得产生 agent_prompt_state_mismatch 或其他错误");
  assert.ok(receivedRequest);
  assert.equal(
    receivedRequest.messages.some((m) => m.role === "system" && m.content === "WRONG_FRESH_SYSTEM"),
    false,
    "Resume 恢复路径不得使用 fresh initialPreparedPayload",
  );
  assert.equal(
    receivedRequest.messages.some((m) => m.role === "tool" && m.toolCallId === "c1"),
    true,
    "Resume 恢复请求中必须包含 Checkpoint 已完成的工具消息",
  );
}

async function verifyUsageRatioDriftStabilization(): Promise<void> {
  const registry = new NativeToolRegistry();
  registry.register(makeTool("agent_tool_help"));
  const controller = new ProviderToolsetController();

  let state: KbSessionState = {
    error: "",
    asking: false,
    qaError: "",
    messages: [
      { id: "u1", role: "user", content: "问题", createdAt: 1 },
    ],
    contextUsage: {
      usageRatio: 0.1,
      totalTokens: 500,
      contextWindowTokens: 8_192,
      inputTokens: 500,
      outputTokens: 0,
      budget: {
        contextWindowTokens: 8_192,
        maxOutputTokens: 512,
        effectiveInputBudget: 7_680,
        softThresholdTokens: 5_760,
        hardThresholdTokens: 7_372,
        inputTokens: 500,
        usageRatio: 0.1,
        breakdown: { systemPrompt: 100, contextInstructions: 50, conversationTokens: 200, currentUserTokens: 50, toolDefinitionTokens: 100, runtimeObservationTokens: 0 },
      },
    },
  };

  const initialTools = registry.listProviderVisible();
  const actualPromptContext = {
    systemPrompt: "sys_prompt",
    contextInstructions: "initial_pressure_none",
    activeToolDefinitions: initialTools,
    registeredToolCount: initialTools.length,
    toolsetReduced: false,
    currentQuestion: "复杂问题".repeat(1300),
    historicalMessages: [],
    contextWindowTokens: 16_384,
    maxOutputTokens: 512,
    rebuildProviderPromptState: (conversationContext: any, historicalMessages: AgentMessage[]) => {
      const pressure = conversationContext?.compactionStatus?.pressureLevel ?? "none";
      return {
        conversationContext,
        contextInstructions: `pressure_level_${pressure}`,
        historicalMessages,
        manifest: { version: 1 as const, includedChars: 100, estimatedTokens: 25, entries: [] },
        systemPrompt: "sys_prompt",
        toolDefinitions: initialTools,
        registeredToolCount: initialTools.length,
        toolsetReduced: false,
      };
    },
  };

  const preflight = await resolvePreflightCompression({
    getState: () => state,
    updateState: (updater) => { state = { ...state, ...updater(state) }; },
    actualPromptContext,
    currentUserMessageId: "u1",
    chatModelSelection: null,
    abortSignal: undefined,
    persistConversationNow: undefined,
    buildConversationContextForState: (s, usageRatio) => {
      const effectiveRatio = usageRatio ?? s.contextUsage?.usageRatio ?? 0;
      const pressureLevel = effectiveRatio >= 0.4 ? ("suggested" as const) : ("none" as const);
      return {
        conversationContext: {
          currentTurn: { userQuestion: "复杂问题" },
          manifest: { version: 1, includedChars: 100, estimatedTokens: 25, entries: [] },
          compactionStatus: {
            hasSnapshot: false,
            coveredThroughTurnIndex: 0,
            uncoveredTurnCount: 1,
            pressureLevel,
            pressureReason: `用量 ${Math.round(effectiveRatio * 100)}%`,
          },
        } as any,
        historicalMessages: [],
      };
    },
    runCompaction: async () => ({ success: false, reason: "no_compactable_turns" as const }),
  });

  assert.equal(preflight.ok, true);
  assert.ok(preflight.finalPromptState);
  assert.equal(
    preflight.finalPromptState.contextInstructions,
    "pressure_level_suggested",
    "Usage ratio 漂移后必须通过 stabilization 收敛到正确的 pressure 状态",
  );
  assert.equal(preflight.finalPromptState.budget.usageRatio >= 0.4, true);
}

async function verifyInvariantMismatchRejection(): Promise<void> {
  const registry = new NativeToolRegistry();
  registry.register(makeTool("agent_tool_help"));
  const controller = new ProviderToolsetController();

  const provider = new (class implements ProviderAdapter {
    readonly id = "verify:mismatch-reject";
    readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
    called = false;
    async *streamChat(): AsyncGenerator<AgentProviderEvent> {
      this.called = true;
      yield { type: "text_delta", delta: "should_not_reach" };
      yield { type: "done", finishReason: "stop" };
    }
  })();

  const loop = new NativeToolAgentLoop({
    provider,
    toolRegistry: registry,
    providerToolsetController: controller,
    systemPrompt: "sys",
    contextInstructions: "inst",
    historicalMessages: [],
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
    initialPreparedPayload: {
      messages: [
        { role: "system", content: "sys" },
        { role: "system", content: "inst_tampered" },
        { role: "user", content: "q" },
      ],
      tools: registry.listProviderVisible(),
      systemPrompt: "sys",
      budget: {
        contextWindowTokens: 8_192,
        maxOutputTokens: 512,
        effectiveInputBudget: 7_680,
        softThresholdTokens: 5_760,
        hardThresholdTokens: 7_372,
        inputTokens: 9999, // mismatched
        usageRatio: 0.99,
        breakdown: { systemPrompt: 10, contextInstructions: 9000, conversationTokens: 0, currentUserTokens: 10, toolDefinitionTokens: 10, runtimeObservationTokens: 0 },
      },
    },
    preflightPromptSummary: {
      snapshotGeneration: 0,
      inputTokens: 100, // deliberately mismatched with initialPreparedPayload.budget.inputTokens (9999)
      activeToolNames: ["agent_tool_help"],
      systemPromptTokenCount: 10,
      contextInstructionTokenCount: 10,
      historicalTokenCount: 0,
      toolDefinitionTokenCount: 10,
    },
  });

  const result = await loop.run("q");
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "agent_prompt_state_mismatch");
  assert.equal(result.providerRequestCount, 0);
  assert.equal(provider.called, false, "发生 mismatch 时不得向 Provider 发起真实请求");
}

await verifyNoHistoryDoesNotCompact();
await verifyDeferredProviderToolset();
await verifyHiddenDispatchAndErrors();
await verifyCompactionFullRebuildPromptState();
await verifyControlledFailureFullProviderPromptUsage();
verifyManualCompressionPresentation();
await verifyManualCompactionStaysLocal();
await verifyCoveredHistoryToolPressure();
await verifyTrueWireSchemaFallback();
verifyWorkbenchOutcomeSemantics();
await verifyPreflightFirstStepAlignment();
await verifySecondStepDynamicToolsetAfterInitialPreparedPayload();
await verifyResumeDoesNotUseInitialPreparedPayload();
await verifyUsageRatioDriftStabilization();
await verifyInvariantMismatchRejection();
console.log("agent context preflight v4 verification passed");
