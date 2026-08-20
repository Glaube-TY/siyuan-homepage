import assert from "node:assert/strict";
import type { AgentMessage, AgentToolCall } from "../src/features/kb/services/agent-core/messages/agent-message";
import { compactAgentMessages } from "../src/features/kb/services/agent-core/messages/message-compactor";
import { filterStaleToolCalls } from "../src/features/kb/services/agent-core/messages/message-normalizer";
import { NativeToolAgentLoop } from "../src/features/kb/services/agent-core/loop/native-tool-agent-loop";
import { AgentSession } from "../src/features/kb/services/agent-core/session/agent-session";
import type { AgentChatRequest, AgentProviderEvent, ProviderAdapter } from "../src/features/kb/services/agent-core/providers/provider-adapter";
import { OPENAI_COMPATIBLE_CAPABILITIES } from "../src/features/kb/services/agent-core/providers/provider-capabilities";
import type { NativeTool, ToolExecutionResult } from "../src/features/kb/services/agent-core/tools/native-tool";
import {
  NativeToolRegistry,
  ProviderToolsetController,
  selectProviderVisibleTools,
} from "../src/features/kb/services/agent-core/tools/native-tool-registry";
import { createAgentWorkbenchRuntime } from "../src/features/kb/services/agent-workbench/runtime/create-agent-workbench";
import { createNativeToolRegistryFromWorkbench } from "../src/features/kb/services/agent-core/tools/workbench-tool-adapter";
import { createAgentToolHelpTool } from "../src/features/kb/services/agent-workbench/tools/aggregate/agent-tool-help.tool";
import { nativeToolToProviderBudgetDefinition } from "../src/features/kb/services/agent-core/tools/tool-schema-converter";
import { DEFAULT_EXTERNAL_SKILL_SETTINGS, DEFAULT_MCP_SETTINGS } from "../src/features/kb/constants/default-settings";
import { buildAgentSystemPrompt } from "../src/features/kb/services/agent-core/prompts/system-prefix";
import { getAgentProfile, KNOWLEDGE_CHAT_AGENT_PROFILE_ID } from "../src/features/agent-platform/agent-profile";
import { resolvePreflightCompression } from "../src/features/kb/services/orchestration/agent-workbench-mode-flow";
import type { KbSessionState } from "../src/features/kb/types/session";
import { buildPromptBudget, estimateAgentMessagesTokens, estimateValueTokens } from "../src/features/kb/types/context-usage";

function makeTool(name: string, description = name, readOnly = true): NativeTool {
  const result: ToolExecutionResult = { ok: true, content: "{\"ok\":true}", summary: "ok" };
  return {
    name,
    title: name,
    description,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    readOnly,
    parallelSafe: readOnly,
    providerVisible: true,
    source: "builtin",
    safety: { readOnly },
    async execute() { return result; },
  };
}

function makeSchemaOverflowTool(name: string): NativeTool {
  const tool = makeTool(name);
  tool.parameters = {
    type: "object",
    properties: { payload: { type: "string", description: "x".repeat(40_000) } },
    additionalProperties: false,
  };
  return tool;
}

function emptyState(): KbSessionState {
  return { error: "", asking: false, qaError: "", messages: [] };
}

function resolveController(
  controller: ProviderToolsetController,
  registry: NativeToolRegistry,
  question = "普通问题",
) {
  return controller.resolve({
    tools: registry.listProviderVisible(),
    question,
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
  });
}

async function verifyBudgetedActivation(): Promise<void> {
  const registry = new NativeToolRegistry();
  registry.register(makeTool("agent_tool_help"));
  for (const name of ["tool_a", "tool_b", "tool_c", "tool_d"]) {
    registry.register(makeTool(name, "x".repeat(1_200)));
  }

  const initial = selectProviderVisibleTools({
    tools: registry.listProviderVisible(),
    question: "普通问题",
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
  });
  assert.deepEqual(initial.tools.map((tool) => tool.name), ["agent_tool_help"], "没有明确来源时不得按字母顺序预加载业务工具");

  const controller = new ProviderToolsetController();
  resolveController(controller, registry);
  for (const name of ["tool_a", "tool_b", "tool_c", "tool_d"]) {
    const activation = controller.requestActivation(name);
    const selection = resolveController(controller, registry);
    assert.equal(selection.tools.some((tool) => tool.name === "agent_tool_help"), true, "core tool 不得被淘汰");
    assert.equal(selection.tools.reduce((sum, tool) => sum + tool.description.length, 0) > 0, true);
    assert.equal(
      selection.tools.reduce((sum, tool) => sum + estimateValueTokens(nativeToolToProviderBudgetDefinition(tool)), 0) <= selection.budgetTokens,
      true,
      "active tool definitions 必须落在当前 Toolset Budget 内",
    );
    assert.equal(activation.requested, true);
    assert.equal(selection.activationBudgetExceeded, false, "新请求应替换低优先级工具，不应把整轮推到超预算");
    assert.equal(selection.tools.length <= 2, true, "动态 active toolset 不得无界增长");
    assert.equal(selection.activeProviderToolNames.has(name), true, `${name} 应优先保留`);
  }

  const helpController = new ProviderToolsetController();
  const helpRegistry = new NativeToolRegistry();
  helpRegistry.register(makeTool("agent_tool_help"));
  helpRegistry.register(makeTool("siyuan_asset"));
  resolveController(helpController, helpRegistry);
  const help = createAgentToolHelpTool({
    externalSkillSettings: DEFAULT_EXTERNAL_SKILL_SETTINGS,
    availableTools: [{ name: "siyuan_asset" }],
    onToolDescribed: (toolName) => helpController.requestActivation(toolName),
  });
  const helpResult = await help.execute({} as never, { action: "describe_tool", toolName: "siyuan_asset" });
  assert.equal(helpResult.ok, true);
  assert.equal((helpResult.data as { activation?: { status?: string } }).activation?.status, "requested");
  assert.equal("activeNextStep" in ((helpResult.data as { activation?: Record<string, unknown> }).activation ?? {}), false);
  assert.equal(helpController.getActiveProviderToolNames().has("siyuan_asset"), false);
  assert.equal(resolveController(helpController, helpRegistry).activeProviderToolNames.has("siyuan_asset"), true);

  const noFitController = new ProviderToolsetController();
  const noFitRegistry = new NativeToolRegistry();
  noFitRegistry.register(makeTool("agent_tool_help", "x".repeat(5_000)));
  noFitRegistry.register(makeTool("siyuan_asset", "x".repeat(5_000)));
  resolveController(noFitController, noFitRegistry);
  const noFit = noFitController.requestActivation("siyuan_asset");
  assert.equal(noFit.status, "requested");
  const noFitSelection = resolveController(noFitController, noFitRegistry);
  assert.equal(noFitSelection.activeProviderToolNames.has("siyuan_asset"), false);
  assert.equal(noFitSelection.activationBudgetExceeded, true);
}

class ActivationProvider implements ProviderAdapter {
  readonly id = "verify:deferred-toolset";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];
  private requestIndex = 0;

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    this.requestIndex += 1;
    if (this.requestIndex === 1) {
      const call: AgentToolCall = {
        id: "help-1",
        name: "agent_tool_help",
        arguments: JSON.stringify({ action: "describe_tool", toolName: "siyuan_asset" }),
      };
      yield { type: "tool_call_done", toolCall: call };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "text_delta", delta: "done" };
    yield { type: "done", finishReason: "stop" };
  }
}

async function verifyPromptAndPairingLifecycle(): Promise<void> {
  let assetExecutions = 0;
  const registry = new NativeToolRegistry();
  const controller = new ProviderToolsetController();
  registry.register({
    ...makeTool("agent_tool_help"),
    async execute() {
      const activation = controller.requestActivation("siyuan_asset");
      return { ok: true, content: JSON.stringify({ ok: true, activation }), summary: "activated" };
    },
  });
  registry.register({
    ...makeTool("siyuan_asset"),
    async execute() {
      assetExecutions += 1;
      return { ok: true, content: "{\"ok\":true}", summary: "asset read" };
    },
  });
  resolveController(controller, registry);
  const provider = new ActivationProvider();
  const loop = new NativeToolAgentLoop({
    provider,
    toolRegistry: registry,
    providerToolsetController: controller,
    systemPrompt: "base",
    buildSystemPrompt: (active) => `base ${active.has("siyuan_asset") ? "siyuan_asset-guidance" : ""}`,
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
  });
  const result = await loop.run("请查询资源");
  assert.equal(result.status, "answer_ready");
  assert.equal(provider.requests.length, 2);
  assert.equal(provider.requests[0].tools.some((tool) => tool.name === "siyuan_asset"), false);
  assert.equal(provider.requests[1].tools.some((tool) => tool.name === "siyuan_asset"), true);
  assert.match(provider.requests[1].messages.find((message) => message.role === "system")?.content ?? "", /siyuan_asset-guidance/);

  const keptMessages: AgentMessage[] = [
    { role: "user", content: "read" },
    { role: "assistant", content: "", toolCalls: [{ id: "asset-call", name: "siyuan_asset", arguments: "{}" }] },
    { role: "tool", toolCallId: "asset-call", name: "siyuan_asset", content: "ok" },
  ];
  assert.equal(filterStaleToolCalls(keptMessages, new Set(["siyuan_asset"])).length, 3, "registered 但 active=false 的 pairing 不得被删除");
  assert.equal(filterStaleToolCalls(keptMessages, new Set(["agent_tool_help"])).length, 1, "真正未注册的工具 pairing 才允许清理");
  assert.equal(assetExecutions, 0, "本轮只验证 deferred activation，不应误执行未请求的业务工具");
}

class CompletedPairingProvider implements ProviderAdapter {
  readonly id = "verify:completed-pairing";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];
  private requestIndex = 0;

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    this.requestIndex += 1;
    const sequence: Array<AgentToolCall | undefined> = [
      { id: "help-a", name: "agent_tool_help", arguments: JSON.stringify({ target: "tool_a" }) },
      { id: "call-a", name: "tool_a", arguments: "{}" },
      { id: "help-b", name: "agent_tool_help", arguments: JSON.stringify({ target: "tool_b" }) },
      { id: "call-b", name: "tool_b", arguments: "{}" },
      { id: "help-c", name: "agent_tool_help", arguments: JSON.stringify({ target: "tool_c" }) },
      { id: "call-c", name: "tool_c", arguments: "{}" },
      { id: "help-d", name: "agent_tool_help", arguments: JSON.stringify({ target: "tool_d" }) },
      { id: "call-d", name: "tool_d", arguments: "{}" },
      undefined,
    ];
    const call = sequence[this.requestIndex - 1];
    if (call) yield { type: "tool_call_done", toolCall: call };
    else yield { type: "text_delta", delta: "completed" };
    yield { type: "done", finishReason: call ? "tool_calls" : "stop" };
  }
}

async function verifyCompletedPairingDoesNotPinSchemas(): Promise<void> {
  const registry = new NativeToolRegistry();
  const controller = new ProviderToolsetController();
  registry.register({
    ...makeTool("agent_tool_help"),
    async execute(args) {
      const target = typeof (args as Record<string, unknown>).target === "string"
        ? (args as Record<string, unknown>).target as string
        : "";
      return { ok: true, content: JSON.stringify(controller.requestActivation(target)), summary: "requested" };
    },
  });
  for (const name of ["tool_a", "tool_b", "tool_c", "tool_d"]) {
    registry.register(makeTool(name, "x".repeat(3_500)));
  }
  resolveController(controller, registry);
  const provider = new CompletedPairingProvider();
  const result = await new NativeToolAgentLoop({
    provider,
    toolRegistry: registry,
    providerToolsetController: controller,
    systemPrompt: "base",
    buildSystemPrompt: () => "base",
    contextWindowTokens: 16_384,
    maxOutputTokens: 512,
  }).run("完成工具配对生命周期");
  assert.equal(result.status, "answer_ready");
  const finalTools = provider.requests.at(-1)?.tools.map((tool) => tool.name) ?? [];
  assert.equal(finalTools.includes("agent_tool_help"), true);
  assert.equal(finalTools.includes("tool_d"), true, `最近请求的工具应保留为可选优先项: ${finalTools.join(",")}`);
  assert.equal(finalTools.includes("tool_a"), false, "已完成的历史配对不得永久强制 Schema 常驻");
  assert.equal(finalTools.includes("tool_b"), false, "已完成的历史配对不得永久强制 Schema 常驻");
  assert.equal(finalTools.includes("tool_c"), false, "已完成的历史配对不得永久强制 Schema 常驻");
  const finalMessages = provider.requests.at(-1)?.messages ?? [];
  assert.equal(finalMessages.filter((message) => message.role === "assistant" && message.toolCalls?.length).length >= 4, true);
  assert.equal(finalMessages.filter((message) => message.role === "tool").length >= 4, true, "历史 Tool Pairing 必须继续保留");
}

async function verifyRuntimePressureClassification(): Promise<void> {
  const compactionRegistry = new NativeToolRegistry();
  compactionRegistry.register(makeTool("agent_tool_help"));
  compactionRegistry.register(makeTool("compaction_tool", "c".repeat(3_500)));
  const rawMessages: AgentMessage[] = [
    { role: "system", content: "base" },
    { role: "user", content: "读取结果" },
    { role: "assistant", content: "", toolCalls: [{ id: "compaction-call", name: "compaction_tool", arguments: "{}" }] },
    { role: "tool", toolCallId: "compaction-call", name: "compaction_tool", content: "o".repeat(80_000) },
  ];
  const compactedMessages = compactAgentMessages(rawMessages, { maxInputTokens: 2_000, maxObservationTokens: 4_096 });
  const compactionController = new ProviderToolsetController({
    restoredState: {
      activeToolNames: ["compaction_tool"],
      requestedToolNames: [],
      fulfilledToolNames: [],
    },
  });
  const beforeCompaction = compactionController.resolve({
    tools: compactionRegistry.listProviderVisible(),
    question: "继续",
    contextWindowTokens: 16_384,
    maxOutputTokens: 512,
    providerMessageTokens: estimateAgentMessagesTokens(rawMessages),
  });
  const afterCompaction = compactionController.resolve({
    tools: compactionRegistry.listProviderVisible(),
    question: "继续",
    contextWindowTokens: 16_384,
    maxOutputTokens: 512,
    providerMessageTokens: estimateAgentMessagesTokens(compactedMessages),
  });
  assert.equal(beforeCompaction.activeProviderToolNames.has("compaction_tool"), false, "压缩前的大 Observation 应占满工具预算");
  assert.equal(afterCompaction.activeProviderToolNames.has("compaction_tool"), true, "压缩后的真实 payload 应释放工具预算");

  const observationRegistry = new NativeToolRegistry();
  observationRegistry.register(makeTool("agent_tool_help"));
  const observationSession = new AgentSession("observation-pressure", [
    { role: "user", content: "此前问题" },
    { role: "assistant", content: "", toolCalls: [{ id: "observation-call", name: "agent_tool_help", arguments: "{}" }] },
    { role: "tool", toolCallId: "observation-call", name: "agent_tool_help", content: "x".repeat(80_000) },
  ]);
  const observationResult = await new NativeToolAgentLoop({
    provider: new (class implements ProviderAdapter {
      readonly id = "verify:observation-pressure";
      readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
      async *streamChat(): AsyncGenerator<AgentProviderEvent> { yield { type: "text_delta", delta: "unexpected" }; }
    })(),
    toolRegistry: observationRegistry,
    providerToolsetController: new ProviderToolsetController(),
    session: observationSession,
    systemPrompt: "base",
    contextInstructions: "y".repeat(40_000),
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
  }).run("继续");
  assert.equal(observationResult.errorCode, "context_budget_exceeded", "观察结果压力不得误归因 Toolset");

  const schemaRegistry = new NativeToolRegistry();
  schemaRegistry.register(makeTool("agent_tool_help"));
  schemaRegistry.register(makeSchemaOverflowTool("schema_core"));
  const schemaController = new ProviderToolsetController({ coreToolNames: ["agent_tool_help", "schema_core"] });
  const schemaResult = await new NativeToolAgentLoop({
    provider: new (class implements ProviderAdapter {
      readonly id = "verify:schema-pressure";
      readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
      async *streamChat(): AsyncGenerator<AgentProviderEvent> { yield { type: "text_delta", delta: "unexpected" }; }
    })(),
    toolRegistry: schemaRegistry,
    providerToolsetController: schemaController,
    systemPrompt: "base",
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
  }).run("普通问题");
  assert.equal(schemaResult.errorCode, "provider_toolset_budget_exceeded", "真正 Schema 压力应归因 Toolset");
}

async function verifyActivationBudgetFailureIsControlled(): Promise<void> {
  const registry = new NativeToolRegistry();
  registry.register(makeTool("agent_tool_help"));
  registry.register(makeSchemaOverflowTool("siyuan_asset"));
  const controller = new ProviderToolsetController();
  controller.requestActivation("siyuan_asset");
  let providerRequestCount = 0;
  const result = await new NativeToolAgentLoop({
    provider: new (class implements ProviderAdapter {
      readonly id = "verify:activation-budget-failure";
      readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
      async *streamChat(): AsyncGenerator<AgentProviderEvent> {
        providerRequestCount += 1;
        yield { type: "text_delta", delta: "unexpected" };
      }
    })(),
    toolRegistry: registry,
    providerToolsetController: controller,
    systemPrompt: "base",
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
  }).run("继续");
  assert.equal(result.errorCode, "tool_activation_budget_exceeded");
  assert.equal(providerRequestCount, 0, "明确 Activation Failure 后不得额外发送 Provider Request");
  assert.match(result.errorMessage ?? "", /siyuan_asset/);

  const explicitResult = await new NativeToolAgentLoop({
    provider: new (class implements ProviderAdapter {
      readonly id = "verify:explicit-tool-budget-failure";
      readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
      async *streamChat(): AsyncGenerator<AgentProviderEvent> {
        providerRequestCount += 1;
        yield { type: "text_delta", delta: "unexpected" };
      }
    })(),
    toolRegistry: registry,
    providerToolsetController: new ProviderToolsetController(),
    systemPrompt: "base",
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
  }).run("请调用 siyuan_asset");
  assert.equal(explicitResult.errorCode, "tool_activation_budget_exceeded");
  assert.equal(providerRequestCount, 0, "用户明确点名但无法激活时不得发送隐藏工具请求");

  const optionalRegistry = new NativeToolRegistry();
  optionalRegistry.register(makeTool("agent_tool_help"));
  optionalRegistry.register(makeTool("optional_seed", "s".repeat(40_000)));
  let optionalRequestCount = 0;
  const optionalResult = await new NativeToolAgentLoop({
    provider: new (class implements ProviderAdapter {
      readonly id = "verify:optional-seed";
      readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
      async *streamChat(): AsyncGenerator<AgentProviderEvent> {
        optionalRequestCount += 1;
        yield { type: "text_delta", delta: "ordinary answer" };
        yield { type: "done", finishReason: "stop" };
      }
    })(),
    toolRegistry: optionalRegistry,
    providerToolsetController: new ProviderToolsetController({ profileSeedToolNames: ["optional_seed"] }),
    systemPrompt: "base",
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
  }).run("普通问题");
  assert.equal(optionalResult.status, "answer_ready", "Optional Profile Seed 放不下不得阻断普通回答");
  assert.equal(optionalRequestCount, 1);
}

class ResumeProvider implements ProviderAdapter {
  readonly id = "verify:deferred-resume";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];
  private requestIndex = 0;

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    this.requestIndex += 1;
    if (this.requestIndex === 1) {
      yield { type: "tool_call_done", toolCall: { id: "help", name: "agent_tool_help", arguments: "{}" } };
    } else if (this.requestIndex === 2) {
      yield { type: "tool_call_done", toolCall: { id: "asset", name: "siyuan_asset", arguments: "{}" } };
    } else {
      yield { type: "text_delta", delta: "complete" };
    }
    yield { type: "done", finishReason: this.requestIndex < 3 ? "tool_calls" : "stop" };
  }
}

async function verifyCheckpointResume(): Promise<void> {
  const registry = new NativeToolRegistry();
  const controller = new ProviderToolsetController();
  const abortController = new AbortController();
  registry.register({
    ...makeTool("agent_tool_help"),
    async execute() {
      const activation = controller.requestActivation("siyuan_asset");
      abortController.abort();
      return { ok: true, content: JSON.stringify(activation), summary: "requested" };
    },
  });
  registry.register(makeTool("siyuan_asset"));
  resolveController(controller, registry);
  const provider = new ResumeProvider();
  let checkpoint: import("../src/features/kb/services/agent-core/session/agent-run-checkpoint").AgentRunCheckpoint | undefined;
  const firstLoop = new NativeToolAgentLoop({
    provider,
    toolRegistry: registry,
    providerToolsetController: controller,
    systemPrompt: "base",
    buildSystemPrompt: () => "base",
    abortSignal: abortController.signal,
    onCheckpoint: (value) => { if (value.phase === "after_tool") checkpoint = value; },
  });
  const first = await firstLoop.run("read asset");
  assert.equal(first.status, "cancelled");
  assert.equal(checkpoint?.schemaVersion, 2);
  assert.equal(checkpoint?.providerToolsetState?.activeToolNames.includes("agent_tool_help"), true);
  assert.equal(checkpoint?.providerToolsetState?.activeToolNames.includes("siyuan_asset"), false);
  assert.deepEqual(checkpoint?.providerToolsetState?.requestedToolNames, ["siyuan_asset"], "after_tool checkpoint 必须保留待激活请求");
  assert.deepEqual(checkpoint?.providerToolsetState?.fulfilledToolNames, [], "尚未发送给 Provider 的工具不得提前标记 fulfilled");

  const restoredController = new ProviderToolsetController({ restoredState: checkpoint?.providerToolsetState });
  const restoredSelection = resolveController(restoredController, registry, "continue");
  assert.equal(restoredSelection.activeProviderToolNames.has("siyuan_asset"), true);
  const resumeProvider = new (class implements ProviderAdapter {
    readonly id = "verify:deferred-resume-restarted";
    readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
    readonly requests: AgentChatRequest[] = [];
    async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
      this.requests.push(request);
      yield { type: "text_delta", delta: "resumed" };
      yield { type: "done", finishReason: "stop" };
    }
  })();
  const resumed = new NativeToolAgentLoop({
    provider: resumeProvider,
    toolRegistry: registry,
    providerToolsetController: restoredController,
    systemPrompt: "base",
    buildSystemPrompt: () => "base",
    session: new (await import("../src/features/kb/services/agent-core/session/agent-session")).AgentSession("resume", checkpoint?.messages ?? []),
    resumeStepIndex: checkpoint?.stepIndex,
  });
  const resumedResult = await resumed.resume();
  assert.equal(resumedResult.status, "answer_ready");
  assert.equal(resumeProvider.requests[0].tools.some((tool) => tool.name === "siyuan_asset"), true);
  assert.equal(resumeProvider.requests[0].messages.some((message) => message.role === "assistant" && message.toolCalls?.some((call) => call.name === "agent_tool_help")), true);

  const reRequestRegistry = new NativeToolRegistry();
  reRequestRegistry.register(makeTool("agent_tool_help"));
  reRequestRegistry.register(makeTool("siyuan_asset"));
  reRequestRegistry.register(makeTool("aaa_historical", "h".repeat(1_200)));
  const reRequestController = new ProviderToolsetController();
  resolveController(reRequestController, reRequestRegistry);
  reRequestController.requestActivation("siyuan_asset");
  const firstAssetSelection = resolveController(reRequestController, reRequestRegistry);
  assert.equal(firstAssetSelection.activeProviderToolNames.has("siyuan_asset"), true);
  reRequestController.commitProviderStep(firstAssetSelection.tools);
  assert.deepEqual(reRequestController.snapshotState().fulfilledToolNames, ["siyuan_asset"]);

  const help = createAgentToolHelpTool({
    externalSkillSettings: DEFAULT_EXTERNAL_SKILL_SETTINGS,
    availableTools: [{ name: "siyuan_asset" }],
    onToolDescribed: (toolName) => reRequestController.requestActivation(toolName),
  });
  await help.execute({} as never, { action: "describe_tool", toolName: "siyuan_asset" });
  const reRequestCheckpoint = reRequestController.snapshotState();
  assert.equal(reRequestCheckpoint.activeToolNames.includes("siyuan_asset"), true, "再次 Help 请求时工具仍应处于 active");
  assert.deepEqual(reRequestCheckpoint.requestedToolNames, ["siyuan_asset"]);
  assert.deepEqual(reRequestCheckpoint.fulfilledToolNames, [], "再次 Help 请求必须撤销旧 fulfilled 状态");

  const restoredReRequestController = new ProviderToolsetController({ restoredState: reRequestCheckpoint });
  const restoredReRequestState = restoredReRequestController.snapshotState();
  assert.equal(restoredReRequestState.activeToolNames.includes("siyuan_asset"), true);
  assert.deepEqual(restoredReRequestState.fulfilledToolNames, [], "重启不得从 active ∩ requested 推断 fulfilled");
  const restoredReRequestSelection = resolveController(restoredReRequestController, reRequestRegistry, "继续读取资产");
  assert.equal(restoredReRequestSelection.activeProviderToolNames.has("siyuan_asset"), true, "预算收缩时最新待激活资产仍必须优先");
  assert.equal(restoredReRequestSelection.activeProviderToolNames.has("aaa_historical"), false, "预算收缩时旧 active 工具可被淘汰");
  restoredReRequestController.commitProviderStep(restoredReRequestSelection.tools);
  assert.deepEqual(restoredReRequestController.snapshotState().fulfilledToolNames, ["siyuan_asset"], "只有实际 Provider payload commit 才能 fulfilled");

  const priorityRegistry = new NativeToolRegistry();
  priorityRegistry.register(makeTool("agent_tool_help"));
  priorityRegistry.register(makeTool("tool_a", "a".repeat(1_200)));
  priorityRegistry.register(makeTool("tool_b", "b".repeat(1_200)));
  const priorityController = new ProviderToolsetController();
  priorityController.requestActivation("tool_a");
  priorityController.requestActivation("tool_b");
  const priorityState = priorityController.snapshotState();
  assert.deepEqual(priorityState.requestedToolNames, ["tool_a", "tool_b"]);
  const restoredPriorityController = new ProviderToolsetController({ restoredState: priorityState });
  const prioritySelection = resolveController(restoredPriorityController, priorityRegistry, "continue");
  assert.equal(prioritySelection.activeProviderToolNames.has("tool_b"), true, "恢复后最近请求的工具必须优先");
  assert.equal(prioritySelection.activeProviderToolNames.has("tool_a"), false, "恢复不能按字母顺序抢占唯一业务工具槽位");
  assert.equal(prioritySelection.activationBudgetExceeded, false, "低优先级 pending 被淘汰不应阻断最近请求");

  const fulfilledRegistry = new NativeToolRegistry();
  fulfilledRegistry.register(makeTool("agent_tool_help"));
  fulfilledRegistry.register(makeTool("tool_a", "a".repeat(1_200)));
  fulfilledRegistry.register(makeTool("tool_b", "b".repeat(1_200)));
  const fulfilledController = new ProviderToolsetController();
  fulfilledController.requestActivation("tool_a");
  const firstSelection = resolveController(fulfilledController, fulfilledRegistry);
  fulfilledController.commitProviderStep(firstSelection.tools);
  fulfilledController.requestActivation("tool_b");
  const secondSelection = resolveController(fulfilledController, fulfilledRegistry);
  assert.equal(secondSelection.activeProviderToolNames.has("tool_b"), true);
  assert.equal(secondSelection.activeProviderToolNames.has("tool_a"), false);
  assert.equal(secondSelection.activationBudgetExceeded, false, "已兑现工具被新请求淘汰不得误报 activation failure");
  fulfilledController.commitProviderStep(secondSelection.tools);
  assert.deepEqual(fulfilledController.snapshotState().fulfilledToolNames.sort(), ["tool_a", "tool_b"]);

  const staleController = new ProviderToolsetController({
    restoredState: {
      activeToolNames: ["removed_tool", "hidden_tool"],
      requestedToolNames: [],
      fulfilledToolNames: [],
    },
  });
  registry.register({ ...makeTool("hidden_tool"), providerVisible: false });
  const staleSelection = staleController.resolve({ tools: registry.listProviderVisible(), question: "continue" });
  assert.equal(staleSelection.activeProviderToolNames.has("removed_tool"), false, "Resume 必须过滤当前 Registry 中不存在的名称");
  assert.equal(staleSelection.activeProviderToolNames.has("hidden_tool"), false, "Resume 必须过滤 providerVisible=false 的工具");
}

async function verifyProductionFirstTurn(): Promise<void> {
  const question = "如果要设计一个安静但高效的知识库主页，你会优先保留哪三类信息？";
  const controller = new ProviderToolsetController();
  const workbench = createAgentWorkbenchRuntime({
    profile: getAgentProfile(KNOWLEDGE_CHAT_AGENT_PROFILE_ID),
    providerToolsetController: controller,
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
  const initialSelection = controller.resolve({
    tools: nativeRegistry.listProviderVisible(),
    question,
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
  });
  assert.equal(initialSelection.registeredToolCount > 10, true, "生产组合验收必须包含主要聚合工具");
  assert.equal(initialSelection.tools.length < initialSelection.registeredToolCount, true, "真实 Knowledge Chat 不能首轮预加载全部注册工具");
  let compactionCalls = 0;
  const preflight = await resolvePreflightCompression({
    getState: () => emptyState(),
    updateState: () => undefined,
    actualPromptContext: {
      systemPrompt: buildAgentSystemPrompt({ isToolAvailable: (name) => initialSelection.activeProviderToolNames.has(name) }),
      contextInstructions: "",
      activeToolDefinitions: initialSelection.tools,
      currentQuestion: question,
      historicalMessages: [],
      contextWindowTokens: 8_192,
      maxOutputTokens: 512,
      toolsetReduced: initialSelection.toolsetReduced,
      rebuildProviderContext: (_context, historicalMessages) => ({ contextInstructions: "", historicalMessages, manifest: { entries: [] } }),
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
  assert.equal(compactionCalls, 0, "真实首轮无历史不得进入 Compaction");
  assert.equal(preflight.ok, true);

  const provider = new (class implements ProviderAdapter {
    readonly id = "verify:production-first-turn";
    readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
    requestCount = 0;
    seenTools: string[] = [];
    async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
      this.requestCount += 1;
      this.seenTools = request.tools.map((tool) => tool.name);
      yield { type: "text_delta", delta: "首轮正常" };
      yield { type: "done", finishReason: "stop" };
    }
  })();
  const loop = new NativeToolAgentLoop({
    provider,
    toolRegistry: nativeRegistry,
    providerToolsetController: controller,
    systemPrompt: "base",
    buildSystemPrompt: (active) => buildAgentSystemPrompt({ isToolAvailable: (name) => active.has(name) }),
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
  });
  const result = await loop.run(question);
  assert.equal(result.status, "answer_ready");
  assert.equal(provider.requestCount, 1);
  assert.equal(provider.seenTools.length < initialSelection.registeredToolCount, true);
  const promptBudget = buildPromptBudget({
    providerMessages: [
      { role: "system", content: buildAgentSystemPrompt({ isToolAvailable: (name) => initialSelection.activeProviderToolNames.has(name) }) },
      { role: "user", content: question },
    ],
    providerTools: initialSelection.tools,
    contextWindowTokens: 8_192,
    maxOutputTokens: 512,
  });
  assert.equal(promptBudget.inputTokens < promptBudget.hardThresholdTokens, true, "真实首轮 Prompt 必须低于 hard threshold");
}

await verifyBudgetedActivation();
await verifyPromptAndPairingLifecycle();
await verifyCompletedPairingDoesNotPinSchemas();
await verifyRuntimePressureClassification();
await verifyActivationBudgetFailureIsControlled();
await verifyCheckpointResume();
await verifyProductionFirstTurn();
console.log("agent deferred provider toolset v4 verification passed");
