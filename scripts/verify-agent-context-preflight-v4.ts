import assert from "node:assert/strict";
import type { AgentMessage } from "../src/features/kb/services/agent-core/messages/agent-message";
import { dispatchToolCalls } from "../src/features/kb/services/agent-core/loop/dispatch-tool-calls";
import { NativeToolAgentLoop } from "../src/features/kb/services/agent-core/loop/native-tool-agent-loop";
import type { AgentChatRequest, AgentProviderEvent, ProviderAdapter } from "../src/features/kb/services/agent-core/providers/provider-adapter";
import { normalizeProviderError, AgentProviderError } from "../src/features/kb/services/agent-core/providers/provider-error";
import { AllowingConfirmationBridge } from "../src/features/kb/services/agent-core/permissions/confirmation-bridge";
import type { NativeTool, ToolExecutionResult } from "../src/features/kb/services/agent-core/tools/native-tool";
import { NativeToolRegistry, ProviderToolsetController, selectProviderVisibleTools } from "../src/features/kb/services/agent-core/tools/native-tool-registry";
import { resolvePreflightCompression } from "../src/features/kb/services/orchestration/agent-workbench-mode-flow";
import type { KbSessionState } from "../src/features/kb/types/session";
import { mapAgentErrorToUserFacing } from "../src/features/kb/services/agent-workbench/runtime/user-facing-agent-error";
import { OPENAI_COMPATIBLE_CAPABILITIES } from "../src/features/kb/services/agent-core/providers/provider-capabilities";
import { parseToolResultContentEnvelope } from "../src/features/kb/services/agent-core/tools/tool-execution-result";
import { createAgentToolHelpTool } from "../src/features/kb/services/agent-workbench/tools/aggregate/agent-tool-help.tool";
import { DEFAULT_EXTERNAL_SKILL_SETTINGS } from "../src/features/kb/constants/default-settings";
import { buildPromptBudget } from "../src/features/kb/types/context-usage";

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

function emptyState(): KbSessionState {
  return { error: "", asking: false, qaError: "", messages: [] };
}

async function verifyNoHistoryDoesNotCompact(): Promise<void> {
  let compactionCalls = 0;
  const state = emptyState();
  const hugeTool = makeTool("siyuan_asset", "x".repeat(30_000));
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
  seenToolNames: string[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.seenToolNames = request.tools.map((tool) => tool.name);
    yield { type: "text_delta", delta: "首轮请求已建立" };
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

await verifyNoHistoryDoesNotCompact();
await verifyDeferredProviderToolset();
await verifyHiddenDispatchAndErrors();
console.log("agent context preflight v4 verification passed");
