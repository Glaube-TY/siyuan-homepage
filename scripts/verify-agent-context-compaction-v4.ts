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
import { HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-business-capabilities";

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

assert.equal(HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.length, 36, "homepage route catalog size must match the production route set");
assert.ok(
  Math.max(...HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.map((route) => route.operations.length)) >= 20,
  "homepage route fixture must include a 20-operation capability",
);

function homepageRouteWidget(
  route: (typeof HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS)[number],
  index: number,
  suffix = "",
): Record<string, unknown> {
  return {
    widgetId: `homepage-widget-${route.prefix}${suffix}`,
    resolutionStatus: "resolved",
    type: route.type,
    label: route.label,
    index,
    sectionId: `section-${route.prefix}`,
    sectionName: route.label,
    configRevision: 10 + index,
    editable: true,
    advancedRequired: false,
    businessCapability: {
      toolName: "homepage_components",
      subtool: route.prefix,
      operations: [...route.operations],
      ...(route.kind === "reused" ? { reusedExistingTool: true } : {}),
    },
    warnings: [],
  };
}

const homepageWidgets: Record<string, unknown>[] = [
  ...HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.map((route, index) => homepageRouteWidget(route, index)),
  ...HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.slice(0, 6).map((route, index) => homepageRouteWidget(route, 36 + index, `-duplicate-${index + 1}`)),
  {
    widgetId: "homepage-widget-missing-config",
    resolutionStatus: "missing_config",
    type: null,
    label: "组件配置缺失",
    index: 42,
    sectionId: "section-missing",
    sectionName: "缺失配置",
    configRevision: null,
    editable: false,
    advancedRequired: false,
    businessCapability: null,
    warnings: ["组件配置文件缺失"],
  },
];
assert.equal(homepageWidgets.length, 43);

function homepageToolMessages(
  toolCallId: string,
  action: string,
  result: Record<string, unknown>,
  args: Record<string, unknown> = {},
): AgentMessage[] {
  return normalizeToolCallMessages([
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: toolCallId, name: "homepage_components", arguments: JSON.stringify({ action, args }) }],
    },
    {
      role: "tool",
      toolCallId,
      name: "homepage_components",
      content: JSON.stringify({
        ok: true,
        toolName: "homepage_components",
        data: { action, result },
      }),
    },
  ]);
}

function compactedToolPayload(messagesToRead: AgentMessage[], toolCallId: string, maxChars = 12_000): Record<string, any> {
  const tool = messagesToRead.find((message) => message.role === "tool" && message.toolCallId === toolCallId);
  assert.ok(tool && tool.role === "tool", `missing compacted tool result ${toolCallId}`);
  let payload: Record<string, any> | undefined;
  assert.doesNotThrow(() => {
    payload = JSON.parse(tool.content) as Record<string, any>;
  }, `compacted ${toolCallId} result must remain parseable JSON`);
  assert.ok(payload && typeof payload === "object", `compacted ${toolCallId} result must be an object`);
  assert.ok(tool.content.length <= maxChars, `compacted ${toolCallId} result must fit its character cap`);
  assert.equal(tool.content.includes("...[compact:"), false, `compacted ${toolCallId} result must not contain a text truncation marker`);
  return payload;
}

function homepageProjectedWidgets(payload: Record<string, any>): Record<string, any>[] {
  assert.ok(Array.isArray(payload.widgets), "homepage compacted result must expose a widgets array");
  if (!Array.isArray(payload.widgetFields)) return payload.widgets as Record<string, any>[];
  assert.deepEqual(payload.widgetFields, ["widgetId", "type", "index", "sectionId", "configRevision", "subtool", "resolutionStatus"]);
  return (payload.widgets as unknown[]).map((row) => {
    assert.ok(Array.isArray(row), "row projection entries must be arrays");
    return Object.fromEntries(payload.widgetFields.map((field: string, index: number) => [field, row[index]]));
  });
}

function assertHomepageResolvedCoverage(
  payload: Record<string, any>,
  expected: Array<{ type: string; subtool: string; widgetId?: string }>,
): Record<string, any>[] {
  const projectedWidgets = homepageProjectedWidgets(payload);
  const returnedTypes = new Set(
    projectedWidgets
      .filter((widget) => typeof widget.type === "string" && widget.type.length > 0)
      .map((widget) => widget.type),
  );
  assert.equal(returnedTypes.size, expected.length);
  for (const item of expected) {
    const representative = projectedWidgets.find((widget) => widget.type === item.type);
    assert.ok(representative, `homepage result must retain a representative for ${item.type}`);
    assert.equal(representative.subtool, item.subtool);
    if (item.widgetId) assert.equal(representative.widgetId, item.widgetId);
    assert.equal(typeof representative.widgetId, "string");
    assert.equal(typeof representative.index, "number");
    assert.equal(typeof representative.sectionId, "string");
    assert.equal(typeof representative.configRevision, "number");
  }
  return projectedWidgets;
}

const homepageReadCompactionOptions = {
  resolveCallReadOnly: safetyResolver,
  maxToolContentChars: 12_000,
  maxToolResultTokens: 4_000,
  maxObservationTokens: 12_000,
};
const homepageListResult = {
  status: "ok",
  surface: "desktop-homepage",
  layoutRevision: 42,
  widgets: homepageWidgets,
  warnings: [],
  padding: "x".repeat(40_000),
};
const homepageListMessages = homepageToolMessages("homepage-list", "instance.list", homepageListResult);
const homepageListRuntime = compactAgentMessages(homepageListMessages, homepageReadCompactionOptions);
const homepageListStorage = compactAgentSessionMessagesForStorage(homepageListMessages, homepageReadCompactionOptions);
for (const [label, compacted] of [["runtime", homepageListRuntime], ["storage", homepageListStorage]] as const) {
  const payload = compactedToolPayload(compacted, "homepage-list");
  assert.equal(payload.action, "instance.list", `${label} must retain homepage route action`);
  assert.equal(payload.status, "ok", `${label} must retain homepage list status`);
  assert.equal(payload.surface, "desktop-homepage", `${label} must retain homepage surface`);
  assert.equal(payload.layoutRevision, 42, `${label} must retain layout revision`);
  assert.equal(payload.widgetCount, homepageWidgets.length, `${label} widgetCount must use widgets.length`);
  assert.equal(payload.totalWidgetCount, homepageWidgets.length);
  assert.equal(payload.distinctResolvedTypeCount, HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.length);
  assert.equal(payload.resolvedWidgetCount, 42);
  assert.equal(payload.degradedWidgetCount, 1);
  const representativeMode = payload.coverageMode === "one_per_type";
  assert.equal(payload.truncated, representativeMode);
  assert.equal(payload.returnedWidgetCount, representativeMode ? 37 : 43);
  assert.equal(payload.returnedDegradedWidgetCount, 1);
  assert.equal(payload.omittedDuplicateWidgetCount, representativeMode ? 6 : 0);
  assert.equal(payload.omittedDegradedWidgetCount, 0);
  const projectedWidgets = assertHomepageResolvedCoverage(
    payload,
    HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.map((route) => ({ type: route.type, subtool: route.prefix })),
  );
  assert.equal(projectedWidgets.length, representativeMode ? 37 : 43);
  const degradedRepresentative = projectedWidgets.find((widget) => widget.type === null);
  assert.equal(degradedRepresentative?.widgetId, "homepage-widget-missing-config");
  assert.equal(degradedRepresentative?.index, 42);
  assert.equal(degradedRepresentative?.subtool, null);
  assert.equal(degradedRepresentative?.resolutionStatus, "missing_config");
  assert.equal("businessCapability" in projectedWidgets[0], false);
  assert.equal("docIds" in payload, false, `${label} must not use generic docIds projection`);
  assert.equal("blockIds" in payload, false, `${label} must not use generic blockIds projection`);
  assert.equal("titles" in payload, false, `${label} must not use generic titles projection`);
}

function worstCaseHomepageField(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(2, "0")}-${"x".repeat(80)}`.slice(0, 64);
}

const worstCaseResolved = HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.map((_, index) => ({
  type: worstCaseHomepageField("type", index),
  subtool: worstCaseHomepageField("subtool", index),
}));
const worstCaseOperations = Array.from({ length: 20 }, (_, index) => `operation-${index}-${"o".repeat(100)}`);
const worstCaseHomepageWidgets: Record<string, unknown>[] = [
  ...worstCaseResolved.map((expected, index) => ({
    widgetId: worstCaseHomepageField("widget", index),
    resolutionStatus: "resolved",
    type: expected.type,
    label: "L".repeat(120),
    index,
    sectionId: worstCaseHomepageField("section", index),
    sectionName: "S".repeat(120),
    configRevision: 100 + index,
    businessCapability: {
      toolName: "homepage_components",
      subtool: expected.subtool,
      operations: [...worstCaseOperations],
    },
    warnings: ["W".repeat(120), "Q".repeat(120)],
  })),
  ...Array.from({ length: 8 }, (_, index) => ({
    widgetId: worstCaseHomepageField("degraded-widget", index),
    resolutionStatus: "missing_config",
    type: null,
    label: "D".repeat(120),
    index: 36 + index,
    sectionId: worstCaseHomepageField("degraded-section", index),
    sectionName: "M".repeat(120),
    configRevision: null,
    businessCapability: null,
    warnings: ["E".repeat(120), "F".repeat(120)],
  })),
];
assert.equal(worstCaseHomepageWidgets.length, 44);
assert.equal(worstCaseResolved.every((item) => item.type.length === 64 && item.subtool.length === 64), true);
assert.equal(worstCaseOperations.length, 20);

const worstCaseHomepageListMessages = homepageToolMessages("homepage-list-worst-case", "instance.list", {
  status: "ok",
  surface: "desktop-homepage",
  layoutRevision: 42,
  widgets: worstCaseHomepageWidgets,
  warnings: ["P".repeat(120), "R".repeat(120), "T".repeat(120)],
  padding: "x".repeat(40_000),
});
const worstCaseHomepageListRuntime = compactAgentMessages(worstCaseHomepageListMessages, homepageReadCompactionOptions);
const worstCaseHomepageListStorage = compactAgentSessionMessagesForStorage(worstCaseHomepageListMessages, homepageReadCompactionOptions);
const HOMEPAGE_LIST_INTERNAL_CHAR_BUDGET = 11_000;
for (const [label, compacted] of [["runtime", worstCaseHomepageListRuntime], ["storage", worstCaseHomepageListStorage]] as const) {
  const payload = compactedToolPayload(compacted, "homepage-list-worst-case", HOMEPAGE_LIST_INTERNAL_CHAR_BUDGET);
  assert.equal(payload.totalWidgetCount, 44, `${label} worst case must retain total widget count`);
  assert.equal(payload.distinctResolvedTypeCount, 36);
  assert.equal(payload.degradedWidgetCount, 8);
  assert.equal(payload.coverageMode, "one_per_type");
  assert.equal(payload.truncated, true);
  const projectedWidgets = assertHomepageResolvedCoverage(payload, worstCaseResolved);
  const returnedDegradedWidgetCount = projectedWidgets.filter((widget) => widget.type === null).length;
  assert.equal(payload.returnedWidgetCount, projectedWidgets.length);
  assert.equal(payload.widgets.length, projectedWidgets.length);
  assert.equal(payload.returnedDegradedWidgetCount, returnedDegradedWidgetCount);
  assert.equal(payload.omittedDegradedWidgetCount, 8 - returnedDegradedWidgetCount);
  assert.equal(payload.omittedDuplicateWidgetCount, 0);
  assert.ok(returnedDegradedWidgetCount < 8, `${label} worst case must exercise degraded budget`);
  assert.equal("businessCapability" in projectedWidgets[0], false, `${label} worst case must not repeat capability objects`);
}

const homepageGetAction = "weather.instance.get";
const weatherRoute = HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.find((route) => route.type === "weather")!;
const homepageGetResult = {
  status: "ok",
  surface: "desktop-homepage",
  layoutRevision: 42,
  widgetId: "homepage-widget-7",
  resolutionStatus: "resolved",
  type: "weather",
  label: "天气",
  configRevision: 16,
  layoutIndex: 6,
  sectionId: "section-weather",
  sectionName: "天气区",
  editableFields: ["cityName"],
  readOnlyFields: ["type", "revision"],
  unsupportedFields: ["业务数据", "凭据", "本地绝对路径"],
  businessCapability: {
    toolName: "homepage_components",
    subtool: "weather",
    operations: [...weatherRoute.operations],
  },
  safeConfig: { cityName: "上海", appearanceMode: "compact", details: "z".repeat(6_000) },
  warnings: [],
  padding: "x".repeat(40_000),
};
const homepageGetMessages = homepageToolMessages("homepage-get", homepageGetAction, homepageGetResult, {
  widgetId: "homepage-widget-weather",
  expectedType: "weather",
});
const homepageGetRuntime = compactAgentMessages(homepageGetMessages, homepageReadCompactionOptions);
const homepageGetStorage = compactAgentSessionMessagesForStorage(homepageGetMessages, homepageReadCompactionOptions);
for (const [label, compacted] of [["runtime", homepageGetRuntime], ["storage", homepageGetStorage]] as const) {
  const payload = compactedToolPayload(compacted, "homepage-get");
  assert.equal(payload.action, homepageGetAction, `${label} must retain route-specific action`);
  assert.equal(payload.routeSubtool, "weather", `${label} must retain route subtool`);
  assert.equal(payload.layoutRevision, 42, `${label} must retain get layout revision`);
  assert.equal(payload.widgetId, "homepage-widget-7");
  assert.equal(payload.type, "weather");
  assert.equal(payload.layoutIndex, 6);
  assert.equal(payload.configRevision, 16);
  assert.equal(payload.sectionId, "section-weather");
  assert.equal(payload.editableFieldsTotalCount, 1);
  assert.equal(payload.editableFieldsReturnedCount, 1);
  assert.equal(payload.editableFieldsOmittedCount, 0);
  assert.equal(payload.readOnlyFieldsTotalCount, 2);
  assert.equal(payload.readOnlyFieldsReturnedCount, 2);
  assert.equal(payload.readOnlyFieldsOmittedCount, 0);
  assert.equal(payload.unsupportedFieldsTotalCount, 3);
  assert.equal(payload.unsupportedFieldsReturnedCount, 3);
  assert.equal(payload.unsupportedFieldsOmittedCount, 0);
  assert.equal(payload.fieldsTruncated, false);
  assert.equal(payload.businessCapability.operationCount, weatherRoute.operations.length);
  assert.equal("operations" in payload.businessCapability, false);
  assert.equal(payload.safeConfigTruncated, true);
  assert.equal("safeConfig" in payload, false);
  assert.equal(typeof payload.safeConfigPreview, "string");
  assert.ok(payload.safeConfigPreview.length > 0);
}

const maxGetIdentifier = (prefix: string): string => `${prefix}-${"i".repeat(200)}`;
const maxGetField = (prefix: string, index: number): string => `${prefix}-${index}-${"f".repeat(220)}`;
const maxGetFields = (prefix: string): string[] => Array.from({ length: 20 }, (_, index) => maxGetField(prefix, index));
const maxGetOperations = Array.from({ length: 20 }, (_, index) => maxGetField("operation", index));
const maxHomepageGetResult = {
  status: "ok",
  surface: "desktop-homepage",
  layoutRevision: 42,
  widgetId: maxGetIdentifier("widget"),
  resolutionStatus: "resolved",
  type: "weather",
  label: "L".repeat(64),
  configRevision: 16,
  layoutIndex: 6,
  sectionId: maxGetIdentifier("section"),
  sectionName: "S".repeat(64),
  editableFields: maxGetFields("editable"),
  readOnlyFields: maxGetFields("readonly"),
  unsupportedFields: maxGetFields("unsupported"),
  businessCapability: {
    toolName: "homepage_components",
    subtool: "weather",
    operations: maxGetOperations,
    supported: true,
    reason: "R".repeat(220),
  },
  safeConfig: { cityName: "上海", details: "z".repeat(10_000) },
  warnings: ["W".repeat(220), "Q".repeat(220), "E".repeat(220)],
  padding: "x".repeat(40_000),
};
const maxHomepageGetMessages = homepageToolMessages("homepage-get-max", homepageGetAction, maxHomepageGetResult, {
  widgetId: "homepage-widget-weather-max",
  expectedType: "weather",
});
const maxHomepageGetPayloads: Record<string, any>[] = [];
for (const [label, compacted] of [
  ["runtime", compactAgentMessages(maxHomepageGetMessages, homepageReadCompactionOptions)],
  ["storage", compactAgentSessionMessagesForStorage(maxHomepageGetMessages, homepageReadCompactionOptions)],
] as const) {
  const payload = compactedToolPayload(compacted, "homepage-get-max", HOMEPAGE_LIST_INTERNAL_CHAR_BUDGET);
  maxHomepageGetPayloads.push(payload);
  assert.equal(payload.action, homepageGetAction, `${label} max get must retain route action`);
  assert.equal(payload.routeSubtool, "weather", `${label} max get must retain route subtool`);
  assert.equal(payload.layoutRevision, 42);
  assert.equal(payload.widgetId.length, 64);
  assert.equal(payload.type, "weather");
  assert.equal(payload.label.length, 64);
  assert.equal(payload.layoutIndex, 6);
  assert.equal(payload.configRevision, 16);
  assert.equal(payload.sectionId.length, 64);
  assert.equal(payload.sectionName.length, 64);
  assert.equal(payload.warnings.length, 3);
  assert.equal(payload.warnings.every((warning: unknown) => typeof warning === "string" && warning.length <= 64), true);
  assert.equal(payload.businessCapability.operationCount, 20);
  assert.equal(payload.businessCapability.supported, true);
  assert.equal("operations" in payload.businessCapability, false);
  assert.equal(payload.safeConfigTruncated, true);
  assert.equal("safeConfig" in payload, false);
  assert.equal(typeof payload.safeConfigPreview, "string");
  assert.ok(payload.safeConfigPreview.length > 0);
  let omittedFieldCount = 0;
  for (const field of ["editableFields", "readOnlyFields", "unsupportedFields"] as const) {
    const values = payload[field];
    assert.ok(Array.isArray(values));
    assert.equal(payload[`${field}TotalCount`], 20);
    assert.equal(payload[`${field}ReturnedCount`], values.length);
    assert.equal(payload[`${field}OmittedCount`], 20 - values.length);
    omittedFieldCount += payload[`${field}OmittedCount`];
  }
  assert.equal(payload.fieldsTruncated, omittedFieldCount > 0);
}
assert.deepEqual(maxHomepageGetPayloads[0], maxHomepageGetPayloads[1]);

const malformedHomepageList = homepageToolMessages("homepage-list-malformed", "instance.list", {
  status: "ok",
  surface: "desktop-homepage",
  layoutRevision: 42,
  padding: "x".repeat(40_000),
});
const malformedRuntime = compactedToolPayload(
  compactAgentMessages(malformedHomepageList, homepageReadCompactionOptions),
  "homepage-list-malformed",
);
const malformedStorage = compactedToolPayload(
  compactAgentSessionMessagesForStorage(malformedHomepageList, homepageReadCompactionOptions),
  "homepage-list-malformed",
);
for (const [label, payload] of [["runtime", malformedRuntime], ["storage", malformedStorage]] as const) {
  assert.equal(payload.status, "shape_error", `${label} malformed homepage list must be explicit`);
  assert.equal(payload.widgetCount, null, `${label} malformed homepage list must not claim zero widgets`);
  assert.match(payload.shapeWarning, /widgets/);
}

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
assert.equal("userMessage" in conversation.currentTurn, false);
assert.equal(conversation.compactionStatus.coveredThroughTurnIndex, second.snapshot?.coveredThroughTurnIndex);
assert.ok(conversation.manifest.entries.some((entry) => entry.source === "compaction-snapshot"));
assert.equal(conversation.recentTurns.length, uncoveredAfterSnapshot.length / 2);
assert.ok(uncoveredAfterSnapshot.length < uncoveredWithoutSnapshot.length, "持久化压缩后未覆盖的历史消息必须减少");
const rendered = renderContextInstructions({ conversationContext: conversation });
assert.equal(rendered.includes("第 9 轮问题"), false, "历史正文不能再被 JSON 塞进 system context");
assert.ok(rendered.length > 0, "压缩后 contextInstructions 必须重新生成");

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
