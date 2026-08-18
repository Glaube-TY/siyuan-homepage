import assert from "node:assert/strict";
import { hasTemporaryWorkbenchLayout } from "../src/features/kb/services/agent-workbench/tools/homepage/temporary-workbench-contract";
import { normalizeStorageRead } from "../src/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import { createMemoryManageTool } from "../src/features/kb/services/agent-workbench/tools/system/memory-manage.tool";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import {
  AGENT_CAPABILITY_IDS,
  AGENT_CONTEXT_SOURCE_IDS,
  AGENT_PROFILE_SCHEMA_VERSION,
  EDITOR_SELECTION_AGENT_PROFILE_ID,
  HOMEPAGE_STATUS_AGENT_PROFILE_ID,
  agentProfileAllowsContext,
  agentProfileHasCapability,
  agentProfileAllowsMemory,
  agentProfileResourceAllowList,
  agentProfileAllowsTool,
  agentProfileAllowsToolAction,
  getAgentProfile,
  KNOWLEDGE_CHAT_AGENT_PROFILE_ID,
  ROBOT_AGENT_PROFILE_ID,
  ROBOT_AGENT_TOOL_NAMES,
  registerAgentProfile,
} from "../src/features/agent-platform/agent-profile";
import { ToolRegistry } from "../src/features/kb/services/agent-workbench/registries/tool-registry";
import type { ToolContract } from "../src/features/kb/services/agent-workbench/contracts/tool-contract";
import { buildAgentSystemPrompt } from "../src/features/kb/services/agent-core/prompts/system-prefix";
import { createAgentSurfaceCapabilitySnapshot } from "../src/features/agent-platform/agent-surface-capability";
import { AGGREGATE_TOOL_CATALOG, findAggregateToolMeta } from "../src/features/kb/services/agent-workbench/tools/aggregate/aggregate-tool-metadata";
import { isCompatibleOpenCodeModel } from "../src/features/kb/services/qa/model-list-discovery";
import { resolveProviderProfile } from "../src/features/kb/services/qa/provider-profile";
import {
  collectTemporaryWorkbenches,
  HOMEPAGE_WORKBENCH_TOOL_NAME,
  isSafeSiyuanWorkbenchTarget,
  normalizeTemporaryWorkbench,
  normalizeTemporaryWorkbenchClassNames,
  toTemporaryWorkbenchReference,
} from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-workbench.tool";
import { normalizeButtonOps, normalizeSettingsPatch, buildSettingsPatchJsonSchema, validateSettingsResourceCoherence } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-settings-whitelist";
import { mergeKbSettings } from "../src/features/kb/services/settings/kb-settings-service";
import type { KbGlobalToolName, KbToolSettings } from "../src/features/kb/types/settings";
import { setNotebrainPlugin } from "../src/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import { registerHomepageAgentCapabilities } from "../src/features/kb/services/agent-workbench/composition/register-homepage-tools";
import { createRobotComponentBusinessBindings } from "../src/features/kb/services/agent-workbench/composition/register-homepage-component-tools";
import { buildToolPermissionPreview } from "../src/features/kb/services/agent-core/permissions/write-preview-builder";
import type { NativeTool } from "../src/features/kb/services/agent-core/tools/native-tool";
import { resolveRobotAllowance, resolveRobotWriteAction } from "../src/features/robot-assistant/settings/robot-settings-types";
import { normalizeV2Settings } from "../src/features/robot-assistant/settings/robot-settings-migration";
import { getHomepageAgentWidgetDescriptor } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-catalog";
import { createComponentSubtoolGate } from "../src/features/robot-assistant/agent/kernel-robot-agent-runtime";
import { HOMEPAGE_AGENT_WIDGET_CATALOG } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-catalog";
import { HomepageAgentService, providerBusinessCapability } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-service";
import { validateTitleIconEmoji } from "../src/features/kb/services/agent-workbench/tools/homepage/homepage-settings-whitelist";
import { siyuanNotebookManageInputSchema } from "../src/features/kb/services/agent-workbench/tools/siyuan/contracts/siyuan-notebook-manage.contract";
import { createDocInputSchema } from "../src/features/kb/services/agent-workbench/tools/siyuan/contracts/create-doc.contract";
import { createCreateDocTool } from "../src/features/kb/services/agent-workbench/tools/siyuan/create-doc.tool";
import { createAggregateTool } from "../src/features/kb/services/agent-workbench/tools/aggregate/aggregate-tool-factory";
import { createAgentToolHelpTool } from "../src/features/kb/services/agent-workbench/tools/aggregate/agent-tool-help.tool";

const profile = getAgentProfile(KNOWLEDGE_CHAT_AGENT_PROFILE_ID);

// siyuan_notebook_manage.set_icon 允许空字符串清除图标，但仍要求字段存在且为字符串。
assert.equal(siyuanNotebookManageInputSchema.safeParse({ action: "set_icon", notebook: "verify-notebook", icon: "1f4d4" }).success, true);
assert.equal(siyuanNotebookManageInputSchema.safeParse({ action: "set_icon", notebook: "verify-notebook", icon: "" }).success, true);
assert.equal(siyuanNotebookManageInputSchema.safeParse({ action: "set_icon", notebook: "verify-notebook" }).success, false);
assert.equal(siyuanNotebookManageInputSchema.safeParse({ action: "set_icon", notebook: "verify-notebook", icon: null }).success, false);
assert.equal(siyuanNotebookManageInputSchema.safeParse({ action: "list" }).success, true);
assert.equal(siyuanNotebookManageInputSchema.safeParse({ action: "create", name: "verify-notebook" }).success, true);
assert.equal(siyuanNotebookManageInputSchema.safeParse({ action: "set_conf", notebook: "verify-notebook", conf: {} }).success, true);

assert.equal(profile.schemaVersion, AGENT_PROFILE_SCHEMA_VERSION);
assert.equal(profile.execution.defaultMaxToolCalls, 20);
assert.deepEqual(profile.capabilities, AGENT_CAPABILITY_IDS);
assert.deepEqual(profile.permissions.contextSources, AGENT_CONTEXT_SOURCE_IDS);
assert.throws(() => registerAgentProfile(profile), /已注册/);
assert.throws(() => registerAgentProfile({
  ...profile,
  id: "future-profile",
  schemaVersion: 3,
} as unknown as typeof profile), /版本不受支持/);

const restricted = registerAgentProfile({
  schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
  id: "profile-verifier",
  label: "Profile verifier",
  capabilities: ["conversation", "tools", "external-skills", "mcp"],
  permissions: {
    contextSources: ["conversation"],
    tools: {
      names: ["safe_aggregate"],
      actions: { safe_aggregate: ["read"] },
    },
    memory: { read: false, write: false },
    externalSkillIds: ["safe-skill"],
    mcpServerIds: ["safe-server"],
    mcpToolNames: ["safe-tool"],
  },
  execution: { defaultMaxToolCalls: 3 },
});

assert.equal(agentProfileAllowsContext(restricted, "conversation"), true);
assert.equal(agentProfileAllowsContext(restricted, "global-memory"), false);
assert.equal(agentProfileAllowsMemory(restricted, "read"), false);
assert.deepEqual(agentProfileResourceAllowList(restricted.permissions.externalSkillIds), ["safe-skill"]);
assert.deepEqual(agentProfileResourceAllowList(restricted.permissions.mcpServerIds), ["safe-server"]);
assert.deepEqual(agentProfileResourceAllowList(restricted.permissions.mcpToolNames), ["safe-tool"]);
assert.equal(agentProfileAllowsTool(restricted, "blocked_tool"), false);
assert.equal(agentProfileAllowsToolAction(restricted, "safe_aggregate", "write"), false);

const surfaceCapabilities = createAgentSurfaceCapabilitySnapshot({
  contexts: [{
    id: "homepage-context:test",
    title: "测试组件",
    scope: "homepage-component",
    sensitivity: "private",
    source: { toolName: "safe_aggregate", actions: ["read"] },
  }],
  actions: [{
    id: "homepage-action:test:read",
    title: "读取测试组件",
    scope: "homepage-component",
    toolName: "safe_aggregate",
    action: "read",
    readOnly: true,
    idempotency: "read",
    requiresConfirmation: false,
  }],
});
assert.equal(surfaceCapabilities.contexts[0]?.source.actions[0], "read");
assert.throws(() => createAgentSurfaceCapabilitySnapshot({
  contexts: [surfaceCapabilities.contexts[0]!],
  actions: [{ ...surfaceCapabilities.actions[0]!, id: surfaceCapabilities.contexts[0]!.id }],
}), /duplicated/);
assert.throws(() => createAgentSurfaceCapabilitySnapshot({
  contexts: [{ ...surfaceCapabilities.contexts[0]!, source: { toolName: "safe_aggregate", actions: ["missing"] } }],
  actions: surfaceCapabilities.actions,
}), /not a registered read action/);

const robot = getAgentProfile(ROBOT_AGENT_PROFILE_ID);
assert.deepEqual(robot.permissions.contextSources, ["conversation", "runtime-tools", "global-memory"]);
assert.deepEqual(robot.permissions.tools.names, ROBOT_AGENT_TOOL_NAMES);
assert.equal(agentProfileAllowsTool(robot, "siyuan_kb"), true);
assert.equal(agentProfileAllowsTool(robot, "homepage_manage"), false);
assert.equal(agentProfileAllowsTool(robot, "homepage_components"), true);
assert.equal(agentProfileAllowsTool(robot, "homepage_music"), false);
assert.equal(agentProfileAllowsTool(robot, "notebrain_file"), false);
assert.equal(agentProfileAllowsMemory(robot, "read"), true);
assert.equal(agentProfileAllowsMemory(robot, "write"), true);
assert.equal(agentProfileAllowsTool(robot, "memory_manage"), true);
assert.equal(agentProfileHasCapability(robot, "mcp"), false);
assert.equal(agentProfileHasCapability(robot, "external-skills"), false);

const homepageStatus = getAgentProfile(HOMEPAGE_STATUS_AGENT_PROFILE_ID);
assert.deepEqual(homepageStatus.permissions.contextSources, ["homepage-statistics", "global-memory"]);
assert.equal(homepageStatus.execution.defaultMaxToolCalls, 0);
assert.equal(agentProfileAllowsTool(homepageStatus, "siyuan_kb"), false);
assert.equal(agentProfileAllowsContext(homepageStatus, "conversation"), false);
assert.equal(agentProfileAllowsMemory(homepageStatus, "write"), false);
assert.equal(agentProfileAllowsMemory(homepageStatus, "read"), true);

const editorSelection = getAgentProfile(EDITOR_SELECTION_AGENT_PROFILE_ID);
assert.deepEqual(editorSelection.permissions.contextSources, ["editor-selection", "editor-document"]);
assert.equal(editorSelection.execution.defaultMaxToolCalls, 0);
assert.equal(agentProfileAllowsContext(editorSelection, "homepage-statistics"), false);
assert.equal(agentProfileHasCapability(editorSelection, "tools"), false);

const openCodeGoProfile = resolveProviderProfile("opencode-go");
assert.equal(openCodeGoProfile.providerFamily, "opencode");
assert.equal(openCodeGoProfile.providerRequestStrategy, "chat_completions");
assert.equal(isCompatibleOpenCodeModel({ type: "opencode-go" } as any, "deepseek-v4-flash"), true);
assert.equal(isCompatibleOpenCodeModel({ type: "opencode-go" } as any, "gpt-5.6-luna"), false);
assert.equal(isCompatibleOpenCodeModel({ type: "opencode-zen" } as any, "minimax-m3"), true);
assert.equal(isCompatibleOpenCodeModel({ type: "opencode-zen" } as any, "claude-opus-4-6"), false);

assert.throws(() => registerAgentProfile({
  ...homepageStatus,
  id: "invalid-zero-tool-loop",
  capabilities: ["tools"],
}), /工具调用次数无效/);

const registry = new ToolRegistry({
  allowsTool: (name) => agentProfileAllowsTool(restricted, name),
  allowsAction: (toolName, action) => agentProfileAllowsToolAction(restricted, toolName, action),
});
const aggregateSchema = z.object({
  action: z.enum(["read", "write"]),
  args: z.record(z.string(), z.unknown()).optional(),
}).strict();
const aggregateTool: ToolContract = {
  name: "safe_aggregate",
  title: "Safe aggregate",
  description: "Verifier aggregate",
  inputSchema: aggregateSchema,
  inputJsonSchemaOverride: {
    type: "object",
    additionalProperties: false,
    properties: { action: { type: "string", enum: ["read", "write"] } },
    required: ["action"],
  },
  aggregateActionHelp: {
    read: { action: "read", readOnly: true },
    write: { action: "write", readOnly: false, requiresConfirmation: true },
  },
  readOnly: false,
  safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
  source: "builtin",
  providerVisible: true,
  availability: () => ({ available: true }),
  async execute(_ctx, args) {
    return { ok: true, data: args };
  },
};
registry.registerTool(aggregateTool);
registry.registerTool({ ...aggregateTool, name: "blocked_tool", aggregateActionHelp: undefined });

assert.equal(registry.getTool("blocked_tool"), undefined);
const manifest = registry.getToolManifest({ question: "", callCounts: {} })[0];
assert.deepEqual(
  ((manifest.inputJsonSchema as Record<string, any>).properties.action.enum),
  ["read"],
);
const restrictedTool = registry.getTool("safe_aggregate");
assert.deepEqual(Object.keys(restrictedTool?.aggregateActionHelp ?? {}), ["read"]);
const denied = await restrictedTool?.execute(
  { question: "", callCounts: {} },
  { action: "write", args: {} },
);
assert.equal(denied?.ok, false);
assert.equal(denied?.error?.code, "permission_denied");
const restrictedPrompt = buildAgentSystemPrompt({
  isToolAvailable: (toolName) => toolName === "safe_aggregate",
  isActionAvailable: (_toolName, action) => action === "read",
});
assert.equal(restrictedPrompt.includes("notebrain_file.run_command"), false);
assert.equal(restrictedPrompt.includes("homepage_manage"), false);

const turnAdapterSource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/runtime/run-agent-turn.ts", import.meta.url),
  "utf8",
);
const profileRunnerSource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/runtime/run-agent-profile.ts", import.meta.url),
  "utf8",
);
const robotRuntimeSource = readFileSync(
  new URL("../src/features/robot-assistant/agent/kernel-robot-agent-runtime.ts", import.meta.url),
  "utf8",
);
const selectionRunnerSource = readFileSync(
  new URL("../src/features/kb/services/selection-ai/selection-ai-runner.ts", import.meta.url),
  "utf8",
);
const selectionPopupSource = readFileSync(
  new URL("../src/features/kb/components/selection-ai/SelectionAiPopup.svelte", import.meta.url),
  "utf8",
);
const statusGeneratorSource = readFileSync(
  new URL("../src/homepage/header/status-ai-generator.ts", import.meta.url),
  "utf8",
);
const plainTextSource = readFileSync(
  new URL("../src/services/ai/plain-text-generation.ts", import.meta.url),
  "utf8",
);
const workbenchCompositionSource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/runtime/create-agent-workbench.ts", import.meta.url),
  "utf8",
);
const workbenchToolAdapterSource = readFileSync(
  new URL("../src/features/kb/services/agent-core/tools/workbench-tool-adapter.ts", import.meta.url),
  "utf8",
);
const homepageCapabilitySource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/composition/register-homepage-tools.ts", import.meta.url),
  "utf8",
);
const temporaryWorkbenchSource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/tools/homepage/homepage-workbench.tool.ts", import.meta.url),
  "utf8",
);
const temporaryWorkbenchContractSource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/tools/homepage/temporary-workbench-contract.ts", import.meta.url),
  "utf8",
);
const temporaryWorkbenchStoreSource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/tools/homepage/temporary-workbench-store.ts", import.meta.url),
  "utf8",
);
const chatMessageSource = readFileSync(
  new URL("../src/features/kb/components/common/chat-message-item.svelte", import.meta.url),
  "utf8",
);
const chatSessionStorageSource = readFileSync(
  new URL("../src/features/kb/services/session/kb-chat-session-storage.ts", import.meta.url),
  "utf8",
);

assert.match(turnAdapterSource, /runAgentProfile/);
for (const platformAssembly of [
  "createProviderAdapterForKbModel",
  "createAgentWorkbenchRuntime",
  "NativeToolAgentLoop",
  "buildGlobalMemoryContext",
  "setMcpRuntimeSettings",
]) {
  assert.equal(turnAdapterSource.includes(platformAssembly), false);
  assert.equal(profileRunnerSource.includes(platformAssembly), true);
}
assert.equal(
  existsSync(new URL("../src/features/kb/services/agent-workbench/runtime/native-agent-runner.ts", import.meta.url)),
  false,
);
assert.equal(
  existsSync(new URL("../src/features/kb/services/agent-core/tools/native-tool-registry-builder.ts", import.meta.url)),
  false,
);
assert.match(robotRuntimeSource, /ROBOT_AGENT_PROFILE_ID/);
assert.match(robotRuntimeSource, /agentProfileAllowsTool/);
assert.match(statusGeneratorSource, /HOMEPAGE_STATUS_AGENT_PROFILE_ID/);
assert.match(selectionRunnerSource, /EDITOR_SELECTION_AGENT_PROFILE_ID/);
assert.equal(selectionRunnerSource.includes("streamModelText"), false);
assert.match(plainTextSource, /agentProfileAllowsContext/);
assert.match(plainTextSource, /streamModelText/);
assert.match(selectionPopupSource, /onDestroy\(\(\) => \{[\s\S]*abortController\?\.abort\(\)/);
assert.match(workbenchCompositionSource, /registerHomepageAgentCapabilities/);
assert.equal(workbenchCompositionSource.includes("registerHomepageComponentTools("), false);
assert.match(homepageCapabilitySource, /HOMEPAGE_AGENT_WIDGET_CATALOG/);
assert.match(homepageCapabilitySource, /createAgentSurfaceCapabilitySnapshot/);
assert.match(homepageCapabilitySource, /createHomepageWorkbenchTool/);
assert.match(temporaryWorkbenchContractSource, /DOMPurify\.sanitize/);
assert.match(temporaryWorkbenchContractSource, /FORBID_TAGS:[\s\S]*"script"[\s\S]*"iframe"/);
assert.match(temporaryWorkbenchContractSource, /FORBID_ATTR: \["style"\]/);
assert.match(temporaryWorkbenchSource, /saveTemporaryWorkbench/);
assert.match(temporaryWorkbenchStoreSource, /notebrain\/workbenches\/index\.json/);
assert.match(temporaryWorkbenchStoreSource, /notebrain\/workbenches\/items/);
assert.match(chatMessageSource, /openTemporaryWorkbenchDialog/);
assert.equal(chatMessageSource.includes("{@html workbench.html}"), false);
assert.match(chatSessionStorageSource, /temporaryWorkbenches/);
assert.match(chatSessionStorageSource, /normalizeTemporaryWorkbench/);
assert.equal(normalizeTemporaryWorkbenchClassNames("wb-card evil wb-accent"), "wb-card wb-accent");
assert.equal(isSafeSiyuanWorkbenchTarget("20260812123456-abcdefg"), true);
assert.equal(isSafeSiyuanWorkbenchTarget("javascript:alert(1)"), false);
assert.equal(hasTemporaryWorkbenchLayout('<section><h2>只有文章</h2><p>几段文字</p></section>'), false);
assert.equal(hasTemporaryWorkbenchLayout('<div class="wb-grid wb-grid-2"><article class="wb-card">A</article><article class="wb-stat">B</article></div>'), true);
assert.deepEqual(normalizeStorageRead(""), { status: "missing" });
assert.deepEqual(normalizeStorageRead({ ok: true }), { status: "ok", data: { ok: true } });
const automaticMemoryTool = createMemoryManageTool({
  read: true,
  write: true,
  source: { profileId: "verify", surface: "verify" },
  writeRequiresConfirmation: false,
});
assert.equal(automaticMemoryTool.resolveCallSafety?.({ action: "remember", args: {} }).requiresConfirmation, false);
assert.equal(automaticMemoryTool.resolveCallSafety?.({ action: "update", args: {} }).requiresConfirmation, false);
assert.equal(automaticMemoryTool.resolveCallSafety?.({ action: "forget", args: {} }).requiresConfirmation, false);
assert.match(workbenchToolAdapterSource, /callSafety\.requiresConfirmation === false[\s\S]*permissionAction: "allow"/);
assert.deepEqual(toTemporaryWorkbenchReference({
  schemaVersion: 1,
  id: "workbench-1-verify",
  title: "验证工作台",
  html: '<section class="wb-card">内容</section>',
  createdAt: 1,
}), {
  id: "workbench-1-verify",
  title: "验证工作台",
  createdAt: 1,
});
assert.equal(normalizeTemporaryWorkbench({ schemaVersion: 2 }), undefined);
assert.equal(findAggregateToolMeta(HOMEPAGE_WORKBENCH_TOOL_NAME)?.actions.length, 0);
assert.equal(findAggregateToolMeta(HOMEPAGE_WORKBENCH_TOOL_NAME)?.name, "temporary_workbench");

// ── 两顶层主页工具结构 ──
const manageMeta = findAggregateToolMeta("homepage_manage");
const componentsMeta = findAggregateToolMeta("homepage_components");
assert.equal(
  manageMeta?.actions.some((action) => action.name === "instance.update_style"),
  false,
  "组件实例操作必须从 homepage_manage 移出",
);
for (const actionName of ["overview", "get_layout", "list_sections", "get_settings", "update_settings", "list_buttons", "update_buttons", "update_layout", "create_section", "set_section_mode"]) {
  assert.equal(
    manageMeta?.actions.some((action) => action.name === actionName),
    true,
    `homepage_manage 必须包含 ${actionName}`,
  );
}
for (const actionName of ["catalog.list_types", "catalog.get_type", "instance.list", "quick_note.write", "focus.record_session", "accounting.add_record", "fixed_assets.list", "anniversary.add", "favorites.list", "review.schedule", "music.search", "music.play", "weather.instance.get", "weather.instance.remove"]) {
  assert.equal(
    componentsMeta?.actions.some((action) => action.name === actionName),
    true,
    `homepage_components 必须包含 ${actionName}`,
  );
}
for (const actionName of ["instance.get", "instance.add", "instance.update", "instance.update_style", "instance.move", "instance.remove"]) {
  assert.equal(componentsMeta?.actions.some((action) => action.name === actionName), false, `metadata 不得公开通用 ${actionName}`);
}
// 旧顶层工具不再出现在 catalog。
for (const legacyName of ["homepage_settings", "homepage_quick_note", "homepage_focus", "homepage_accounting", "homepage_fixed_assets", "homepage_anniversary", "homepage_favorites", "homepage_review", "homepage_music", "homepage_workbench"]) {
  assert.equal(findAggregateToolMeta(legacyName), undefined, `${legacyName} 必须从聚合目录移除`);
}
// Knowledge Chat manifest 只保留两个持久化主页顶层工具（temporary_workbench 是会话内展示，不算主页管理）。
const homepageTopLevelTools = AGGREGATE_TOOL_CATALOG
  .filter((tool) => tool.name.startsWith("homepage_") || tool.name === "temporary_workbench")
  .map((tool) => tool.name)
  .sort();
assert.deepEqual(homepageTopLevelTools, ["homepage_components", "homepage_manage", "temporary_workbench"], "持久化主页顶层工具必须只有 homepage_manage 与 homepage_components");
assert.equal(manageMeta?.actions.find((action) => action.name === "update_settings")?.readOnly, false);
assert.match(
  homepageCapabilitySource,
  /createHomepageSettingsActionTools/,
  "主页能力注册必须包含主页设置 action 工厂",
);
const homepageAgentServiceSource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-service.ts", import.meta.url),
  "utf8",
);
assert.match(
  homepageAgentServiceSource,
  /自定义背景\/边框声明已全部移除/,
  "inherit 样式写后验证必须按声明移除验证，而不是比较派生 appearanceMode",
);
const widgetCatalogSource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-catalog.ts", import.meta.url),
  "utf8",
);
assert.match(
  widgetCatalogSource,
  /type: "notebrain"/,
  "组件目录必须包含桌面专用的 notebrain 描述符，保证移除/样式操作可用",
);
const widgetAdaptersSource = readFileSync(
  new URL("../src/features/kb/services/agent-workbench/tools/homepage/homepage-agent-widget-adapters.ts", import.meta.url),
  "utf8",
);
assert.match(
  widgetAdaptersSource,
  /descriptor\.advancedRequired[\s\S]*需要高级功能/,
  "高级组件在权益缺失时必须整体拒绝配置写入",
);
assert.deepEqual(
  normalizeSettingsPatch({ bannerEnabled: true, bannerHeight: 300, customTitle: "主页" }, false),
  { bannerEnabled: true, bannerHeight: "300", customTitle: "主页" },
);
assert.deepEqual(
  normalizeSettingsPatch({ bannerTitleColor: "#FF8800" }, true),
  { bannerTitleColor: "#ff8800" },
);
assert.throws(() => normalizeSettingsPatch({ footerEnabled: true }, false), /高级功能/);
assert.throws(() => normalizeSettingsPatch({ bannerGlobalType: "bing" }, false), /高级功能/);
assert.throws(() => normalizeSettingsPatch({ statusTextMode: "ai" }, false), /高级功能/);
assert.throws(() => normalizeSettingsPatch({ notARealField: 1 }, true), /白名单/);
assert.throws(() => normalizeSettingsPatch({ bannerRemoteUrl: "file:///etc/passwd" }, true), /http/);
assert.throws(() => normalizeSettingsPatch({ preferredThemeId: "builtin.classic" }, true), /不存在或不支持/);
const baseButtons = [
  { id: 1, label: "搜索", checked: true, order: 0, action: "search" },
  { id: 2, label: "我的链接", checked: true, order: 1 },
];
assert.deepEqual(
  normalizeButtonOps(baseButtons, [{ op: "toggle", id: 1, checked: false }, { op: "rename", id: 2, label: "博客" }]),
  [
    { id: 1, label: "搜索", checked: false, order: 0, action: "search" },
    { id: 2, label: "博客", checked: true, order: 1 },
  ],
);
assert.throws(
  () => normalizeButtonOps(baseButtons, [{ op: "add", label: "新按钮" }]),
  /不支持的按钮操作/,
  "add 操作已移除：Agent 不能创建无功能按钮",
);
assert.deepEqual(
  normalizeButtonOps(baseButtons, [{ op: "reorder", orderedIds: [2, 1] }]).map((item) => item.id),
  [2, 1],
);
assert.throws(() => normalizeButtonOps(baseButtons, [{ op: "remove", id: 1 }]), /内置按钮/);
assert.throws(() => normalizeButtonOps(baseButtons, [{ op: "rename", id: 1, label: "改名" }]), /内置按钮/);
assert.throws(() => normalizeButtonOps(baseButtons, [{ op: "reorder", orderedIds: [1] }]), /全部现有按钮/);
assert.deepEqual(collectTemporaryWorkbenches([{
  id: 1,
  timestamp: 1,
  kind: "tool_executed",
  toolName: HOMEPAGE_WORKBENCH_TOOL_NAME,
  content: {
    schemaVersion: 1,
    id: "workbench-1-verify",
    title: "今日工作台",
    html: '<section class="wb-card">内容</section>',
    createdAt: 1,
  },
}]).map((item) => item.id), ["workbench-1-verify"]);
assert.deepEqual(collectTemporaryWorkbenches([{
  id: 2,
  timestamp: 2,
  kind: "tool_executed",
  toolName: "homepage_workbench",
  content: {
    schemaVersion: 1,
    id: "workbench-2-legacy",
    title: "旧工作台",
    html: '<section class="wb-card">内容</section>',
    createdAt: 2,
  },
}]).map((item) => item.id), ["workbench-2-legacy"]);

// ── 旧设置迁移：旧组件工具名 → homepage_components 子工具禁用；旧确认覆盖 → dotted action ──
const migrated = mergeKbSettings({
  toolSettings: {
    // 旧工具名不属于 KbGlobalToolName，这里用 as unknown 模拟历史存储内容。
    disabledGlobalToolNames: [
      "homepage_quick_note",
      "homepage_music",
      "siyuan_doc_edit",
      "homepage_components",
    ] as unknown as KbGlobalToolName[],
    toolActionConfirmOverrides: {
      homepage_music: { delete_playlist: false, status: false, dead_action: false },
      homepage_manage: { update_settings: false },
    } as unknown as KbToolSettings["toolActionConfirmOverrides"],
  },
});
assert.deepEqual(
  migrated.toolSettings.disabledSubtools?.["homepage_components"]?.sort(),
  ["music", "quick_note"],
  "旧 homepage_quick_note/homepage_music 禁用状态必须迁移为子工具前缀",
);
assert.equal(
  (migrated.toolSettings.disabledGlobalToolNames as unknown as string[]).includes("homepage_quick_note"),
  false,
  "旧组件工具名不得再出现在 disabledGlobalToolNames",
);
assert.equal(
  migrated.toolSettings.toolActionConfirmOverrides?.["homepage_components"]?.["music.delete_playlist"],
  false,
  "旧 homepage_music.delete_playlist 确认覆盖必须迁移为 homepage_components.music.delete_playlist",
);
assert.equal(
  migrated.toolSettings.toolActionConfirmOverrides?.["homepage_manage"]?.["update_settings"],
  false,
  "homepage_manage 的确认覆盖必须保留",
);

// ── 设置资源配套校验 ──
assert.throws(
  () => validateSettingsResourceCoherence({ bannerType: "remote" }, {}),
  /bannerRemoteUrl/,
  "remote 横幅必须要求远程地址",
);
assert.throws(
  () => validateSettingsResourceCoherence({ titleIconType: "image" }, {}),
  /标题图标图片数据/,
  "image 标题图标不能在没有图片数据时切换",
);
assert.doesNotThrow(() => validateSettingsResourceCoherence({ bannerType: "remote" }, { bannerRemoteUrl: "https://example.com/b.jpg" }));
assert.doesNotThrow(() => validateSettingsResourceCoherence({ titleIconType: "image" }, { TitleIconImage: "data:image/png;base64,xxx" }));

// ── 严格 argsSchema：update_settings 的真实 contract schema 必须包含 patch 白名单字段 ──
const settingsPatchSchema = buildSettingsPatchJsonSchema();
assert.equal((settingsPatchSchema.properties as Record<string, unknown>).preferredThemeId !== undefined, true);
assert.equal((settingsPatchSchema.properties as Record<string, unknown>).bannerRemoteUrl !== undefined, true);
assert.equal((settingsPatchSchema.properties as Record<string, unknown>).customTitle !== undefined, true);
assert.equal((settingsPatchSchema as { additionalProperties: boolean }).additionalProperties, false);

// ── 严格 action 参数：create_doc 不接受模型凭常识添加的 title 等字段 ──
assert.equal(createDocInputSchema.safeParse({ notebookId: "notebook-id", path: "/测试文档", markdown: "# 测试" }).success, true, "create_doc 带 markdown 必须通过");
assert.equal(createDocInputSchema.safeParse({ notebookId: "notebook-id", path: "/测试文档" }).success, true, "create_doc 不带 markdown 必须通过");
assert.equal(createDocInputSchema.safeParse({ notebookId: "notebook-id", path: "/测试文档", title: "测试文档" }).success, false, "create_doc 的未知 title 必须被拒绝");

const createDocAggregate = createAggregateTool({
  name: "siyuan_doc_edit",
  title: "思源知识库",
  description: "严格参数验证器",
  boundary: "仅用于验证。",
  actions: [{
    action: "create_doc",
    internallyConfirmed: true,
    tool: createCreateDocTool({
      executeCreateDoc: async () => { throw new Error("invalid args 不得进入 create_doc 执行器"); },
    }),
  }],
});
const invalidCreateDocArgs = { action: "create_doc", args: { notebookId: "notebook-id", path: "/测试文档", title: "测试文档" } };
const createDocPreviewFailure = createDocAggregate.validateInputForPreview?.(invalidCreateDocArgs);
assert.equal(createDocPreviewFailure?.ok, false, "create_doc preflight 必须拒绝未知字段");
const createDocPreviewDetails = createDocPreviewFailure?.error?.details as Record<string, unknown>;
assert.deepEqual(createDocPreviewDetails.allowedFields, ["notebookId", "path", "markdown"]);
assert.deepEqual(createDocPreviewDetails.unexpectedFields, ["title"]);
const createDocExecuteFailure = await createDocAggregate.execute({ question: "", callCounts: {} }, invalidCreateDocArgs);
assert.equal(createDocExecuteFailure.ok, false, "create_doc execute 必须拒绝未知字段");
assert.equal(createDocExecuteFailure.error?.code, "invalid_action_args", "create_doc 未知字段必须返回 invalid_action_args");
assert.deepEqual((createDocExecuteFailure.error?.details as Record<string, unknown>).allowedFields, ["notebookId", "path", "markdown"]);
assert.deepEqual((createDocExecuteFailure.error?.details as Record<string, unknown>).unexpectedFields, ["title"]);
assert.match(createDocExecuteFailure.error?.message ?? "", /严格 Schema/);
assert.match(createDocExecuteFailure.error?.hint ?? "", /additionalProperties=false/);

const strictArgsTool: ToolContract = {
  name: "strict_args",
  title: "严格参数测试",
  description: "严格参数测试",
  inputSchema: z.object({ id: z.string(), value: z.number() }).strict(),
  readOnly: true,
  safety: { readOnly: true },
  source: "builtin",
  providerVisible: true,
  availability: () => ({ available: true }),
  async execute(_ctx, args) { return { ok: true, data: args }; },
};
const strictArgsAggregate = createAggregateTool({
  name: "siyuan_doc_edit",
  title: "严格参数聚合测试",
  description: "严格参数聚合测试",
  boundary: "仅用于验证。",
  actions: [{ action: "strict_args", tool: strictArgsTool }],
});
const strictArgsFailure = await strictArgsAggregate.execute(
  { question: "", callCounts: {} },
  { action: "strict_args", args: { id: "id", value: 1, name: "不允许" } },
);
assert.equal(strictArgsFailure.error?.code, "invalid_action_args", "通用严格 action 未知字段必须返回 invalid_action_args");
assert.deepEqual((strictArgsFailure.error?.details as Record<string, unknown>).allowedFields, ["id", "value"]);
assert.deepEqual((strictArgsFailure.error?.details as Record<string, unknown>).unexpectedFields, ["name"]);

const helpTool = createAgentToolHelpTool({
  externalSkillSettings: { enabled: false, maxSkillReadChars: 8000, autoInstallEnabled: false, disabledSkillIds: [] },
  availableTools: [{ name: "siyuan_doc_edit", actions: ["create_doc"], actionHelp: createDocAggregate.aggregateActionHelp }],
});
const createDocHelp = await helpTool.execute(
  { question: "", callCounts: {} },
  { action: "describe_action", toolName: "siyuan_doc_edit", actionName: "create_doc" },
);
assert.equal(createDocHelp.ok, true, "agent_tool_help 必须能描述 create_doc");
const createDocHelpData = createDocHelp.data as Record<string, any>;
assert.deepEqual(createDocHelpData.required, ["notebookId", "path"]);
assert.deepEqual(Object.keys(createDocHelpData.argsSchema.properties), ["notebookId", "path", "markdown"]);
assert.equal(createDocHelpData.argsSchema.additionalProperties, false);
assert.match(createDocHelpData.inputHint, /只允许传 notebookId、path、markdown/);
assert.match(createDocHelpData.inputHint, /不要传 title/);
assert.ok(createDocHelpData.examples.every((example: { args: Record<string, unknown> }) => !Object.hasOwn(example.args, "title")));

// ── 1. homepage_manage / homepage_components 四种开关组合（真实注册行为）──
setNotebrainPlugin({ isMobile: false } as never);
const ALL_COMPONENTS_ACCESS = { quickNote: true, focus: true, accounting: true, fixedAssets: true, anniversary: true, favorites: true, review: true, music: true };
function buildHomepageRegistrations(enabled: boolean, componentsEnabled: boolean) {
  const toolRegistry = new ToolRegistry();
  registerHomepageAgentCapabilities(toolRegistry, {
    enabled,
    componentsEnabled,
    workbench: false,
    workbenchSource: { profileId: "verify", label: "验证" },
    components: ALL_COMPONENTS_ACCESS,
  });
  return toolRegistry;
}
function buildHomepageRegistrationsFromSettings(settings: ReturnType<typeof mergeKbSettings>) {
  const toolRegistry = new ToolRegistry();
  const disabledGlobalToolNames = settings.toolSettings.disabledGlobalToolNames;
  registerHomepageAgentCapabilities(toolRegistry, {
    enabled: !disabledGlobalToolNames.includes("homepage_manage"),
    componentsEnabled: !disabledGlobalToolNames.includes("homepage_components"),
    workbench: false,
    workbenchSource: { profileId: "verify-migrated", label: "迁移验收" },
    disabledComponentSubtools: settings.toolSettings.disabledSubtools?.homepage_components,
    components: ALL_COMPONENTS_ACCESS,
  });
  return toolRegistry;
}
assert.equal(buildHomepageRegistrations(true, true).getTool("homepage_manage") !== undefined, true, "组合1：manage+components 都注册");
assert.equal(buildHomepageRegistrations(true, true).getTool("homepage_components") !== undefined, true);
assert.equal(buildHomepageRegistrations(true, false).getTool("homepage_manage") !== undefined, true, "组合2：只有 manage");
assert.equal(buildHomepageRegistrations(true, false).getTool("homepage_components") === undefined, true);
assert.equal(buildHomepageRegistrations(false, true).getTool("homepage_manage") === undefined, true, "组合3：只有 components");
assert.equal(buildHomepageRegistrations(false, true).getTool("homepage_components") !== undefined, true);
assert.equal(buildHomepageRegistrations(false, false).getTool("homepage_manage") === undefined, true, "组合4：都没有");
assert.equal(buildHomepageRegistrations(false, false).getTool("homepage_components") === undefined, true);

// 旧 homepage_manage 禁用必须迁移为同时禁用 homepage_components；新版 schemaVersion=1 保持独立。
const legacyHomepageManageOnly = mergeKbSettings({
  toolSettings: {
    disabledGlobalToolNames: ["homepage_manage"] as unknown as KbGlobalToolName[],
  },
});
assert.equal(legacyHomepageManageOnly.toolSettings.schemaVersion, 1);
assert.equal(legacyHomepageManageOnly.toolSettings.disabledGlobalToolNames.includes("homepage_manage"), true);
assert.equal(legacyHomepageManageOnly.toolSettings.disabledGlobalToolNames.includes("homepage_components"), true);
assert.deepEqual(
  legacyHomepageManageOnly.toolSettings.disabledSubtools?.homepage_components?.sort(),
  ["catalog", "instance"],
);
const legacyHomepageManageAndMusic = mergeKbSettings({
  toolSettings: {
    disabledGlobalToolNames: ["homepage_manage", "homepage_music"] as unknown as KbGlobalToolName[],
  },
});
assert.equal(legacyHomepageManageAndMusic.toolSettings.disabledGlobalToolNames.includes("homepage_components"), true);
assert.deepEqual(
  legacyHomepageManageAndMusic.toolSettings.disabledSubtools?.homepage_components?.sort(),
  ["catalog", "instance", "music"],
);
const migratedHomepageRegistry = buildHomepageRegistrationsFromSettings(legacyHomepageManageAndMusic);
assert.equal(migratedHomepageRegistry.getTool("homepage_manage"), undefined);
assert.equal(migratedHomepageRegistry.getTool("homepage_components"), undefined);
const migratedHomepageManifestActions = migratedHomepageRegistry
  .getToolManifest({ question: "", callCounts: {} })
  .filter((tool) => tool.name === "homepage_components")
  .flatMap((tool) => {
    const schema = tool.inputJsonSchema as { properties?: { action?: { enum?: unknown[] } } };
    return (schema.properties?.action?.enum ?? []).filter((action): action is string => typeof action === "string");
  });
assert.equal(migratedHomepageManifestActions.some((action) => action.startsWith("weather.instance.")), false);
assert.equal(migratedHomepageManifestActions.some((action) => action.startsWith("accounting.instance.")), false);
assert.equal(
  migratedHomepageManifestActions.length,
  0,
  "旧 homepage_manage 禁用迁移后不得注册 homepage_components manifest",
);
const currentIndependent = mergeKbSettings({
  toolSettings: {
    schemaVersion: 1,
    disabledGlobalToolNames: ["homepage_manage"] as unknown as KbGlobalToolName[],
  },
});
assert.equal(currentIndependent.toolSettings.disabledGlobalToolNames.includes("homepage_manage"), true);
assert.equal(currentIndependent.toolSettings.disabledGlobalToolNames.includes("homepage_components"), false);
assert.equal(currentIndependent.toolSettings.disabledSubtools, undefined);
const currentIndependentRegistry = buildHomepageRegistrationsFromSettings(currentIndependent);
assert.equal(currentIndependentRegistry.getTool("homepage_manage"), undefined);
assert.notEqual(currentIndependentRegistry.getTool("homepage_components"), undefined);
assert.deepEqual(
  mergeKbSettings({ toolSettings: legacyHomepageManageOnly.toolSettings }).toolSettings,
  legacyHomepageManageOnly.toolSettings,
  "旧 homepage_manage 禁用迁移必须幂等",
);

// ── 2-4. 旧默认设置迁移：权限不扩大、workbench 迁移、删除死的实例确认覆盖 ──
const legacyDefaultNames = [
  "homepage_manage", "homepage_quick_note", "homepage_focus", "homepage_accounting",
  "homepage_fixed_assets", "homepage_anniversary", "homepage_favorites", "homepage_review",
  "homepage_music", "homepage_workbench",
];
const migratedDefaults = mergeKbSettings({
  toolSettings: {
    disabledGlobalToolNames: legacyDefaultNames as unknown as KbGlobalToolName[],
    toolActionConfirmOverrides: {
      homepage_manage: { add_widget: false, update_widget: false, update_widget_style: false, move_widget: false, remove_widget: false },
      homepage_music: { delete_playlist: false, status: false, dead_action: false },
    } as unknown as KbToolSettings["toolActionConfirmOverrides"],
  },
});
assert.equal(migratedDefaults.toolSettings.disabledGlobalToolNames.includes("homepage_manage"), true, "旧 homepage_manage 禁用必须保留");
assert.equal(migratedDefaults.toolSettings.disabledGlobalToolNames.includes("homepage_components"), true, "全部子工具禁用时父工具必须禁用");
assert.equal(migratedDefaults.toolSettings.disabledGlobalToolNames.includes("temporary_workbench"), true, "旧 homepage_workbench 禁用必须迁移为 temporary_workbench");
assert.deepEqual(
  migratedDefaults.toolSettings.disabledSubtools?.["homepage_components"]?.sort(),
  ["accounting", "anniversary", "catalog", "favorites", "fixed_assets", "focus", "instance", "music", "quick_note", "review"],
  "旧 homepage_manage 禁用时 catalog/instance 必须一并禁用；旧组件名必须迁移为前缀",
);
assert.equal(
  migratedDefaults.toolSettings.toolActionConfirmOverrides?.["homepage_components"]?.["instance.add"],
  undefined,
  "旧 add_widget 确认覆盖不得迁移为已删除的 instance.add",
);
for (const actionName of ["instance.get", "instance.update", "instance.update_style", "instance.move", "instance.remove"]) {
  assert.equal(
    migratedDefaults.toolSettings.toolActionConfirmOverrides?.["homepage_components"]?.[actionName],
    undefined,
    `迁移后不得留下已删除的 ${actionName} 确认覆盖`,
  );
}
assert.equal(
  migratedDefaults.toolSettings.toolActionConfirmOverrides?.["homepage_components"]?.["music.delete_playlist"],
  false,
  "旧 homepage_music.delete_playlist 确认覆盖必须迁移",
);
assert.equal(
  migratedDefaults.toolSettings.toolActionConfirmOverrides?.["homepage_components"]?.["music.status"],
  undefined,
  "只读旧 action 不得迁移为确认覆盖",
);
const validHomepageComponentActions = new Set(componentsMeta?.actions.map((action) => action.name) ?? []);
for (const [actionName] of Object.entries(migratedDefaults.toolSettings.toolActionConfirmOverrides?.["homepage_components"] ?? {})) {
  assert.equal(validHomepageComponentActions.has(actionName), true, `homepage_components 确认覆盖不得指向 metadata 外的 action：${actionName}`);
}
// 10. 归一化迁移幂等：第二次读取结果一致。
const migratedTwice = mergeKbSettings({ toolSettings: migratedDefaults.toolSettings });
assert.equal(JSON.stringify(migratedTwice.toolSettings), JSON.stringify(migratedDefaults.toolSettings), "迁移后再次归一化必须幂等");
assert.equal(migratedTwice.toolSettings.schemaVersion, 1);
// 部分业务启用时：父工具启用，只禁用旧禁用的子工具。
const partiallyMigrated = mergeKbSettings({
  toolSettings: {
    disabledGlobalToolNames: ["homepage_quick_note", "homepage_workbench"] as unknown as KbGlobalToolName[],
  },
});
assert.equal(partiallyMigrated.toolSettings.disabledGlobalToolNames.includes("homepage_components"), false, "部分业务启用时父工具可以启用");
assert.deepEqual(
  partiallyMigrated.toolSettings.disabledSubtools?.["homepage_components"]?.sort(),
  ["quick_note"],
  "部分迁移只禁用旧禁用的子工具",
);
assert.equal(partiallyMigrated.toolSettings.disabledGlobalToolNames.includes("temporary_workbench"), true);

// ── 5. Robot 只注册允许的 Kernel-safe 子工具 ──
const robotBindings = createRobotComponentBusinessBindings();
const robotBindingActions = robotBindings.map((binding) => binding.action);
assert.equal(robotBindingActions.includes("music.status"), false, "music 不能进入 Robot Kernel");
assert.equal(robotBindingActions.some((action) => action.startsWith("catalog.") || action.startsWith("instance.")), false, "catalog/instance 不能进入 Robot Kernel");
assert.equal(robotBindingActions.includes("quick_note.write"), true);
assert.equal(robotBindingActions.includes("accounting.add_record"), true);

// ── 6. Robot 子工具 remoteAllowed=false 拒绝执行 ──
const denyPolicy = {
  tools: {
    "homepage_components.quick_note": { remoteAllowed: false, writeAction: "deny" },
    "homepage_components.accounting": { remoteAllowed: true, writeAction: "ask" },
    "homepage_components": { remoteAllowed: true, writeAction: "ask" },
  },
  defaultWriteAction: "ask",
  readOnlyDefaultAllowed: true,
} as const;
assert.equal(resolveRobotAllowance(denyPolicy, "homepage_components", "quick_note.write", false).remoteAllowed, false, "子工具 deny 必须拒绝执行");
assert.equal(resolveRobotAllowance(denyPolicy, "homepage_components", "accounting.add_record", false).remoteAllowed, true);
assert.equal(resolveRobotAllowance(denyPolicy, "homepage_components", "accounting.add_record", false).writeAction, "ask");
// 子工具策略优先于顶层策略。
assert.equal(resolveRobotAllowance(denyPolicy, "homepage_components", "quick_note.status", true).remoteAllowed, false, "子工具 deny 必须覆盖顶层 allow");
// 7. writeAction=deny 不发起确认。
assert.equal(resolveRobotWriteAction(denyPolicy, "homepage_components", "quick_note.write"), "deny");
assert.equal(resolveRobotWriteAction(denyPolicy, "homepage_components", "accounting.add_record"), "ask");
assert.equal(resolveRobotWriteAction(denyPolicy, "homepage_components", "music.play"), "ask", "未配置前缀走顶层策略");

// ── 8. 预览保留 homepage_components 身份与完整 dotted action ──
const fakeComponentsTool: NativeTool = {
  name: "homepage_components",
  title: "主页组件",
  description: "测试",
  parameters: { type: "object", properties: {} },
  readOnly: false,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: "medium" },
  execute: async () => ({ ok: true, content: "", summary: "" }),
};
for (const [action, expectedRisk] of [
  ["accounting.archive_record", "high"],
  ["weather.instance.remove", "high"],
  ["music.play", "low"],
  ["quick_note.write", "medium"],
] as const) {
  const preview = buildToolPermissionPreview(fakeComponentsTool, { action, args: { recordId: "r", expectedUpdatedAt: "x" } });
  assert.equal(preview.toolName, "homepage_components", `${action} 预览必须保留 homepage_components 身份`);
  assert.equal(preview.title, "主页组件", `${action} 预览 title 必须为主页组件`);
  assert.equal((preview.argsPreview as Record<string, unknown>).action, action, `${action} 预览必须保留完整 dotted action`);
  assert.equal(preview.risk, expectedRisk, `${action} 风险等级必须保持`);
}
const fakeNotebookManageTool: NativeTool = {
  ...fakeComponentsTool,
  name: "siyuan_notebook_manage",
  title: "管理笔记本",
};
const clearNotebookIconPreview = buildToolPermissionPreview(fakeNotebookManageTool, {
  action: "set_icon",
  notebook: "verify-notebook",
  icon: "",
});
const setNotebookIconPreview = buildToolPermissionPreview(fakeNotebookManageTool, {
  action: "set_icon",
  notebook: "verify-notebook",
  icon: "1f4d4",
});
assert.equal(clearNotebookIconPreview.toolName, "siyuan_notebook_manage");
assert.equal((clearNotebookIconPreview.argsPreview as Record<string, unknown>).icon, "");
assert.equal(clearNotebookIconPreview.targetSummary, "notebook: verify-notebook");
assert.match(clearNotebookIconPreview.impactSummary ?? "", /清除笔记本图标/);
assert.match(setNotebookIconPreview.impactSummary ?? "", /设置笔记本图标：1f4d4/);

// ── 9. catalog.get_type 不返回旧死工具名 ──
for (const type of ["musicPlayer", "accounting", "quick-notes", "focus"]) {
  const capability = getHomepageAgentWidgetDescriptor(type)?.businessCapability;
  assert.equal(capability?.toolName, "homepage_components", `${type} 业务路由 toolName 必须是 homepage_components`);
  assert.equal(typeof capability?.subtool, "string", `${type} 业务路由必须提供 subtool`);
  assert.equal(Array.isArray(capability?.operations) && (capability?.operations?.length ?? 0) > 0, true, `${type} 业务路由必须提供 operations`);
}
// 复用通用工具的组件：指向真实通用工具而非旧死工具名。
for (const type of ["enhancedDiary", "latest-docs", "visualChart"]) {
  const capability = getHomepageAgentWidgetDescriptor(type)?.businessCapability;
  assert.equal(capability?.reusedExistingTool, true, `${type} 必须标记复用通用工具`);
  assert.equal(typeof capability?.toolName, "string", `${type} 必须提供真实通用工具名`);
  assert.equal((capability?.operations?.length ?? 0) > 0, true, `${type} 必须提供真实操作路径`);
}
// 没有独立业务数据的组件仍通过 instance 子工具读写真实组件实例。
for (const type of ["weather", "timedate", "almanac", "notebrain"]) {
  const capability = getHomepageAgentWidgetDescriptor(type)?.businessCapability;
  assert.equal(capability?.businessTool, null, `${type} instance 路由不得返回不存在的旧业务工具名`);
  assert.equal(typeof capability?.subtool, "string", `${type} 必须提供 instance 子工具`);
  assert.equal((capability?.operations?.length ?? 0) > 0, true, `${type} instance 子工具必须提供 operations`);
  assert.equal(typeof capability?.reason, "string", `${type} display-only 必须说明原因`);
}

// ── Robot 旧 key 迁移：旧显式值优先于新默认值，不保留旧死 key ──
const migratedRobotPolicy = normalizeV2Settings({
  version: 2,
  robotToolPolicy: {
    tools: {
      homepage_quick_note: { remoteAllowed: false, writeAction: "deny" },
      homepage_music: { remoteAllowed: true, writeAction: "ask" },
      siyuan_kb: { remoteAllowed: true, writeAction: "ask" },
    },
    defaultWriteAction: "ask",
    readOnlyDefaultAllowed: true,
  },
}).robotToolPolicy;
assert.equal(migratedRobotPolicy.tools["homepage_components.quick_note"]?.remoteAllowed, false, "旧显式 false 必须迁移并覆盖新默认 true");
assert.equal(migratedRobotPolicy.tools["homepage_components.quick_note"]?.writeAction, "deny", "旧 writeAction 必须迁移");
assert.equal(migratedRobotPolicy.tools["homepage_components.music"] === undefined, true, "music 不在 Robot Kernel-safe 名单，旧显式值不迁移");
assert.equal(migratedRobotPolicy.tools["homepage_quick_note"] === undefined, true, "迁移后不得保留旧死 key");
assert.equal(migratedRobotPolicy.tools["homepage_music"] === undefined, true);

// 本轮验收断言（行为级）：Robot 子工具门控、全新用户迁移、旧工具名清除、每组件子工具、标题图标注入、按钮 add。
await import("./verify-homepage-agent-acceptance.ts");

console.log("Agent Profile、多入口、主页能力与临时工作台协议校验通过。");
