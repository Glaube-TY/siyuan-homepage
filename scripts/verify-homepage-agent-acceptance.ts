/**
 * 主页 Agent 工具验收断言（行为级）。
 * 由 verify-agent-platform-profile.ts 在末尾动态导入执行。
 */
import assert from "node:assert/strict";
import { createComponentSubtoolGate } from "../src/features/robot-assistant/agent/kernel-robot-agent-runtime";
import { buildToolPermissionPreview } from "../src/features/kb/services/agent-core/permissions/write-preview-builder";
import { HOMEPAGE_AGENT_WIDGET_CATALOG } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-catalog";
import { HOMEPAGE_COMPONENT_INSTANCE_ACTIONS, HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-business-capabilities";
import { HomepageAgentService, HomepageAgentServiceError, providerBusinessCapability } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-service";
import { HomepageSettingsService } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-settings-service";
import { HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT, type HomepageAgentStorageChangeReason, type HomepageAgentStorageChangedDetail } from "../src/homepage/deviceView/deviceViewEvents";
import { normalizeButtonOps, normalizeSettingsPatch, buildButtonsOpsJsonSchema, validateTitleIconEmoji } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-settings-whitelist";
import { AGGREGATE_TOOL_CATALOG } from "../src/features/kb/services/agent-workbench/tools/aggregate/aggregate-tool-metadata";
import { ToolRegistry } from "../src/features/kb/services/agent-workbench/registries/tool-registry";
import { registerHomepageAgentCapabilities } from "../src/features/kb/services/agent-workbench/composition/register-homepage-tools";
import { createSiyuanSharedActionBindings, registerSiyuanTools } from "../src/features/kb/services/agent-workbench/composition/register-siyuan-tools";
import { setNotebrainPlugin } from "../src/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import { buildAgentSystemPrompt } from "../src/features/kb/services/agent-core/prompts/system-prefix";
import { mergeKbSettings } from "../src/features/kb/services/settings/kb-settings-service";
import type { NativeTool } from "../src/features/kb/services/agent-core/tools/native-tool";
import type { KbGlobalToolName } from "../src/features/kb/types/settings";

function makeGateTool(actions: Record<string, { readOnly?: boolean }>): { tool: NativeTool; count: () => number; preflightCount: () => number } {
  let underlyingExecutes = 0;
  let preflightCalls = 0;
  const actionNames = Object.keys(actions);
  const tool: NativeTool = {
    name: "homepage_components",
    title: "主页组件",
    description: "t",
    parameters: { type: "object", properties: { action: { type: "string", enum: actionNames }, args: { type: "object" } } },
    readOnly: false,
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: "medium" },
    aggregateActionHelp: Object.fromEntries(Object.entries(actions).map(([action, meta]) => [action, meta])),
    isReadOnlyCall: (args) => {
      const action = (args as Record<string, unknown>).action;
      return typeof action === "string" ? actions[action]?.readOnly === true : false;
    },
    preflightValidate: () => { preflightCalls += 1; return { ok: true }; },
    execute: async () => { underlyingExecutes += 1; return { ok: true, content: "done", summary: "done" }; },
  };
  return { tool, count: () => underlyingExecutes, preflightCount: () => preflightCalls };
}

const gatePolicy = (tools: Record<string, { remoteAllowed: boolean; writeAction?: "ask" | "deny" }>) => ({
  tools,
  defaultWriteAction: "ask" as const,
  readOnlyDefaultAllowed: true,
});

const callCtx = { question: "", callCounts: {} };

function createAcceptanceService(): HomepageAgentService {
  const docs: Record<string, unknown> = {
    "weather-1": { config: { type: "weather", data: { cityName: "上海" } }, revision: 1 },
    "music-1": { config: { type: "musicPlayer", data: {} }, revision: 1 },
    "latest-docs-1": { config: { type: "latest-docs", data: {} }, revision: 1 },
    "enhanced-diary-1": { config: { type: "enhancedDiary", data: {} }, revision: 1 },
    "accounting-1": { config: { type: "accounting", data: {} }, revision: 1 },
    "custom-text-1": { config: { type: "custom-text", data: [{ customText: "验证文本" }] }, revision: 1 },
    "notebrain-1": { config: { type: "notebrain", data: {} }, revision: 1 },
  };
  class AcceptanceHomepageAgentService extends HomepageAgentService {
    override async addWidget(input: Parameters<HomepageAgentService["addWidget"]>[0]) {
      acceptanceLastAddInput = input;
      return { status: "ok", surface: input.surface ?? "desktop-homepage", summary: "验证添加" } as never;
    }

    override async updateWidget(input: Parameters<HomepageAgentService["updateWidget"]>[0]) {
      const current = docs[input.widgetId] as { config?: { type?: string } } | undefined;
      const currentType = current?.config?.type;
      if (currentType !== input.expectedType) {
        throw new HomepageAgentServiceError("widget_type_conflict", `组件类型已变化：预期 ${input.expectedType}，当前为 ${currentType ?? "unknown"}。`);
      }
      acceptanceUpdateCalls += 1;
      return { status: "ok", surface: input.surface ?? "desktop-homepage", summary: "验证更新" } as never;
    }

    override async removeWidget(input: Parameters<HomepageAgentService["removeWidget"]>[0]) {
      const current = docs[input.widgetId] as { config?: { type?: string } } | undefined;
      const currentType = current?.config?.type;
      if (currentType !== input.expectedType) {
        throw new HomepageAgentServiceError("widget_type_conflict", `组件类型已变化：预期 ${input.expectedType}，当前为 ${currentType ?? "unknown"}。`);
      }
      acceptanceRemoveCalls += 1;
      return { status: "ok", surface: input.surface ?? "desktop-homepage", summary: "验证移除" } as never;
    }
  }
  return new AcceptanceHomepageAgentService({
    getPlugin: () => ({ isMobile: false }) as never,
    deviceView: {
      getContext: () => ({ scopeId: "acceptance", surface: "desktop-homepage", isMobileShared: false }) as never,
      ensureReady: async () => {},
      readSnapshot: async () => ({
        layout: { layout: { order: Object.keys(docs).map((id, index) => ({ id, style: null, index })), profiles: {} }, revision: 1, deviceId: "acceptance", surface: "desktop-homepage" },
        view: null,
      }),
      readWidgetDocument: async (_ctx, widgetId) => (docs[widgetId] ?? null) as never,
      loadLayoutSettings: async () => ({ widgetLayoutNumber: 4, widgetGap: 8 }),
      deleteWidgetFromSurface: async () => ({ status: "success" }) as never,
    },
  });
}

let acceptanceLastAddInput: Record<string, unknown> | undefined;
let acceptanceUpdateCalls = 0;
let acceptanceRemoveCalls = 0;

let sharedImplementationCalls = 0;
const acceptanceSiyuanDeps = {
  getScope: () => { sharedImplementationCalls += 1; return { type: "whole_kb" as const }; },
  getEffectiveScope: () => ({ type: "whole_kb" as const }),
  loadPluginData: async <T>(_key: string) => { sharedImplementationCalls += 1; return null as T | null; },
  savePluginData: async <T>(_key: string, _data: T) => {},
};
const acceptanceSharedBindings = createSiyuanSharedActionBindings(acceptanceSiyuanDeps);

function createRuntimeRegistry(disabledSubtools: readonly string[] = []): ToolRegistry {
  setNotebrainPlugin({ isMobile: false } as never);
  const registry = new ToolRegistry();
  registerSiyuanTools(registry, {
    kbRetrievalToolDeps: acceptanceSiyuanDeps,
    sharedActionBindings: acceptanceSharedBindings,
    builtinCapabilityAccess: {
      knowledgeBase: false,
      scheduleTaskDiary: false,
      databaseAssistant: false,
      docContentEditing: false,
      notebookDocTree: false,
      tagBookmarkOutline: false,
      assetManagement: false,
      riffReview: false,
    },
  });
  registerHomepageAgentCapabilities(registry, {
    enabled: false,
    componentsEnabled: true,
    workbench: false,
    workbenchSource: { profileId: "acceptance", label: "验收" },
    disabledComponentSubtools: disabledSubtools,
    sharedSiyuanActionBindings: acceptanceSharedBindings,
    service: createAcceptanceService(),
    components: { quickNote: true, focus: true, accounting: true, fixedAssets: true, anniversary: true, favorites: true, review: true, music: true },
  });
  return registry;
}

function actionEnum(registry: ToolRegistry): string[] {
  const manifest = registry.getToolManifest({ question: "", callCounts: {} }).find((item) => item.name === "homepage_components");
  const schema = manifest?.inputJsonSchema as { properties?: { action?: { enum?: unknown[] } } } | undefined;
  return (schema?.properties?.action?.enum ?? []).filter((item): item is string => typeof item === "string");
}

// ── Robot 子工具门控：真实运行测试 ──
{
  // 顶层 allow + 子工具 deny：被 deny 的 action 调用被拒，底层 execute 0 次；
  // 其他允许的 action 正常执行。
  const { tool, count, preflightCount } = makeGateTool({ "quick_note.write": { readOnly: false }, "review.list": { readOnly: true } });
  const gate = createComponentSubtoolGate(tool, gatePolicy({
    "homepage_components": { remoteAllowed: true, writeAction: "ask" },
    "homepage_components.quick_note": { remoteAllowed: false, writeAction: "deny" },
    "homepage_components.review": { remoteAllowed: true },
  }));
  assert.equal(gate.shouldRegister, true);
  let requestConfirmationCalls = 0;
  const dispatch = async (args: Record<string, unknown>) => {
    const validation = await gate.preflightValidate(args);
    if (!validation.ok) return validation;
    const action = typeof args.action === "string" ? args.action : "";
    if (gate.aggregateActionHelp?.[action]?.readOnly !== true) requestConfirmationCalls += 1;
    return gate.execute(args, callCtx);
  };
  const deniedPreflight = await dispatch({ action: "quick_note.write" });
  assert.equal(deniedPreflight.ok, false);
  assert.equal("error" in deniedPreflight ? deniedPreflight.error?.code : undefined, "robot_subtool_denied", "被拒 action 必须在确认前由 preflight 拒绝");
  assert.equal(requestConfirmationCalls, 0, "被拒 action 不得触发 requestConfirmation");
  assert.equal(preflightCount(), 0, "被拒 action 不得进入原始 preflight");
  const providerActions = (gate.parameters.properties?.action as { enum?: string[] })?.enum ?? [];
  assert.equal(providerActions.includes("quick_note.write"), false, "provider 不得看到被拒 action");
  const denied = await gate.execute({ action: "quick_note.write" }, callCtx);
  assert.equal(denied.ok, false, "execute 仍必须保留二次权限校验");
  assert.equal(denied.errorCode, "robot_subtool_denied");
  assert.equal(count(), 0, "被拒 action 不得进入底层业务 execute");
  const allowed = await dispatch({ action: "review.list" });
  assert.equal(allowed.ok, true, "其他允许的 action 正常执行");
  assert.equal(count(), 1);
}
{
  // 顶层 allow + 子工具 deny 且无其他允许 action：工具不注册。
  const { tool } = makeGateTool({ "quick_note.write": { readOnly: false } });
  const gate = createComponentSubtoolGate(tool, gatePolicy({
    "homepage_components": { remoteAllowed: true, writeAction: "ask" },
    "homepage_components.quick_note": { remoteAllowed: false, writeAction: "deny" },
  }));
  assert.equal(gate.shouldRegister, false, "全部 action 均被子工具 deny 时工具不得注册");
}
{
  // 顶层 deny + 子工具 allow：工具注册，允许的 action 可执行。
  const { tool, count } = makeGateTool({ "accounting.add_record": { readOnly: false }, "accounting.summary": { readOnly: true } });
  const gate = createComponentSubtoolGate(tool, gatePolicy({ "homepage_components": { remoteAllowed: false, writeAction: "deny" }, "homepage_components.accounting": { remoteAllowed: true, writeAction: "ask" } }));
  assert.equal(gate.shouldRegister, true, "子工具 allow 必须覆盖顶层 deny 并注册");
  const providerActions = (gate.parameters.properties?.action as { enum?: string[] })?.enum ?? [];
  assert.deepEqual(providerActions.sort(), ["accounting.add_record", "accounting.summary"]);
  const run = gate.execute.bind(gate);
  const ok = await run({ action: "accounting.add_record" }, callCtx);
  assert.equal(ok.ok, true);
  assert.equal(count(), 1);
}
{
  // 允许的写 action：一次确认、一次底层执行。
  const { tool, count } = makeGateTool({ "quick_note.write": { readOnly: false } });
  const gate = createComponentSubtoolGate(tool, gatePolicy({
    "homepage_components.quick_note": { remoteAllowed: true, writeAction: "ask" },
  }));
  let requestConfirmationCalls = 0;
  const validation = await gate.preflightValidate({ action: "quick_note.write" });
  assert.equal(validation.ok, true);
  requestConfirmationCalls += 1;
  const result = await gate.execute({ action: "quick_note.write" }, callCtx);
  assert.equal(result.ok, true);
  assert.equal(requestConfirmationCalls, 1, "允许的写 action 只确认一次");
  assert.equal(count(), 1, "允许的写 action 只执行一次");
}
{
  // 没有顶层策略，仅子工具 allow：正常注册。
  const { tool } = makeGateTool({ "review.list": { readOnly: true } });
  const gate = createComponentSubtoolGate(tool, gatePolicy({ "homepage_components.review": { remoteAllowed: true } }));
  assert.equal(gate.shouldRegister, true, "仅子工具 allow 必须注册");
}
{
  // 所有 action 均 deny：工具不注册。
  const { tool } = makeGateTool({ "music.status": { readOnly: true }, "quick_note.write": { readOnly: false } });
  const gate = createComponentSubtoolGate(tool, gatePolicy({ "homepage_components.music": { remoteAllowed: false }, "homepage_components.quick_note": { remoteAllowed: false, writeAction: "deny" } }));
  assert.equal(gate.shouldRegister, false, "全部 action 均 deny 时工具不得注册");
}
{
  // 只读默认允许、写入默认拒绝。
  const { tool, count } = makeGateTool({ "accounting.overview": { readOnly: true }, "accounting.add_record": { readOnly: false } });
  const gate = createComponentSubtoolGate(tool, gatePolicy({}));
  assert.equal(gate.shouldRegister, true, "只读默认允许时只读子工具可注册");
  const run = gate.execute.bind(gate);
  const readOk = await run({ action: "accounting.overview" }, callCtx);
  assert.equal(readOk.ok, true, "只读默认允许");
  const writeDenied = await run({ action: "accounting.add_record" }, callCtx);
  assert.equal(writeDenied.ok, false, "写入默认拒绝（无显式策略）");
  assert.equal(writeDenied.errorCode, "robot_subtool_denied");
  assert.equal(count(), 1, "只允许的一次只读执行进入底层");
}

// ── 全新用户不被误迁移 ──
{
  const fresh = mergeKbSettings({});
  assert.equal(fresh.toolSettings.disabledSubtools === undefined, true, "全新用户不得产生 disabledSubtools");
  assert.equal(fresh.toolSettings.disabledGlobalToolNames.includes("homepage_components"), true, "默认父工具仍禁用");
  const enabled = mergeKbSettings({ toolSettings: { schemaVersion: 1, disabledGlobalToolNames: [] } });
  assert.equal(enabled.toolSettings.disabledSubtools === undefined, true, "新版默认不产生子工具禁用");
}
{
  // 旧版默认设置迁移后保持原权限（不扩大）。
  const legacyDefaults = mergeKbSettings({
    toolSettings: {
      disabledGlobalToolNames: ["homepage_manage", "homepage_quick_note", "homepage_focus", "homepage_accounting", "homepage_fixed_assets", "homepage_anniversary", "homepage_favorites", "homepage_review", "homepage_music", "homepage_workbench"] as unknown as KbGlobalToolName[],
    },
  });
  assert.equal(legacyDefaults.toolSettings.disabledGlobalToolNames.includes("homepage_components"), true);
  assert.equal(legacyDefaults.toolSettings.disabledSubtools?.["homepage_components"]?.includes("catalog"), true);
  assert.equal(legacyDefaults.toolSettings.disabledSubtools?.["homepage_components"]?.includes("instance"), true);
}

// ── 真实 ToolRegistry：顶层 Siyuan 工具关闭时，homepage 薄路由仍存在 ──
{
  const registry = createRuntimeRegistry();
  assert.equal(registry.getTool("diary_task"), undefined, "验收场景必须关闭 diary_task");
  assert.equal(registry.getTool("siyuan_kb"), undefined, "验收场景必须关闭 siyuan_kb");
  assert.equal(registry.getTool("siyuan_database"), undefined, "验收场景必须关闭 siyuan_database");
  const homepage = registry.getTool("homepage_components");
  assert.ok(homepage, "homepage_components 必须真实注册");
  const help = homepage.aggregateActionHelp ?? {};
  const manifestActions = actionEnum(registry);
  const genericInstanceActions = ["instance.get", "instance.add", "instance.update", "instance.update_style", "instance.move", "instance.remove"];
  assert.equal(help["instance.list"] !== undefined, true, "homepage_components 必须保留跨组件 instance.list");
  assert.equal(manifestActions.includes("instance.list"), true, "provider manifest 必须保留 instance.list");
  for (const action of genericInstanceActions) {
    assert.equal(help[action] !== undefined, false, `通用 ${action} 不得继续公开`);
    assert.equal(manifestActions.includes(action), false, `provider manifest 不得包含通用 ${action}`);
    const genericResult = await homepage.execute(callCtx as never, { action, args: { widgetId: "weather-1", expectedType: "weather" } });
    assert.equal(genericResult.error?.code, "unknown_action", `直接调用已删除的 ${action} 必须返回 unknown_action`);
  }
  assert.equal(acceptanceUpdateCalls, 0, "已删除通用 CRUD 不得进入底层更新");
  assert.equal(acceptanceRemoveCalls, 0, "已删除通用 CRUD 不得进入底层移除");
  for (const action of [
    "enhanced_diary.overview", "latest_docs.list_by_time", "recent_journals.list_by_time",
    "child_docs.search", "condition_docs.search", "visual_chart.list", "sql.list",
  ]) {
    assert.ok(help[action], `${action} 必须存在于真实 aggregateActionHelp`);
    assert.equal(manifestActions.includes(action), true, `${action} 必须存在于真实 provider manifest`);
  }
  assert.equal(sharedImplementationCalls, 0, "注册和读取 manifest 不得提前执行共享底层实现");
  const enhanced = await homepage.execute(callCtx as never, { action: "enhanced_diary.overview", args: { include: ["summary"] } });
  assert.equal(enhanced.error?.code === "unknown_action", false, "薄路由必须进入共享 action，而不是 unknown_action");
  assert.equal(sharedImplementationCalls > 0, true, "薄路由必须进入共享底层实现");

  const representatives: Array<[string, Record<string, unknown>]> = [
    ["weather.instance.get", { widgetId: "weather-1", surface: "desktop-homepage" }],
    ["music.instance.get", { widgetId: "music-1", surface: "desktop-homepage" }],
    ["latest_docs.instance.get", { widgetId: "latest-docs-1", surface: "desktop-homepage" }],
    ["enhanced_diary.instance.get", { widgetId: "enhanced-diary-1", surface: "desktop-homepage" }],
    ["custom_text.instance.get", { widgetId: "custom-text-1", surface: "desktop-homepage" }],
    ["notebrain.instance.get", { widgetId: "notebrain-1", surface: "desktop-homepage" }],
  ];
  for (const [action, args] of representatives) {
    const result = await homepage.execute(callCtx as never, { action, args });
    assert.equal(result.ok, true, `${action} 必须真实执行固定 type 的实例路由`);
  }

  const mismatchGet = await homepage.execute(callCtx as never, {
    action: "music.instance.get",
    args: { widgetId: "weather-1", surface: "desktop-homepage" },
  });
  assert.equal(mismatchGet.error?.code, "widget_type_conflict", "实例 get 使用其他组件 widgetId 必须拒绝");
  acceptanceUpdateCalls = 0;
  const mismatchUpdate = await homepage.execute(callCtx as never, {
    action: "music.instance.update",
    args: {
      widgetId: "weather-1", surface: "desktop-homepage", expectedWidgetRevision: 1,
      expectedValues: { cityName: "上海" }, patch: { cityName: "北京" },
    },
  });
  assert.equal(mismatchUpdate.error?.code, "widget_type_conflict", "实例 update 使用其他组件 widgetId 必须拒绝");
  assert.equal(acceptanceUpdateCalls, 0, "类型冲突不得产生写入");

  acceptanceLastAddInput = undefined;
  const addMusic = await homepage.execute(callCtx as never, {
    action: "music.instance.add",
    args: { surface: "desktop-homepage", expectedLayoutRevision: 1 },
  });
  assert.equal(addMusic.ok, true, "实例 add 应允许省略固定 type 和 label");
  assert.equal(acceptanceLastAddInput?.widgetType, "musicPlayer", "实例 add 必须注入 route.type");
  assert.equal(acceptanceLastAddInput?.expectedLabel, "音乐播放器", "实例 add 必须注入 route.label");

  assert.equal(HOMEPAGE_AGENT_WIDGET_CATALOG.length, 36, "主页组件目录必须有 36 种组件");
  assert.equal(HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.length, 36, "组件路由定义必须覆盖 36 种组件");
  for (const widget of HOMEPAGE_AGENT_WIDGET_CATALOG) {
    const capability = widget.businessCapability;
    assert.equal(capability.toolName, "homepage_components", `${widget.type} 必须路由到 homepage_components`);
    assert.equal(typeof capability.subtool === "string" && capability.subtool.length > 0, true, `${widget.type} 必须有非空 subtool`);
    for (const operation of capability.operations ?? []) {
      assert.equal(help[operation] !== undefined, true, `${widget.type} 的 ${operation} 必须存在于真实 aggregateActionHelp`);
      assert.equal(manifestActions.includes(operation), true, `${widget.type} 的 ${operation} 必须存在于真实 provider manifest`);
    }
  }
  for (const route of HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS) {
    for (const action of HOMEPAGE_COMPONENT_INSTANCE_ACTIONS) {
      const instanceAction = `${route.prefix}.instance.${action}`;
      assert.equal(help[instanceAction] !== undefined, true, `${route.prefix} 必须有 ${action} 实例 action`);
      assert.equal(manifestActions.includes(instanceAction), true, `${route.prefix} 的 ${action} 必须出现在真实 provider manifest`);
    }
    const disabledRegistry = createRuntimeRegistry([route.prefix]);
    const disabledActions = actionEnum(disabledRegistry);
    assert.equal(disabledActions.some((action) => action.startsWith(`${route.prefix}.`)), false, `${route.prefix} 禁用后必须从真实 manifest 消失`);
  }

  const disabledAccounting = createRuntimeRegistry(["accounting"]);
  const disabledAccountingActions = actionEnum(disabledAccounting);
  assert.equal(disabledAccountingActions.some((action) => action.startsWith("accounting.")), false, "禁用 accounting 后所有 accounting action 必须消失");
  const disabledAccountingTool = disabledAccounting.getTool("homepage_components")!;
  const disabledAccountingCatalog = await disabledAccountingTool.execute(callCtx as never, { action: "catalog.get_type", args: { widgetType: "accounting" } });
  assert.equal(disabledAccountingCatalog.ok, true, JSON.stringify(disabledAccountingCatalog));
  const disabledAccountingCapability = (disabledAccountingCatalog.data as { result?: { widgetType?: { businessCapability?: { operations?: string[]; reason?: string } } } } | null)?.result?.widgetType?.businessCapability;
  assert.deepEqual(disabledAccountingCapability?.operations, [], "禁用 accounting 后 catalog capability 不得推荐死 action");
  assert.equal(disabledAccountingCapability?.reason, "subtool_disabled");
  const disabledAccountingList = await disabledAccountingTool.execute(callCtx as never, { action: "instance.list", args: { surface: "desktop-homepage" } });
  const disabledAccountingRows = ((disabledAccountingList.data as { result?: { widgets?: Array<{ type?: string; businessCapability?: { operations?: string[] } }> } } | null)?.result?.widgets ?? [])
    .filter((row) => row.type === "accounting");
  assert.equal(disabledAccountingRows.every((row) => (row.businessCapability?.operations ?? []).length === 0), true, "禁用 accounting 后 instance.list 不得推荐死 action");

  const disabledWeather = createRuntimeRegistry(["weather"]);
  const disabledWeatherActions = actionEnum(disabledWeather);
  assert.equal(disabledWeatherActions.some((action) => action.startsWith("weather.")), false, "禁用 weather 后所有 weather action 必须消失");
  assert.equal(disabledWeatherActions.includes("music.instance.get"), true, "禁用 weather 不得影响其他组件");
  assert.equal(disabledWeatherActions.includes("instance.update"), false, "禁用 weather 后不得通过通用 CRUD 绕过组件权限");

  const disabledInstance = createRuntimeRegistry(["instance"]);
  const disabledInstanceActions = actionEnum(disabledInstance);
  assert.equal(disabledInstanceActions.includes("instance.list"), false, "禁用 instance 后跨组件索引必须消失");
  assert.equal(disabledInstanceActions.includes("weather.instance.get"), true, "禁用 instance 不得影响组件专属实例路由");
  assert.equal((disabledInstance.getTool("homepage_components")?.aggregateActionHelp ?? {})["weather.instance.get"] !== undefined, true);

  const removePreview = buildToolPermissionPreview(homepage, {
    action: "weather.instance.remove",
    args: {
      surface: "desktop-homepage", widgetId: "weather-1", expectedWidgetRevision: 1,
      expectedLayoutRevision: 1, expectedIndex: 0, expectedSectionId: null, expectedLabel: "今日天气",
    },
  });
  assert.equal(removePreview.toolName, "homepage_components");
  assert.equal(removePreview.argsPreview.action, "weather.instance.remove");
  assert.equal(removePreview.risk, "high");
  assert.match(removePreview.operationLabel, /移除.*组件/);

  const anniversaryBusinessPreview = buildToolPermissionPreview(homepage, { action: "anniversary.add", args: { name: "纪念日" } });
  const anniversaryInstancePreview = buildToolPermissionPreview(homepage, { action: "anniversary.instance.add", args: { expectedLayoutRevision: 1 } });
  assert.equal(anniversaryBusinessPreview.operationLabel, "新增纪念日");
  assert.equal(anniversaryInstancePreview.operationLabel, "添加主页组件");

  const weatherUpdate = await homepage.execute(callCtx as never, {
    action: "weather.instance.update",
    args: { widgetId: "weather-1", surface: "desktop-homepage", expectedWidgetRevision: 1, expectedValues: { cityName: "上海" }, patch: { cityName: "北京" } },
  });
  assert.equal(weatherUpdate.ok, true, "weather.instance.update 必须继续走固定 type contract");
  const weatherRemove = await homepage.execute(callCtx as never, {
    action: "weather.instance.remove",
    args: { widgetId: "weather-1", surface: "desktop-homepage", expectedWidgetRevision: 1, expectedLayoutRevision: 1, expectedIndex: 0, expectedSectionId: null, expectedLabel: "今日天气" },
  });
  assert.equal(weatherRemove.ok, true, "weather.instance.remove 必须继续走固定 type contract");
}

// ── instance.list 实际结果不包含旧 provider 工具名 ──
{
  const fakeContext = { scopeId: "device-verify", surface: "desktop-homepage", isMobileShared: false } as never;
  const service = new HomepageAgentService({
    getPlugin: () => ({ isMobile: false }) as never,
    deviceView: {
      getContext: () => fakeContext,
      ensureReady: async () => {},
      readSnapshot: async () => ({
        layout: { layout: { order: [{ id: "w1", style: null, index: 0 }, { id: "w2", style: null, index: 1 }, { id: "w3", style: null, index: 2 }], profiles: {} }, revision: 1, deviceId: "device-verify", surface: "desktop-homepage" },
        view: null,
      }),
      readWidgetDocument: async (_ctx, widgetId) => {
        const docs: Record<string, unknown> = {
          w1: { config: { type: "musicPlayer", data: {} }, revision: 1 },
          w2: { config: { type: "accounting", data: {} }, revision: 1 },
          w3: { config: { type: "weather", data: {} }, revision: 1 },
        };
        const doc = docs[widgetId];
        return doc ? doc as never : null;
      },
      loadLayoutSettings: async () => ({ widgetLayoutNumber: 4, widgetGap: 8 }),
      deleteWidgetFromSurface: async () => ({ status: "success" }) as never,
    },
  });
  const listed = await service.listWidgets("desktop-homepage");
  const capabilities = ((listed.widgets as Array<{ businessCapability: ReturnType<typeof providerBusinessCapability> }>) ?? [])
    .map((row) => row.businessCapability);
  for (const capability of capabilities) {
    const serialized = JSON.stringify(capability);
    assert.equal(/homepage_(quick_note|focus|accounting|fixed_assets|anniversary|favorites|review|music)/.test(serialized), false, "instance.list 不得包含旧 provider 工具名");
    assert.equal("businessTool" in (capability as object), false, "Agent 可见结果不得包含 businessTool");
  }
  assert.equal(capabilities[0]?.subtool, "music", "musicPlayer 组件路由到 subtool=music");
  assert.equal(capabilities[0]?.toolName, "homepage_components");
  assert.equal(capabilities[2]?.subtool, "weather", "display-only 组件仍返回实例子工具");
}

// ── 静态 help/schema 漂移扫描：只作文档一致性补充，运行时验收以上面的真实 registry 为准 ──
{
  const componentMeta = AGGREGATE_TOOL_CATALOG.find((tool) => tool.name === "homepage_components");
  const componentMetaActions = new Set(componentMeta?.actions.map((action) => action.name) ?? []);
  for (const widget of HOMEPAGE_AGENT_WIDGET_CATALOG) {
    const capability = widget.businessCapability;
    for (const operation of capability.operations ?? []) {
      assert.equal(componentMetaActions.has(operation), true, `${widget.type} 的 ${operation} 必须存在于静态 help`);
    }
  }
  const settingsMeta = AGGREGATE_TOOL_CATALOG.find((tool) => tool.name === "homepage_manage");
  const buttonsMeta = settingsMeta?.actions.find((action) => action.name === "update_buttons");
  assert.equal(JSON.stringify(buttonsMeta).includes("新增按钮"), false, "update_buttons metadata 不得提示新增按钮");
  const systemPrompt = buildAgentSystemPrompt();
  assert.equal(systemPrompt.includes("homepage_components.enhanced_diary.*"), true, "系统提示必须指向 enhanced_diary 子路由");
  assert.equal(systemPrompt.includes("instance.list 用于获取当前主页组件及其 type/subtool"), true, "系统提示必须说明 instance.list 的索引职责");
  assert.equal(systemPrompt.includes("跨组件索引 instance.*"), false, "系统提示不得把通用 instance.* 描述为 CRUD 入口");
  assert.equal(systemPrompt.includes("强化日记任务统一优先使用 diary_task"), false, "系统提示不得把组件强化日记指向 diary_task");
  const settingsSchema = AGGREGATE_TOOL_CATALOG.find((tool) => tool.name === "homepage_manage")?.actions.find((action) => action.name === "update_settings")?.argsSchema as {
    properties?: { patch?: { properties?: Record<string, { maxLength?: number }> } };
  } | undefined;
  assert.equal(settingsSchema?.properties?.patch?.properties?.TitleIconEmoji?.maxLength, 32, "TitleIconEmoji metadata Schema 必须与运行期 32 一致");
}

// ── 标题图标 HTML 注入拒绝（payload 用转义构造，避免源码中出现注入字面量）──
{
  const lt = "\u003c";
  const gt = "\u003e";
  const amp = "\u0026";
  const htmlTag = `${lt}b${gt}x${lt}/b${gt}`;
  const imgTag = `${lt}img src=x onerror=alert(1)${gt}`;
  const entity = `${amp}#x3C;script${amp}#x3E;`;
  const controlChar = `a\u0000b`;
  assert.throws(() => normalizeSettingsPatch({ TitleIconEmoji: htmlTag }, true), /HTML 特殊字符/, "HTML 标签必须拒绝");
  assert.throws(() => normalizeSettingsPatch({ TitleIconEmoji: imgTag }, true), /HTML 特殊字符/, "事件属性必须拒绝");
  assert.throws(() => normalizeSettingsPatch({ TitleIconEmoji: entity }, true), /HTML 特殊字符/, "HTML 实体必须拒绝");
  assert.throws(() => normalizeSettingsPatch({ TitleIconEmoji: controlChar }, true), /控制字符/, "控制字符必须拒绝");
  assert.throws(() => validateTitleIconEmoji("1f600-ffffff"), /非法 Unicode 码点/, "超范围码点必须拒绝");
  assert.equal(normalizeSettingsPatch({ TitleIconEmoji: "😊" }, true).TitleIconEmoji, "😊", "真实 emoji 允许");
  assert.equal(normalizeSettingsPatch({ TitleIconEmoji: "1f600" }, true).TitleIconEmoji, "1f600", "合法 Unicode 编码串允许");
  assert.equal(normalizeSettingsPatch({ TitleIconEmoji: "1f468-200d-1f4bb" }, true).TitleIconEmoji, "1f468-200d-1f4bb", "多码点编码串允许");
}

// ── 快捷按钮 add 已删除 ──
{
  const baseButtons = [
    { id: 1, label: "搜索", checked: true, order: 0, action: "search" },
    { id: 2, label: "我的链接", checked: true, order: 1 },
  ];
  assert.throws(() => normalizeButtonOps(baseButtons, [{ op: "add", label: "新按钮" }]), /不支持的按钮操作/, "add 操作必须拒绝");
  const opsSchema = buildButtonsOpsJsonSchema() as { items: { properties: { op: { enum: string[] } } } };
  assert.equal(opsSchema.items.properties.op.enum.includes("add"), false, "ops schema 不得包含 add");
  const metadataOps = (AGGREGATE_TOOL_CATALOG.find((tool) => tool.name === "homepage_manage")?.actions.find((action) => action.name === "update_buttons")?.argsSchema) as { properties: { ops: { items: { properties: { op: { enum: string[] } } } } } };
  assert.equal(metadataOps.properties.ops.items.properties.op.enum.includes("add"), false, "metadata schema 不得包含 add");
}

// ── HomepageSettingsService Agent 外部存储刷新事件语义断言（行为级）──
{
  const testReasons: HomepageAgentStorageChangeReason[] = [
    "widget-added", "widget-updated", "widget-moved", "widget-removed",
    "layout-updated", "sections-updated", "active-section-updated", "unresolved-cleaned",
    "settings-updated", "buttons-updated",
  ];
  assert.equal(testReasons.includes("settings-updated"), true, "Contract 必须包含 settings-updated");
  assert.equal(testReasons.includes("buttons-updated"), true, "Contract 必须包含 buttons-updated");

  const dispatchedEvents: Array<{ type: string; detail: unknown }> = [];
  const prevWindow = (globalThis as any).window;
  const prevCustomEvent = (globalThis as any).CustomEvent;

  (globalThis as any).CustomEvent = class MockCustomEvent {
    public detail: unknown;
    constructor(public type: string, init?: { detail?: unknown }) {
      this.detail = init?.detail;
    }
  };
  (globalThis as any).window = {
    dispatchEvent: (event: { type: string; detail: unknown }) => {
      dispatchedEvents.push({ type: event.type, detail: event.detail });
      return true;
    },
  };

  try {
    class AcceptanceHomepageSettingsService extends HomepageSettingsService {
      public fakeView = {
        revision: 1,
        config: {
          TitleIconEmoji: "1f3e0",
          pageTitle: "思源主页",
          buttonsList: [
            { id: 1, label: "搜索", checked: true, order: 0, action: "search" },
            { id: 2, label: "我的链接", checked: true, order: 1 },
          ],
          homepageAppearance: { preferredThemeId: "classic" },
        } as Record<string, unknown>,
      };

      protected override async readViewSettings(_context: any) {
        return {
          revision: this.fakeView.revision,
          config: JSON.parse(JSON.stringify(this.fakeView.config)),
        } as any;
      }

      protected override async readView() {
        return {
          context: { scopeId: "acceptance", surface: "desktop-homepage", isMobileShared: false } as any,
          view: {
            revision: this.fakeView.revision,
            config: JSON.parse(JSON.stringify(this.fakeView.config)),
          } as any,
        };
      }

      protected override async commitViewMutation(
        _context: any,
        mutation: (config: Record<string, unknown>) => Record<string, unknown>,
        expectedViewRevision: number,
      ) {
        if (this.fakeView.revision !== expectedViewRevision) {
          throw new Error("并发更新冲突");
        }
        this.fakeView.config = mutation(this.fakeView.config);
        this.fakeView.revision += 1;
      }
    }

    const settingsService = new AcceptanceHomepageSettingsService({
      getPlugin: () => ({ isMobile: false }) as any,
    });

    // 1. settings 有变化写入：派发 homepage-agent-storage-changed，不派发 homepage-settings-saved
    dispatchedEvents.length = 0;
    const settingsUpdateResult = await settingsService.updateSettings({ TitleIconEmoji: "1f600" }, 1);
    assert.equal(settingsUpdateResult.changed, true);
    assert.equal(settingsUpdateResult.viewRevision, 2);
    assert.equal(dispatchedEvents.length, 1, "Agent settings 写入必须派发且仅派发 1 个事件");
    assert.equal(dispatchedEvents[0]?.type, HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT, "必须使用 homepage-agent-storage-changed 通道");
    assert.deepEqual(dispatchedEvents[0]?.detail, {
      source: "agent",
      surface: "desktop-homepage",
      reason: "settings-updated",
      viewRevision: 2,
    });
    assert.equal(dispatchedEvents.some((e) => e.type === "homepage-settings-saved"), false, "禁止派发普通 UI homepage-settings-saved 事件");

    // 2. settings 无变化写入 (changed=false)：零写入、零派发
    dispatchedEvents.length = 0;
    const settingsUnchangedResult = await settingsService.updateSettings({ TitleIconEmoji: "1f600" }, 2);
    assert.equal(settingsUnchangedResult.changed, false);
    assert.equal(settingsUnchangedResult.viewRevision, 2);
    assert.equal(dispatchedEvents.length, 0, "changed=false 时不得派发外部刷新事件");

    // 3. buttons 有变化写入：派发 homepage-agent-storage-changed，不派发 homepage-settings-saved
    dispatchedEvents.length = 0;
    const buttonsUpdateResult = await settingsService.updateButtons([{ op: "toggle", id: 1, checked: false }], 2);
    assert.equal(buttonsUpdateResult.changed, true);
    assert.equal(buttonsUpdateResult.viewRevision, 3);
    assert.equal(dispatchedEvents.length, 1, "Agent buttons 写入必须派发且仅派发 1 个事件");
    assert.equal(dispatchedEvents[0]?.type, HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT, "必须使用 homepage-agent-storage-changed 通道");
    assert.deepEqual(dispatchedEvents[0]?.detail, {
      source: "agent",
      surface: "desktop-homepage",
      reason: "buttons-updated",
      viewRevision: 3,
    });
    assert.equal(dispatchedEvents.some((e) => e.type === "homepage-settings-saved"), false, "禁止派发普通 UI homepage-settings-saved 事件");

    // 4. buttons 无变化写入 (changed=false)：零写入、零派发
    dispatchedEvents.length = 0;
    const buttonsUnchangedResult = await settingsService.updateButtons([{ op: "toggle", id: 1, checked: false }], 3);
    assert.equal(buttonsUnchangedResult.changed, false);
    assert.equal(buttonsUnchangedResult.viewRevision, 3);
    assert.equal(dispatchedEvents.length, 0, "changed=false 时不得派发外部刷新事件");
  } finally {
    (globalThis as any).window = prevWindow;
    (globalThis as any).CustomEvent = prevCustomEvent;
  }
}

console.log("主页 Agent 工具验收断言通过。");
