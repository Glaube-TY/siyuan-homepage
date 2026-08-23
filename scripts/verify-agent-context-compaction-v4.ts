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
import { sanitizeWidgetConfigForAgent, isSecurityRedactedValue } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-sanitizer";
import {
  queryTasksInputSchema,
  queryTasksOutputSchema,
} from "../src/features/kb/services/agent-workbench/tools/siyuan/contracts/query-tasks.contract";
import {
  queryDiaryRecordsInputSchema,
  queryDiaryRecordsOutputSchema,
} from "../src/features/kb/services/agent-workbench/tools/siyuan/contracts/query-diary-records.contract";
import {
  findDiaryDocsInputSchema,
  findDiaryDocsOutputSchema,
} from "../src/features/kb/services/agent-workbench/tools/siyuan/contracts/find-diary-docs.contract";
import {
  getDailyWorkspaceOverviewInputSchema,
  getDailyWorkspaceOverviewOutputSchema,
} from "../src/features/kb/services/agent-workbench/tools/siyuan/contracts/get-daily-workspace-overview.contract";

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
registerSafetyTool(safetyRegistry, "siyuan_database", false, (args) => {
  const nested = args.args && typeof args.args === "object" ? args.args as Record<string, unknown> : args;
  const rawAction = typeof args.action === "string" ? args.action : "";
  const action = rawAction.startsWith("database.") ? rawAction.slice("database.".length) : rawAction;
  const readOnlySubActions = ["filter_sort", "primary_key_values", "keys_by_av_id", "keys_by_block_id"];
  return ["list", "read", "find_rows"].includes(action)
    || (action === "extra_read" && typeof nested.action === "string" && readOnlySubActions.includes(nested.action))
    || (rawAction.startsWith("extra_read.") && readOnlySubActions.includes(rawAction.slice("extra_read.".length)));
});
registerSafetyTool(safetyRegistry, "diary_task", false, (args) => {
  const nested = args.args && typeof args.args === "object" ? args.args as Record<string, unknown> : args;
  const action = typeof args.action === "string" ? args.action : typeof nested.action === "string" ? nested.action : "";
  return ["overview", "query_tasks", "query_records", "find_docs"].includes(action);
});
for (const name of ["query_tasks", "query_diary_records", "find_diary_docs", "get_daily_workspace_overview"]) {
  registerSafetyTool(safetyRegistry, name, true);
}
const safetyResolver = (toolName: string, args?: Record<string, unknown>) =>
  resolveNativeToolReadOnly(safetyRegistry, toolName, args);
assert.equal(safetyResolver("notebrain_file", { action: "write_file" }), false);
assert.equal(safetyResolver("notebrain_file", { action: "read_file" }), true);
assert.equal(safetyResolver("siyuan_asset", { action: "workspace_file", args: { action: "read_dir" } }), true);
assert.equal(safetyResolver("homepage_components", { action: "weather.instance.get" }), true);
assert.equal(safetyResolver("diary_task", { action: "unrecognized_subaction" }), false, "未识别 Action 不得被判定为只读");
assert.equal(safetyResolver("diary_task", { action: "overview" }), true);
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

// TASK-20260821-028: compactHomepageInstanceGet editableConfig projection
{
  const longText = "这是一段非常长的文字内容。".repeat(300);
  const rawPayload = {
    ok: true,
    data: {
      status: "ok",
      surface: "desktop-homepage",
      layoutRevision: 1,
      widgetId: "custom-text-1",
      resolutionStatus: "resolved",
      type: "custom-text",
      label: "文字内容",
      configRevision: 1,
      layoutIndex: 0,
      sectionId: null,
      sectionName: null,
      editableConfig: { customText: longText },
      editableFields: ["customText"],
      readOnlyFields: ["type", "instanceId", "schema", "version", "revision"],
      unsupportedFields: ["业务数据", "凭据", "本地绝对路径"],
      safeConfig: { type: "custom-text", data: [{ customText: longText }] },
      warnings: [],
    },
  };
  const sessionMessages = homepageToolMessages("call-get-1", "custom_text.instance.get", rawPayload.data, {
    widgetId: "custom-text-1",
  });
  const compacted = compactAgentSessionMessagesForStorage(sessionMessages, homepageReadCompactionOptions);
  const toolMsg = compacted.find((m) => m.role === "tool");
  assert.ok(toolMsg, "必须保留 tool observation");
  const parsed = JSON.parse(toolMsg.content);
  assert.deepEqual(parsed.redactedEditableFields, []);
  assert.equal(parsed.status, "ok");
  assert.equal(typeof parsed.editableConfig, "object");
  assert.ok(parsed.editableConfig.customText.includes("这是一段非常长的文字内容"));
  assert.equal(parsed.editableConfig.customText.includes("[已截断]"), true, "超长 customText 必须带显式截断标记");
  assert.equal(parsed.editableConfigTruncated, true);

  // TASK-20260821-030: 真实 raw config（含 URL 用户名、密码及查询 Token）经脱敏与投影后进入 observation compaction，断言原凭据绝不泄漏
  const rawWebConfig = { type: "custom-web", data: [{ url: "https://alice:SUPER_SECRET@example.com/page?token=TOP_SECRET&mode=1" }] };
  const rawData = rawWebConfig.data[0];
  const sanitizedUrl = sanitizeWidgetConfigForAgent(rawData.url);
  const isRedacted = isSecurityRedactedValue(rawData.url, sanitizedUrl);
  assert.equal(isRedacted, true);
  const realWebPayload = {
    status: "ok",
    surface: "desktop-homepage",
    layoutRevision: 1,
    widgetId: "custom-web-1",
    resolutionStatus: "resolved",
    type: "custom-web",
    label: "网页",
    configRevision: 1,
    layoutIndex: 1,
    sectionId: null,
    sectionName: null,
    editableConfig: {},
    redactedEditableFields: isRedacted ? ["url"] : [],
    editableFields: ["url"],
    readOnlyFields: ["type", "instanceId", "schema", "version", "revision"],
    unsupportedFields: ["业务数据", "凭据", "本地绝对路径"],
    safeConfig: sanitizeWidgetConfigForAgent(rawWebConfig),
    warnings: [],
  };
  const secretMessages = homepageToolMessages("call-get-secret", "custom_web.instance.get", realWebPayload, {
    widgetId: "custom-web-1",
  });
  const compactedSecret = compactAgentSessionMessagesForStorage(secretMessages, homepageReadCompactionOptions);
  const secretToolMsg = compactedSecret.find((m) => m.role === "tool");
  assert.ok(secretToolMsg, "必须保留 secret tool observation");
  const secretParsed = JSON.parse(secretToolMsg.content);
  assert.deepEqual(secretParsed.redactedEditableFields, ["url"]);
  assert.equal("url" in secretParsed.editableConfig, false);
  assert.equal(secretToolMsg.content.includes("alice"), false, "compacted observation 绝对不得包含 alice");
  assert.equal(secretToolMsg.content.includes("SUPER_SECRET"), false, "compacted observation 绝对不得包含 SUPER_SECRET");
  assert.equal(secretToolMsg.content.includes("TOP_SECRET"), false, "compacted observation 绝对不得包含 TOP_SECRET");
}

// ── TASK-20260822-055: siyuan_database 聚合 envelope 的有界领域投影 ──
{
  const bookTitles = ["三体", "球状闪电", "流浪地球", "黑暗森林", "死神永生", "超新星纪元", "中国2185"];
  const databaseReadPayload = {
    database: { databaseId: "20260801-library-av", name: "图书主库", views: [
      { viewId: "view-table-all", name: "全部图书", type: "table" },
      { viewId: "view-gallery-cover", name: "封面墙", type: "gallery" },
    ] },
    viewId: "view-table-all",
    schema: [
      { keyId: "key-title", name: "书名", type: "block" },
      { keyId: "key-author", name: "作者", type: "text" },
      { keyId: "key-rating", name: "评分", type: "number" },
    ],
    rows: bookTitles.map((title, index) => ({
      rowId: `row-book-${index + 1}`,
      boundBlockId: `block-book-${index + 1}`,
      title,
      cells: {
        书名: { keyId: "key-title", name: "书名", type: "text", text: title },
        作者: { keyId: "key-author", name: "作者", type: "text", text: index % 2 === 0 ? "刘慈欣" : "其他作者" },
      },
    })),
    rowCount: 7,
    truncated: false,
    warnings: [],
    padding: "z".repeat(40_000),
  };
  // 真实生产 envelope：外层 executionOutcomeToNativeResult + 聚合层；result 直接是 bindingData。
  // read 的 bindingData 直接是 ReadAttributeViewOutput；extra_read 的 bindingData 是 SiyuanToolOutput{action,...}。
  const SECRET_PASSWORD = "SUP3R_SECRET_PASSWORD";
  const SECRET_TOKEN = "tok_9f8e7d6c5b4a";
  const SECRET_BEARER = "Bearer abc.def.ghi";
  const SECRET_API_KEY = "api_4e3d2c1b";
  const SECRET_COOKIE = "session=private-cookie";
  const SECRET_CREDENTIAL = "credential-private-value";
  const SECRET_PRIVATE_KEY = "private-key-material";
  const SECRET_URL = "https://alice:hunter2@example.com/upload?api_key=KA9P8L7M";
  const SECRET_WIN_PATH = "C:\\Users\\dev\\秘密\\绝对路径\\notes.md";
  const SECRET_UNIX_PATH = "/home/dev/.config/secrets.env";
  const SIYUAN_PATHS = ["/daily note/2026/08/2026-08-22", "/六月的一个夜晚"];
  const PUBLIC_URL = "https://example.com/library?view=all";
  const LONG_FIELD_KEY = `metadata_${"x".repeat(70)}`;
  const ALL_SECRETS = [
    SECRET_PASSWORD, SECRET_TOKEN, SECRET_BEARER, SECRET_API_KEY, SECRET_COOKIE,
    SECRET_CREDENTIAL, SECRET_PRIVATE_KEY, SECRET_URL, SECRET_WIN_PATH, SECRET_UNIX_PATH,
  ];
  const secretNote = `password=${SECRET_PASSWORD}; token=${SECRET_TOKEN}; Authorization: ${SECRET_BEARER}; url=${SECRET_URL}; win=${SECRET_WIN_PATH}; unix=${SECRET_UNIX_PATH}`;
  const structuredSecrets = {
    password: SECRET_PASSWORD,
    nested: {
      accessToken: SECRET_TOKEN,
      apiKey: SECRET_API_KEY,
      authorization: SECRET_BEARER,
      cookie: SECRET_COOKIE,
      credential: SECRET_CREDENTIAL,
      privateKey: SECRET_PRIVATE_KEY,
    },
  };

  const aggregateEnvelope = (outerAction: string, bindingData: unknown) => JSON.stringify({
    ok: true,
    toolName: "siyuan_database",
    data: { action: outerAction, result: bindingData },
  });
  const dbMessages = (
    toolCallId: string,
    outerAction: string,
    bindingData: unknown,
    args: Record<string, unknown> = {},
  ) => normalizeToolCallMessages([
    { role: "assistant", content: "", toolCalls: [{ id: toolCallId, name: "siyuan_database", arguments: JSON.stringify({ action: outerAction, args }) }] },
    { role: "tool", toolCallId, name: "siyuan_database", content: aggregateEnvelope(outerAction, bindingData) },
  ]);

  // 1. read：保留数据库/当前视图身份、视图类型、schema、行数与全部书名
  const dbReadStorage = compactAgentSessionMessagesForStorage(dbMessages("db-read", "read", databaseReadPayload), homepageReadCompactionOptions);
  const dbReadRuntime = compactAgentMessages(dbMessages("db-read", "read", databaseReadPayload), homepageReadCompactionOptions);
  for (const [label, compacted] of [["storage", dbReadStorage], ["runtime", dbReadRuntime]] as const) {
    const payload = compactedToolPayload(compacted, "db-read", 12_000);
    assert.equal(payload.databaseId, "20260801-library-av", `${label} 必须保留数据库 ID`);
    assert.equal(payload.databaseName, "图书主库", `${label} 必须保留数据库名称`);
    assert.equal(payload.currentViewId, "view-table-all", `${label} 必须保留当前视图`);
    assert.equal(payload.currentViewName, "全部图书", `${label} 必须保留当前视图名称`);
    assert.equal(payload.currentViewType, "table", `${label} 必须保留视图类型`);
    assert.deepEqual(payload.primaryKey, { keyId: "key-title", name: "书名", type: "block" }, `${label} 必须明确主字段身份`);
    assert.equal(payload.rowCount, 7, `${label} 必须保留总行数`);
    assert.equal(payload.schemaKeys.length, 3, `${label} 必须保留字段 schema`);
    const rowTitles = (payload.rows as Array<{ title?: string }>).map((row) => row.title);
    assert.deepEqual([...rowTitles].sort(), [...bookTitles].sort(), `${label} 必须保留全部书名`);
    assert.equal(payload.padding, undefined, `${label} 不得保留原始大正文填充`);
    assert.ok(String(payload.note).includes("siyuan_database"));
  }

  // 2. extra_read.filter_sort：结构化规则完整保留，字符串值经同一脱敏边界
  const filterSortData = {
    sortRules: [{ field: "评分", direction: "desc" }],
    filterRules: [{ field: "评分", op: ">=", value: "8" }],
  };
  const filterSortWithSecrets = {
    sortRules: [{ field: "备注", direction: `asc ${SECRET_UNIX_PATH}` }],
    filterRules: [
      { field: "来源", op: "==", value: SECRET_URL },
      { field: "文档路径", op: "in", value: SIYUAN_PATHS },
    ],
    security: structuredSecrets,
    publicUrl: PUBLIC_URL,
    [LONG_FIELD_KEY]: "字段名必须保持完整",
  };
  const fsPayload = compactedToolPayload(
    compactAgentSessionMessagesForStorage(dbMessages("db-filter-sort", "extra_read.filter_sort", { action: "filter_sort", data: filterSortData }, { action: "filter_sort", avID: "20260801-library-av", blockID: "block-av-root" }), homepageReadCompactionOptions),
    "db-filter-sort",
  );
  assert.equal(fsPayload.innerAction, "filter_sort");
  assert.deepEqual(fsPayload.filterSort, filterSortData, "筛选排序规则必须完整保留");
  const fsSecretMessages = dbMessages("db-fs-secret-short", "extra_read.filter_sort", { action: "filter_sort", data: filterSortWithSecrets }, { action: "filter_sort", avID: "20260801-library-av", blockID: "block-av-root" });
  const fsSecretVariants = [
    ["storage", compactAgentSessionMessagesForStorage(fsSecretMessages, homepageReadCompactionOptions)],
    ["runtime", compactAgentMessages(fsSecretMessages, homepageReadCompactionOptions)],
  ] as const;
  for (const [label, compacted] of fsSecretVariants) {
    const payload = compactedToolPayload(compacted, "db-fs-secret-short");
    const serialized = JSON.stringify(payload);
    for (const secret of ALL_SECRETS) {
      assert.equal(serialized.includes(secret), false, `${label} 短 filter_sort 不得泄漏：${secret}`);
    }
    for (const path of SIYUAN_PATHS) {
      assert.equal(serialized.includes(path), true, `${label} 必须逐字保留思源逻辑路径：${path}`);
    }
    assert.equal(serialized.includes(PUBLIC_URL), true, `${label} 必须保留普通公开 URL`);
    assert.equal(serialized.includes(LONG_FIELD_KEY), true, `${label} 不得裁剪结构化字段名`);
  }
  const fsSecretShort = compactedToolPayload(fsSecretVariants[0][1], "db-fs-secret-short");
  assert.equal((fsSecretShort.filterSort as { sortRules?: unknown[] }).sortRules?.length, 1, "脱敏后排序规则结构必须保留");

  // 3. extra_read.primary_key_values：保留全部主键值文本
  const pkData = { values: bookTitles.map((title) => ({ text: title })), totalPageCount: 1 };
  const pkPayload = compactedToolPayload(
    compactAgentSessionMessagesForStorage(dbMessages("db-pk", "extra_read.primary_key_values", { action: "primary_key_values", data: pkData }, { action: "primary_key_values", avID: "20260801-library-av" }), homepageReadCompactionOptions),
    "db-pk",
  );
  assert.deepEqual(pkPayload.primaryKeyValues, bookTitles, "主键值必须完整保留");

  // 4. 未识别形态（短/长）：明确 shape_unknown，预览无论长短都必须脱敏，不伪造计数
  const unknownWeird = {
    action: "keys_by_av_id",
    data: { security: structuredSecrets, note: secretNote, paths: SIYUAN_PATHS, publicUrl: PUBLIC_URL, weird: { nested: true } },
  };
  const unknownLong = { ...unknownWeird, padding: "p".repeat(3_000) };
  for (const [label, bindingData] of [["short", unknownWeird], ["long", unknownLong]] as const) {
    const storagePayload = compactedToolPayload(
      compactAgentSessionMessagesForStorage(dbMessages(`db-unknown-${label}`, "extra_read.keys_by_av_id", bindingData, { action: "keys_by_av_id", avID: "20260801-library-av" }), homepageReadCompactionOptions),
      `db-unknown-${label}`,
    );
    assert.equal(storagePayload.status, "compacted_shape_unknown", `${label} 未识别形态必须显式标记`);
    assert.equal(typeof storagePayload.preview, "string", `${label} 预览必须是已脱敏的序列化字符串`);
    assert.equal("itemCount" in storagePayload, false, `${label} 未识别形态不得伪造空集合计数`);
    const runtimePayload = compactedToolPayload(
      compactAgentMessages(dbMessages(`db-unknown-${label}-rt`, "extra_read.keys_by_av_id", bindingData, { action: "keys_by_av_id", avID: "20260801-library-av" }), homepageReadCompactionOptions),
      `db-unknown-${label}-rt`,
    );
    for (const payload of [storagePayload, runtimePayload]) {
      const serializedPayload = JSON.stringify(payload);
      for (const secret of ALL_SECRETS) {
        assert.equal(serializedPayload.includes(secret), false, `${label} 不得泄漏原始敏感值：${secret}`);
      }
    }
  }
}

// ── diary_task 只读投影与 Checkpoint 恢复验证 ──
{
  const SECRET_USERINFO_URL = "https://admin:secretUserPass999@internal.siyuan.local/api/tasks";
  const SECRET_API_KEY = "api_key=sk-live-confidentialToken888";
  const SECRET_DIARY_WIN_PATH = "D:\\Confidential\\DailyNotes\\secret_plan.md";
  const SECRET_DIARY_UNIX_PATH = "/Users/developer/secret_vault/diary.md";
  const ALL_DIARY_SECRETS = [
    "secretUserPass999",
    "sk-live-confidentialToken888",
    "Confidential\\DailyNotes",
    "/secret_vault",
  ];

  const diaryEnvelope = (action: string, resultData: unknown) => JSON.stringify({
    ok: true,
    toolName: "diary_task",
    data: { action, result: resultData },
  });
  const diaryMessages = (
    toolCallId: string,
    action: string,
    resultData: unknown,
    args: Record<string, unknown> = {},
  ) => normalizeToolCallMessages([
    {
      role: "assistant",
      content: "",
      toolCalls: [{
        id: toolCallId,
        name: "diary_task",
        arguments: JSON.stringify({ action, args }),
      }],
    },
    {
      role: "tool",
      toolCallId,
      name: "diary_task",
      content: diaryEnvelope(action, resultData),
    },
  ]);

  // 1. query_tasks：39 条真实任务（含 2026-08-22 与 2026-08-23、同名不同 ID、敏感信息脱敏）
  const tasks39 = Array.from({ length: 39 }, (_, index) => {
    const isToday = index < 20;
    const deadline = isToday ? "2026-08-22" : "2026-08-23";
    return {
      taskId: `task-${index + 1}`,
      blockId: `block-${index + 1}`,
      rootId: `doc-${(index % 5) + 1}`,
      box: "box-main",
      hpath: `/daily note/2026/08/${deadline}`,
      markdown: `* [ ] 任务 ${index + 1}`,
      taskname: index === 0
        ? `重构日记压缩 ${SECRET_USERINFO_URL}`
        : index === 1
          ? `清理凭据 ${SECRET_API_KEY}`
          : index % 3 === 0
            ? "重构数据库视图与行合并"
            : `任务项 ${index + 1}`,
      completed: false,
      priority: index % 2 === 0 ? "1" : "2",
      startDate: "2026-08-20",
      deadline,
      recurrence: "",
      reminder: "",
      location: index === 0 ? SECRET_DIARY_WIN_PATH : "",
      tags: ["dev", "review"],
      sourceKind: "normal" as const,
      sourceDate: "2026-08-20",
      sourceDocId: `doc-${(index % 5) + 1}`,
      sourceDocTitle: `2026-08-20 日记 ${index === 0 ? SECRET_DIARY_UNIX_PATH : ""}`,
      isTodayTask: isToday,
      isOverdue: false,
      shouldMigrate: false,
    };
  });

  const queryTasksPayloadRaw = {
    date: "2026-08-22",
    tasks: tasks39,
    totalMatched: 39,
    returned: 39,
    note: `查询到 39 条未完成任务 ${SECRET_API_KEY}，包含详细任务描述与上下文信息。`.repeat(60),
  };

  const qtArgsRaw = { scope: "all" as const, date: "2026-08-22", status: "not_done" as const, limit: 50 };
  const qtArgs = queryTasksInputSchema.parse(qtArgsRaw);
  const queryTasksPayload = queryTasksOutputSchema.parse(queryTasksPayloadRaw);
  const qtMessages = diaryMessages("qt-39", "query_tasks", queryTasksPayload, qtArgs);
  const qtStorageCompacted = compactAgentSessionMessagesForStorage(qtMessages, homepageReadCompactionOptions);
  const qtRuntimeCompacted = compactAgentMessages(qtMessages, homepageReadCompactionOptions);

  for (const [label, compacted] of [["storage", qtStorageCompacted], ["runtime", qtRuntimeCompacted]] as const) {
    const payload = compactedToolPayload(compacted, "qt-39", 12_000);
    assert.equal(payload.ok, true, `${label} 必须成功`);
    assert.equal(payload.action, "query_tasks", `${label} 必须保留 action`);
    assert.equal(payload.queryScope, "all", `${label} 必须保留 queryScope`);
    assert.equal(payload.queryDate, "2026-08-22", `${label} 必须保留 queryDate`);
    assert.equal(payload.queryStatus, "not_done", `${label} 必须保留 queryStatus`);
    assert.equal(payload.queryLimit, 50, `${label} 必须保留 queryLimit`);
    assert.equal(payload.totalMatched, 39, `${label} 必须保留 totalMatched=39`);
    assert.equal(payload.returned, 39, `${label} 必须保留 returned=39`);
    assert.equal(payload.returnedTaskCount, 39, `${label} 必须保留 returnedTaskCount=39`);
    assert.equal(payload.omittedTaskCount, 0, `${label} omittedTaskCount 必须为 0`);
    assert.equal(payload.truncated, false, `${label} truncated 必须为 false`);
    assert.ok(Array.isArray(payload.taskFields), `${label} 必须包含 taskFields`);
    assert.equal((payload.tasks as unknown[]).length, 39, `${label} 必须保留全部 39 条任务行`);

    // 检查第 1 条（2026-08-22 截止，isTodayTask: true）与第 25 条（2026-08-23 截止，isTodayTask: false）
    const taskRows = payload.tasks as unknown[][];
    const task1 = taskRows[0];
    const task25 = taskRows[24];
    assert.equal(task1[0], "task-1");
    assert.equal(task1[6], "2026-08-22", "第 1 条截止日期必须是 2026-08-22");
    assert.equal(task1[10], true, "第 1 条 isTodayTask 必须是 true");
    assert.equal(task25[0], "task-25");
    assert.equal(task25[6], "2026-08-23", "第 25 条截止日期必须是 2026-08-23");
    assert.equal(task25[10], false, "第 25 条 isTodayTask 必须是 false");

    // 敏感凭据/路径脱敏检查
    const serialized = JSON.stringify(payload);
    for (const secret of ALL_DIARY_SECRETS) {
      assert.equal(serialized.includes(secret), false, `${label} 不得泄露敏感值：${secret}`);
    }
  }

  // 2. query_tasks 合法极限用例（limit: 50 契约上限，totalMatched: 85，50 条长任务触发压缩收缩）
  const tasks50 = Array.from({ length: 50 }, (_, index) => ({
    taskId: `legal-limit-task-${index + 1}`,
    blockId: `legal-limit-block-${index + 1}`,
    markdown: `* [ ] 合法契约极限任务 ${index + 1} - 详细描述信息与上下文 `.repeat(3),
    taskname: `合法契约极限任务 ${index + 1} 包含了较为详细的长业务标题用于验证行式压缩边界 `.repeat(2),
    completed: false,
    priority: "1",
    startDate: "2026-08-20",
    deadline: "2026-08-25",
    recurrence: "",
    reminder: "",
    location: "",
    tags: ["contract-limit", "perf"],
    sourceKind: "normal" as const,
    sourceDate: "2026-08-20",
    sourceDocId: `doc-legal-${index + 1}`,
    sourceDocTitle: `2026-08-20 日记文档详细长标题用于增加负载 ${index + 1}`,
    isTodayTask: false,
    isOverdue: false,
    shouldMigrate: false,
  }));
  const legalLimitPayloadRaw = {
    date: "2026-08-22",
    tasks: tasks50,
    totalMatched: 85,
    returned: 50,
    note: "查询到 85 条任务，按契约上限 limit=50 返回前 50 条",
  };
  const legalLimitArgs = queryTasksInputSchema.parse({ scope: "all", limit: 50 });
  const legalLimitPayload = queryTasksOutputSchema.parse(legalLimitPayloadRaw);
  const llMessages = diaryMessages("qt-50-limit", "query_tasks", legalLimitPayload, legalLimitArgs);
  const llStorage = compactAgentSessionMessagesForStorage(llMessages, homepageReadCompactionOptions);
  const llRuntime = compactAgentMessages(llMessages, homepageReadCompactionOptions);

  for (const [label, compacted] of [["storage", llStorage], ["runtime", llRuntime]] as const) {
    const payload = compactedToolPayload(compacted, "qt-50-limit", 12_000);
    assert.equal(payload.totalMatched, 85, `${label} 服务端匹配总数必须为 85`);
    assert.equal(payload.returned, 50, `${label} 服务端返回数必须为 50`);
    assert.equal(payload.truncated, true, `${label} 触发压缩收缩后 truncated 必须为 true`);
    assert.ok((payload.returnedTaskCount as number) < 50, `${label} 压缩层保留行数必须收缩小于 50`);
    assert.ok((payload.omittedTaskCount as number) > 0, `${label} 压缩层省略行数必须大于 0`);
    assert.equal((payload.returnedTaskCount as number) + (payload.omittedTaskCount as number), 50, `${label} 保留数与省略数之和必须等于服务端返回的 50 条`);
    assert.ok(Array.isArray(payload.taskFields), `${label} 必须包含 taskFields`);
  }

  // 3. query_records：5 条记录（覆盖 storage 与 runtime 双路径）
  const records5 = Array.from({ length: 5 }, (_, index) => ({
    recordId: `record-${index + 1}`,
    date: `2026-08-2${index}`,
    docId: `doc-rec-${index + 1}`,
    docTitle: `2026-08-2${index} 日记`,
    categoryTitle: "工作记录",
    headingTitle: `### 上午进展 ${index === 0 ? SECRET_USERINFO_URL : ""}`,
    timeText: "10:30",
    content: `完成模块 ${index + 1} 重构。凭据 ${SECRET_API_KEY} 路径 ${SECRET_DIARY_WIN_PATH}，详细开发进展与测试用例验证说明。`.repeat(40),
    headingBlockId: `heading-block-${index + 1}`,
  }));
  const qrArgsRaw = { startDate: "2026-08-20", endDate: "2026-08-24" };
  const qrPayloadRaw = {
    startDate: "2026-08-20",
    endDate: "2026-08-24",
    records: records5,
    totalMatched: 5,
    returned: 5,
    note: `Found 5 records with note info ${SECRET_USERINFO_URL} 详细记录查询结果摘要，包含多个文档的日记内容索引与分类总结。`.repeat(50),
  };
  const qrArgs = queryDiaryRecordsInputSchema.parse(qrArgsRaw);
  const qrPayload = queryDiaryRecordsOutputSchema.parse(qrPayloadRaw);
  const qrMessages = diaryMessages("qr-5", "query_records", qrPayload, qrArgs);
  const qrStorage = compactAgentSessionMessagesForStorage(qrMessages, homepageReadCompactionOptions);
  const qrRuntime = compactAgentMessages(qrMessages, homepageReadCompactionOptions);

  for (const [label, compacted] of [["storage", qrStorage], ["runtime", qrRuntime]] as const) {
    const payload = compactedToolPayload(compacted, "qr-5", 12_000);
    assert.equal(payload.totalMatched, 5, `${label} totalMatched 必须为 5`);
    assert.equal(payload.returnedRecordCount, 5, `${label} returnedRecordCount 必须为 5`);
    assert.ok(Array.isArray(payload.recordFields), `${label} 必须包含 recordFields`);
    assert.equal((payload.records as unknown[]).length, 5, `${label} 必须保留全部 5 条记录`);
    const serialized = JSON.stringify(payload);
    for (const secret of ALL_DIARY_SECRETS) {
      assert.equal(serialized.includes(secret), false, `${label} query_records 不得泄漏：${secret}`);
    }
  }

  // 4. find_docs：3 篇日记文档（覆盖 storage 与 runtime 双路径）
  const docs3 = Array.from({ length: 3 }, (_, index) => ({
    period: "day" as const,
    date: `2026-08-2${index}`,
    docId: `doc-diary-${index + 1}`,
    title: `2026-08-2${index}`,
    exists: true,
    range: { start: `2026-08-2${index}`, end: `2026-08-2${index}` },
    status: "completed" as const,
    markdownPreview: `# 2026-08-2${index} 日记\n路径 ${SECRET_DIARY_UNIX_PATH} 包含凭据 ${SECRET_API_KEY}，详细 Markdown 正文内容与各段落记录。`.repeat(40),
    truncated: false,
  }));
  const fdArgsRaw = { period: "day" as const, startDate: "2026-08-20", endDate: "2026-08-22" };
  const fdPayloadRaw = {
    period: "day" as const,
    startDate: "2026-08-20",
    endDate: "2026-08-22",
    docs: docs3,
    returned: 3,
    totalChecked: 3,
    note: `Found 3 docs ${SECRET_USERINFO_URL} 详细文档检索结果摘要，包含全部有效周期范围内的日记文档元数据。`.repeat(50),
  };
  const fdArgs = findDiaryDocsInputSchema.parse(fdArgsRaw);
  const fdPayload = findDiaryDocsOutputSchema.parse(fdPayloadRaw);
  const fdMessages = diaryMessages("fd-3", "find_docs", fdPayload, fdArgs);
  const fdStorage = compactAgentSessionMessagesForStorage(fdMessages, homepageReadCompactionOptions);
  const fdRuntime = compactAgentMessages(fdMessages, homepageReadCompactionOptions);

  for (const [label, compacted] of [["storage", fdStorage], ["runtime", fdRuntime]] as const) {
    const payload = compactedToolPayload(compacted, "fd-3", 12_000);
    assert.equal(payload.totalChecked, 3, `${label} totalChecked 必须为 3`);
    assert.equal(payload.returnedDocCount, 3, `${label} returnedDocCount 必须为 3`);
    assert.ok(Array.isArray(payload.docFields), `${label} 必须包含 docFields`);
    assert.equal((payload.docs as unknown[]).length, 3, `${label} 必须保留全部 3 篇文档`);
    const serialized = JSON.stringify(payload);
    for (const secret of ALL_DIARY_SECRETS) {
      assert.equal(serialized.includes(secret), false, `${label} find_docs 不得泄漏：${secret}`);
    }
  }

  // 5. overview：增强日记工作区总览（严格符合 GetDailyWorkspaceOverviewOutput 契约，覆盖 limits, counts, carryoverPlans 及双路径）
  const overviewLimits = {
    tasks: 50,
    records: 50,
    projects: 20,
    notifications: 30,
    reviews: 10,
    carryoverPlans: 10,
  };
  const overviewCounts = {
    tasksTotal: 39,
    tasksReturned: 2,
    tasksTruncated: true,
    recordsTotal: 8,
    recordsReturned: 1,
    recordsTruncated: true,
    projectsTotal: 3,
    projectsReturned: 1,
    projectsTruncated: false,
    notificationsTotal: 2,
    notificationsReturned: 1,
    notificationsTruncated: false,
    reviewsTotal: 1,
    reviewsReturned: 1,
    reviewsTruncated: false,
    carryoverPlansTotal: 2,
    carryoverPlansReturned: 1,
    carryoverPlansTruncated: true,
  };
  const overviewCarryoverPlans = [
    {
      period: "week" as const,
      periodLabel: "本周计划",
      sourceLabel: "2026-W34",
      sourceDateOrRange: "2026-08-18~2026-08-24",
      fieldLabel: "下周待办",
      content: `推进日记压缩与回归 ${SECRET_API_KEY}`,
      lines: ["完成 limits 与 counts 契约投影", `清理路径 ${SECRET_DIARY_WIN_PATH}`],
      docId: "carryover-doc-1",
    },
  ];
  const overviewDataRaw = {
    date: "2026-08-22",
    todayDiaryExists: true,
    todayDiary: { docId: "today-doc-id", title: "2026-08-22", date: "2026-08-22" },
    templateValid: true,
    missingSections: [],
    summary: {
      templateValid: true,
      missing: [],
      newTaskCount: 5,
      migratedTaskCount: 2,
      quickRecordCount: 8,
      projectCount: 3,
    },
    tasks: tasks39.slice(0, 2),
    records: records5.slice(0, 1),
    projects: [
      {
        name: "主页项目",
        taskCount: 10,
        openTaskCount: 5,
        todayTaskCount: 2,
        overdueTaskCount: 0,
        lastActivityDate: "2026-08-22",
        inactiveDays: 0,
        healthStatus: "healthy" as const,
        healthLabel: "健康",
        healthTone: "success" as const,
        hasTodayProgress: true,
      },
    ],
    notifications: [
      {
        id: "notif-1",
        type: "overdue_task" as const,
        level: "warning" as const,
        title: "任务提醒",
        description: `有待办任务凭据 ${SECRET_USERINFO_URL}`,
      },
    ],
    reviews: [
      {
        period: "day" as const,
        title: "今日复盘",
        status: "pending" as const,
        statusLabel: "待复盘",
        dateOrRange: "2026-08-22",
        targetDate: "2026-08-22",
      },
    ],
    carryoverPlans: overviewCarryoverPlans,
    limits: overviewLimits,
    counts: overviewCounts,
    note: `工作区日记总览已生成，包含凭据 ${SECRET_USERINFO_URL}，完整上下文信息与聚合统计。`.repeat(60),
  };
  const ovArgs = getDailyWorkspaceOverviewInputSchema.parse({ date: "2026-08-22" });
  const overviewData = getDailyWorkspaceOverviewOutputSchema.parse(overviewDataRaw);
  const ovMessages = diaryMessages("ov-1", "overview", overviewData, ovArgs);
  const ovStorage = compactAgentSessionMessagesForStorage(ovMessages, homepageReadCompactionOptions);
  const ovRuntime = compactAgentMessages(ovMessages, homepageReadCompactionOptions);

  for (const [label, compacted] of [["storage", ovStorage], ["runtime", ovRuntime]] as const) {
    const payload = compactedToolPayload(compacted, "ov-1", 12_000);
    assert.equal(payload.date, "2026-08-22", `${label} date 必须保留`);
    assert.equal(payload.todayDiaryExists, true, `${label} todayDiaryExists 必须保留`);
    assert.equal((payload.summary as any).newTaskCount, 5, `${label} summary 必须保留`);

    // 权威 limits 契约字段验证
    assert.deepEqual(payload.limits, overviewLimits, `${label} 必须完整保留权威 limits 契约字段`);

    // 权威 counts 契约字段验证
    assert.deepEqual(payload.counts, overviewCounts, `${label} 必须完整保留权威 counts 契约字段`);

    // 集合与 carryoverPlans 验证
    assert.equal((payload.tasks as unknown[]).length, 2, `${label} tasks 必须保留`);
    assert.equal((payload.records as unknown[]).length, 1, `${label} records 必须保留`);
    assert.equal((payload.projects as unknown[]).length, 1, `${label} projects 必须保留`);
    assert.equal((payload.notifications as unknown[]).length, 1, `${label} notifications 必须保留`);
    assert.equal((payload.reviews as unknown[]).length, 1, `${label} reviews 必须保留`);
    assert.equal(Array.isArray(payload.carryoverPlans), true, `${label} carryoverPlans 必须保留为数组`);
    assert.equal((payload.carryoverPlans as unknown[]).length, 1, `${label} carryoverPlans 必须保留 1 项`);
    assert.equal(payload.retainedCarryoverCount, 1, `${label} retainedCarryoverCount 必须为 1`);

    const carryoverItem = (payload.carryoverPlans as any[])[0];
    assert.equal(carryoverItem.period, "week");
    assert.equal(carryoverItem.periodLabel, "本周计划");
    assert.equal(carryoverItem.sourceLabel, "2026-W34");
    assert.equal(carryoverItem.sourceDateOrRange, "2026-08-18~2026-08-24");
    assert.equal(carryoverItem.fieldLabel, "下周待办");
    assert.equal(carryoverItem.docId, "carryover-doc-1");

    // 敏感凭据/路径脱敏检查
    const serialized = JSON.stringify(payload);
    for (const secret of ALL_DIARY_SECRETS) {
      assert.equal(serialized.includes(secret), false, `${label} overview 不得泄漏：${secret}`);
    }
  }

  // 6. overview 最大合法多集合 + 多字节长文本极限 Probe
  const maxTasks = Array.from({ length: 50 }, (_, i) => ({
    taskId: `probe-task-${i + 1}`,
    blockId: `probe-block-${i + 1}`,
    markdown: `* [ ] 最大合法任务项 ${i + 1} 详细说明与阶段性目标 `.repeat(3),
    taskname: `最大合法任务 ${i + 1} 包含了详细长文本多字节字符以验证压缩上限 `.repeat(2),
    completed: false,
    priority: "1",
    startDate: "2026-08-20",
    deadline: "2026-08-22",
    recurrence: "",
    reminder: "",
    location: i === 0 ? SECRET_DIARY_WIN_PATH : "",
    tags: ["probe", "multibyte"],
    sourceKind: "normal" as const,
    sourceDate: "2026-08-20",
    sourceDocId: `doc-probe-${i + 1}`,
    sourceDocTitle: `2026-08-20 日记 ${i === 0 ? SECRET_DIARY_UNIX_PATH : ""}`,
    isTodayTask: true,
    isOverdue: false,
    shouldMigrate: false,
  }));
  const maxRecords = Array.from({ length: 50 }, (_, i) => ({
    recordId: `probe-record-${i + 1}`,
    date: "2026-08-22",
    docId: `doc-probe-rec-${i + 1}`,
    docTitle: "2026-08-22 工作日记",
    categoryTitle: "核心开发",
    headingTitle: `### 阶段 ${i + 1} 详细记录与执行情况总结 ${i === 0 ? SECRET_USERINFO_URL : ""}`,
    timeText: "14:00",
    content: `完成模块 ${i + 1} 重构开发，凭据 ${SECRET_API_KEY}，长多字节文本用于极限探针压力验证。`.repeat(4),
    headingBlockId: `probe-heading-${i + 1}`,
  }));
  const maxProjects = Array.from({ length: 20 }, (_, i) => ({
    name: `核心业务项目与多语言视图架构设计 ${i + 1}`,
    taskCount: 20,
    openTaskCount: 10,
    todayTaskCount: 5,
    overdueTaskCount: 0,
    lastActivityDate: "2026-08-22",
    inactiveDays: 0,
    healthStatus: "healthy" as const,
    healthLabel: "健康稳定",
    healthTone: "success" as const,
    hasTodayProgress: true,
  }));
  const maxNotifications = Array.from({ length: 30 }, (_, i) => ({
    id: `probe-notif-${i + 1}`,
    type: "overdue_task" as const,
    level: "warning" as const,
    title: `多语言工作区长文本任务提醒通知 ${i + 1}`,
    description: `存在待办任务凭据 ${SECRET_USERINFO_URL} 需要在工作区内尽快跟进并完成复盘总结。`.repeat(3),
  }));
  const maxReviews = Array.from({ length: 10 }, (_, i) => ({
    period: "day" as const,
    title: `周期复盘与目标对齐总结计划 ${i + 1}`,
    status: "pending" as const,
    statusLabel: "待复盘",
    dateOrRange: "2026-08-22",
    targetDate: "2026-08-22",
  }));
  const maxCarryoverPlans = Array.from({ length: 10 }, (_, i) => ({
    period: "week" as const,
    periodLabel: "本周计划",
    sourceLabel: `2026-W${30 + i}`,
    sourceDateOrRange: "2026-08-18~2026-08-24",
    fieldLabel: "跨周期结转事项",
    content: `结转计划事项 ${i + 1} 包含凭据 ${SECRET_API_KEY} 与详细推进步骤。`.repeat(4),
    lines: Array.from({ length: 8 }, (_, l) => `详细结转条目 ${l + 1}：推进代码重构与全量测试验证覆盖。`),
    docId: `carryover-probe-doc-${i + 1}`,
  }));

  const maxOverviewLimits = {
    tasks: 50,
    records: 50,
    projects: 20,
    notifications: 30,
    reviews: 10,
    carryoverPlans: 10,
  };
  const maxOverviewCounts = {
    tasksTotal: 120,
    tasksReturned: 50,
    tasksTruncated: true,
    recordsTotal: 80,
    recordsReturned: 50,
    recordsTruncated: true,
    projectsTotal: 25,
    projectsReturned: 20,
    projectsTruncated: true,
    notificationsTotal: 45,
    notificationsReturned: 30,
    notificationsTruncated: true,
    reviewsTotal: 10,
    reviewsReturned: 10,
    reviewsTruncated: false,
    carryoverPlansTotal: 15,
    carryoverPlansReturned: 10,
    carryoverPlansTruncated: true,
  };
  const maxOverviewDataRaw = {
    date: "2026-08-22",
    todayDiaryExists: true,
    todayDiary: { docId: "probe-today-doc-id", title: "2026-08-22", date: "2026-08-22" },
    templateValid: true,
    missingSections: [],
    summary: {
      templateValid: true,
      missing: [],
      newTaskCount: 50,
      migratedTaskCount: 20,
      quickRecordCount: 50,
      projectCount: 20,
    },
    tasks: maxTasks,
    records: maxRecords,
    projects: maxProjects,
    notifications: maxNotifications,
    reviews: maxReviews,
    carryoverPlans: maxCarryoverPlans,
    limits: maxOverviewLimits,
    counts: maxOverviewCounts,
    note: `最大合法多集合多字节工作区日记总览探针，包含凭据 ${SECRET_USERINFO_URL}。`.repeat(50),
  };

  const maxOvArgs = getDailyWorkspaceOverviewInputSchema.parse({ date: "2026-08-22" });
  const maxOverviewData = getDailyWorkspaceOverviewOutputSchema.parse(maxOverviewDataRaw);
  const maxOvMessages = diaryMessages("ov-max-probe", "overview", maxOverviewData, maxOvArgs);
  const maxOvStorage = compactAgentSessionMessagesForStorage(maxOvMessages, homepageReadCompactionOptions);
  const maxOvRuntime = compactAgentMessages(maxOvMessages, homepageReadCompactionOptions);

  for (const [label, compacted] of [["storage", maxOvStorage], ["runtime", maxOvRuntime]] as const) {
    const rawToolMessage = compacted.find((m) => m.role === "tool" && m.toolCallId === "ov-max-probe");
    assert.ok(rawToolMessage, `${label} 必须包含 ov-max-probe 工具返回消息`);

    // 核心断言 1：输出直接可 JSON.parse，严禁出现 [compact: token budget] 切割
    assert.equal(rawToolMessage.content.includes("[compact: token budget]"), false, `${label} 严禁出现 [compact: token budget] 文本硬截断`);
    const payload = compactedToolPayload(compacted, "ov-max-probe", 12_000);

    // 核心断言 2：权威 limits & counts 完整保留
    assert.deepEqual(payload.limits, maxOverviewLimits, `${label} 必须完整保留权威 limits 契约字段`);
    assert.deepEqual(payload.counts, maxOverviewCounts, `${label} 必须完整保留权威 counts 契约字段`);

    // 核心断言 3：六大集合各保留代表性条目（>= 1）
    assert.ok((payload.tasks as unknown[]).length >= 1, `${label} tasks 必须保留至少 1 项代表性条目`);
    assert.ok((payload.records as unknown[]).length >= 1, `${label} records 必须保留至少 1 项代表性条目`);
    assert.ok((payload.projects as unknown[]).length >= 1, `${label} projects 必须保留至少 1 项代表性条目`);
    assert.ok((payload.notifications as unknown[]).length >= 1, `${label} notifications 必须保留至少 1 项代表性条目`);
    assert.ok((payload.reviews as unknown[]).length >= 1, `${label} reviews 必须保留至少 1 项代表性条目`);
    assert.ok((payload.carryoverPlans as unknown[]).length >= 1, `${label} carryoverPlans 必须保留至少 1 项代表性条目`);

    // 核心断言 4：各集合保留数与省略数之和严格等于服务端返回数
    assert.equal((payload.retainedTaskCount as number) + (payload.omittedTaskCount as number), 50, `${label} tasks 保留+省略必须为 50`);
    assert.equal((payload.retainedRecordCount as number) + (payload.omittedRecordCount as number), 50, `${label} records 保留+省略必须为 50`);
    assert.equal((payload.retainedProjectCount as number) + (payload.omittedProjectCount as number), 20, `${label} projects 保留+省略必须为 20`);
    assert.equal((payload.retainedNotificationCount as number) + (payload.omittedNotificationCount as number), 30, `${label} notifications 保留+省略必须为 30`);
    assert.equal((payload.retainedReviewCount as number) + (payload.omittedReviewCount as number), 10, `${label} reviews 保留+省略必须为 10`);
    assert.equal((payload.retainedCarryoverCount as number) + (payload.omittedCarryoverCount as number), 10, `${label} carryoverPlans 保留+省略必须为 10`);

    // 核心断言 5：敏感凭据脱敏
    const serialized = JSON.stringify(payload);
    for (const secret of ALL_DIARY_SECRETS) {
      assert.equal(serialized.includes(secret), false, `${label} max overview probe 不得泄漏：${secret}`);
    }
  }

  // 7. 未知 Action：由于 safetyResolver 和 isDiaryReadOnlyTool 严格限制 4 个只读 action，未知 subaction 默认走安全写路径保留，不伪造任务数组
  const unknownDiaryMessages = diaryMessages(
    "unknown-act",
    "unrecognized_subaction",
    { some: "data", details: "未知子操作返回的较长原始负载信息用于验证运行时压缩触发路径。".repeat(200) },
  );
  for (const [label, compacted] of [
    ["storage", compactAgentSessionMessagesForStorage(unknownDiaryMessages, homepageReadCompactionOptions)],
    ["runtime", compactAgentMessages(unknownDiaryMessages, { ...homepageReadCompactionOptions, resolveCallReadOnly: safetyResolver })],
  ] as const) {
    const payload = compactedToolPayload(compacted, "unknown-act");
    assert.equal(payload.status, "success", `${label} 未识别 Action 默认走安全写路径保留`);
    assert.equal(payload.action, "unrecognized_subaction", `${label} 必须记录原始 Action 名称`);
    assert.equal("tasks" in payload, false, `${label} 未识别 Action 不得伪造 tasks 数组`);
  }
}

console.log("verify-agent-context-compaction-v4: extended assertions passed");
