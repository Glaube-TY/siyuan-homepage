/**
 * KB 设置服务
 * 负责读取/合并/保存 KB 设置
 */

import type { KbSettings, KbChatProviderConfig, KbChatModelConfig, WebSearchSettings, KbToolSettings, QuickPromptsSettings, KbProcessDisplayMode, NotebrainAgentWorkspaceSettings, ExternalSkillSettings, McpSettings, NotebrainPermissionAction, RuntimeToolsSettings, KbChatAppearanceSettings, KbChatAppearanceStyle, KbChatAvatarSettings } from "../../types/settings";
import {
  DEFAULT_KB_SETTINGS,
  DEFAULT_TEMPERATURE,
  DEFAULT_WEB_SEARCH_SETTINGS,
  DEFAULT_TOOL_SETTINGS,
  DEFAULT_QUICK_PROMPTS_SETTINGS,
  DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS,
  DEFAULT_EXTERNAL_SKILL_SETTINGS,
  DEFAULT_MCP_SETTINGS,
  DEFAULT_RUNTIME_TOOLS_SETTINGS,
  DEFAULT_CHAT_APPEARANCE_SETTINGS,
} from "../../constants/default-settings";
import {
  sanitizeChatProviders as sanitizeChatProvidersCore,
  resolveSelectedChatConfig as resolveSelectedChatConfigCore,
} from "./chat-provider-config";
import {
  decryptSensitiveSecretsFromStorage,
  encryptSensitiveSecretsForStorage,
  normalizeSensitiveSecretsFromRuntime,
  setKbSensitiveSecretCryptoPlugin,
  isEncryptedSecret,
  type SecretDecryptDiagnostics,
  createEmptySecretDecryptDiagnostics,
} from "./kb-sensitive-secret-crypto";
import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";
import { AGGREGATE_TOOL_NAMES, AGGREGATE_TOOL_CATALOG, findAggregateToolMeta } from "../agent-workbench/tools/aggregate/aggregate-tool-metadata";
import { HOMEPAGE_COMPONENT_SUBTOOL_PREFIXES } from "../agent-workbench/tools/homepage/homepage-agent-business-capabilities";

const SETTINGS_KEY = "kb-settings";
const MAX_AVATAR_DATA_URL_LENGTH = 1_572_864;

// ==================== 数值归一化 helpers ====================

/**
 * 通用数值 clamp
 */
function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 归一化整数型设置
 * - 空字符串 / NaN / Infinity / 负数 → 回退默认值
 * - 超出 [min, max] → clamp
 */
function normalizeIntegerSetting(
  raw: unknown,
  defaultValue: number,
  min: number,
  max: number
): number {
  const val = parseInt(String(raw), 10);
  if (!Number.isFinite(val) || val < 0) {
    return defaultValue;
  }
  return clampNumber(val, min, max);
}

function normalizeAgentMaxToolCallsPerTurn(raw: unknown): number {
  const value = normalizeIntegerSetting(
    raw,
    DEFAULT_KB_SETTINGS.agentMaxToolCallsPerTurn,
    0,
    50,
  );
  return value === 0 || value === 20 || value === 50
    ? value
    : DEFAULT_KB_SETTINGS.agentMaxToolCallsPerTurn;
}

/**
 * 归一化浮点型设置（支持 0 值，允许用户明确关闭某项加权）
 * - 空字符串 / NaN / Infinity / 负数 → 回退默认值
 * - 超出 [min, max] → clamp
 */
function normalizeFloatSetting(
  raw: unknown,
  defaultValue: number,
  min: number,
  max: number
): number {
  const val = parseFloat(String(raw));
  if (!Number.isFinite(val) || val < 0) {
    return defaultValue;
  }
  return clampNumber(val, min, max);
}

function normalizeAssistantActionAlignment(raw: unknown): KbSettings["assistantActionAlignment"] {
  if (raw === "center" || raw === "right" || raw === "left") {
    return raw;
  }
  return DEFAULT_KB_SETTINGS.assistantActionAlignment;
}

function normalizeProcessDisplayMode(raw: unknown): KbProcessDisplayMode {
  if (raw === "collapsed" || raw === "expanded" || raw === "auto") {
    return raw;
  }
  return "collapsed";
}

function normalizeChatAppearanceStyle(raw: unknown): KbChatAppearanceStyle {
  if (raw === "default" || raw === "minimal" || raw === "prose" || raw === "card") {
    return raw;
  }
  return DEFAULT_CHAT_APPEARANCE_SETTINGS.style;
}

function normalizeChatAvatarSettings(raw: unknown): KbChatAvatarSettings {
  if (!raw || typeof raw !== "object") {
    return { kind: "default" };
  }
  const s = raw as Record<string, unknown>;
  const kind = s.kind === "emoji" || s.kind === "image" || s.kind === "default" ? s.kind : "default";

  if (kind === "emoji") {
    const emoji = typeof s.emoji === "string" ? s.emoji.trim() : "";
    return emoji ? { kind, emoji } : { kind: "default" };
  }

  if (kind === "image") {
    const imageDataUrl = typeof s.imageDataUrl === "string" ? s.imageDataUrl : "";
    if (imageDataUrl.startsWith("data:image/") && imageDataUrl.length <= MAX_AVATAR_DATA_URL_LENGTH) {
      return { kind, imageDataUrl };
    }
    return { kind: "default" };
  }

  return { kind: "default" };
}

function normalizeChatAppearanceSettings(raw: unknown): KbChatAppearanceSettings {
  if (!raw || typeof raw !== "object") {
    return {
      style: DEFAULT_CHAT_APPEARANCE_SETTINGS.style,
      userAvatar: { ...DEFAULT_CHAT_APPEARANCE_SETTINGS.userAvatar },
      assistantAvatar: { ...DEFAULT_CHAT_APPEARANCE_SETTINGS.assistantAvatar },
    };
  }
  const s = raw as Record<string, unknown>;
  return {
    style: normalizeChatAppearanceStyle(s.style),
    userAvatar: normalizeChatAvatarSettings(s.userAvatar),
    assistantAvatar: normalizeChatAvatarSettings(s.assistantAvatar),
  };
}

function normalizePermissionAction(raw: unknown, fallback: NotebrainPermissionAction): NotebrainPermissionAction {
  return raw === "allow" || raw === "ask" || raw === "deny" ? raw : fallback;
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(
    raw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )];
}

function toAggregateGlobalToolName(rawName: unknown): KbToolSettings["disabledGlobalToolNames"][number] | null {
  if (typeof rawName !== "string") return null;
  const name = rawName.trim();
  if ((AGGREGATE_TOOL_NAMES as readonly string[]).includes(name)) {
    return name as KbToolSettings["disabledGlobalToolNames"][number];
  }
  return null;
}

/**
 * 系统必需、固定启用、用户不可关闭的内置工具。
 * 这些工具不会进入 disabledGlobalToolNames；设置页应展示为只读固定卡片。
 */
const SYSTEM_REQUIRED_TOOL_NAMES = new Set<string>(["agent_tool_help", "memory_manage"]);

/** 无 action 的直接写工具：仍使用 disabledWriteToolConfirmationNames（工具级确认开关）。 */
const DIRECT_WRITE_TOOL_NAMES = new Set<string>(
  AGGREGATE_TOOL_CATALOG
    .filter((tool) => tool.actions.length === 0 && !tool.readOnly)
    .map((tool) => tool.name),
);

/** 返回某聚合工具下所有 requiresConfirmation=true 的 action 名称（仅写入 action）。 */
function writeActionsOf(toolName: string): string[] {
  const meta = findAggregateToolMeta(toolName);
  if (!meta) return [];
  return meta.actions.filter((a) => !a.readOnly).map((a) => a.name);
}

/**
 * 归一化 action 级确认覆盖配置。
 * - 仅保留合法 (toolName, actionName) 组合
 * - 仅对聚合工具且有 actions 的工具生效；无 action 工具直接忽略
 * - 仅保留 requiresConfirmation=true 的 action（只读 action 永远不弹确认，无需覆盖）
 */
function normalizeToolActionConfirmOverrides(
  raw: unknown,
): NonNullable<KbToolSettings["toolActionConfirmOverrides"]> {
  const result: Record<string, Record<string, boolean>> = {};
  const aggregateToolNames: Set<string> = new Set(
    AGGREGATE_TOOL_CATALOG.filter((t) => t.actions.length > 0).map((t) => t.name),
  );

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const entries = raw as Record<string, unknown>;
    for (const [toolName, actionMap] of Object.entries(entries)) {
      if (!aggregateToolNames.has(toolName)) continue;
      const validActions = new Set(writeActionsOf(toolName));
      if (!actionMap || typeof actionMap !== "object" || Array.isArray(actionMap)) continue;
      const actionEntries = actionMap as Record<string, unknown>;
      for (const [actionName, flag] of Object.entries(actionEntries)) {
        if (!validActions.has(actionName)) continue;
        if (typeof flag !== "boolean") continue;
        if (!result[toolName]) result[toolName] = {};
        result[toolName][actionName] = flag;
      }
    }
  }

  return result;
}

/**
 * 旧 homepage 组件工具名 → homepage_components 子工具前缀。
 * 用于把旧 disabledGlobalToolNames / toolActionConfirmOverrides 迁移到新结构。
 */
const LEGACY_COMPONENT_TOOL_TO_PREFIX: Record<string, string> = {
  homepage_quick_note: "quick_note",
  homepage_focus: "focus",
  homepage_accounting: "accounting",
  homepage_fixed_assets: "fixed_assets",
  homepage_anniversary: "anniversary",
  homepage_favorites: "favorites",
  homepage_review: "review",
  homepage_music: "music",
};

const LEGACY_COMPONENT_TOOL_NAMES = new Set(Object.keys(LEGACY_COMPONENT_TOOL_TO_PREFIX));

/** disabledSubtools 只接受真实前缀白名单。 */
const VALID_COMPONENT_SUBTOOL_PREFIXES = new Set(HOMEPAGE_COMPONENT_SUBTOOL_PREFIXES);

/** 旧 homepage_manage 控制的组件目录/实例能力对应的子工具前缀。 */
const LEGACY_MANAGE_COMPONENT_PREFIXES = HOMEPAGE_COMPONENT_SUBTOOL_PREFIXES.filter((prefix) => prefix === "catalog" || prefix === "instance");

/**
 * 归一化全局工具设置
 * - 只保留合法聚合工具名
 * - 系统必需工具永远不进入 disabledGlobalToolNames
 * - schemaVersion 缺失（旧存储）时执行一次迁移；迁移后写入 schemaVersion=1，保证幂等
 * - 去重
 * - 设置缺失时回退默认值
 */
function normalizeToolSettings(raw: unknown): KbToolSettings {
  const hasRawToolSettings = !!raw && typeof raw === "object";
  const s = hasRawToolSettings ? raw as Record<string, unknown> : {};
  // 只有“确实存在旧 toolSettings 且缺少 schemaVersion”时才执行旧数据迁移；
  // 全新用户（raw toolSettings 缺失）直接使用新版默认状态，不产生 disabledSubtools。
  const isLegacyFormat = hasRawToolSettings && s.schemaVersion !== 1;
  const rawNames = s.disabledGlobalToolNames;
  let names: KbToolSettings["disabledGlobalToolNames"] = hasRawToolSettings
    ? []
    : [...DEFAULT_TOOL_SETTINGS.disabledGlobalToolNames];
  if (Array.isArray(rawNames)) {
    names = rawNames
      .map(toAggregateGlobalToolName)
      .filter((n): n is KbToolSettings["disabledGlobalToolNames"][number] => !!n);
  }
  names = [...new Set(names)];
  // 系统必需工具永远固定启用：从 disabledGlobalToolNames 中移除
  names = names.filter((n) => !SYSTEM_REQUIRED_TOOL_NAMES.has(n));

  // 子工具禁用：只保留真实前缀白名单。
  const rawSubtools = s.disabledSubtools;
  const subtoolPrefixes = new Set<string>();
  if (rawSubtools && typeof rawSubtools === "object" && !Array.isArray(rawSubtools)) {
    const rawList = (rawSubtools as Record<string, unknown>)["homepage_components"];
    if (Array.isArray(rawList)) {
      for (const item of rawList) {
        if (typeof item === "string" && VALID_COMPONENT_SUBTOOL_PREFIXES.has(item.trim())) {
          subtoolPrefixes.add(item.trim());
        }
      }
    }
  }

  if (isLegacyFormat) {
    // 旧 homepage_manage 控制组件目录与实例能力：被禁用时 catalog/instance 一并禁用。
    if (names.includes("homepage_manage")) {
      LEGACY_MANAGE_COMPONENT_PREFIXES.forEach((prefix) => subtoolPrefixes.add(prefix));
      names.push("homepage_components");
    }
    // 旧组件业务工具名 → 子工具前缀。
    if (Array.isArray(rawNames)) {
      for (const rawName of rawNames) {
        if (typeof rawName === "string" && LEGACY_COMPONENT_TOOL_NAMES.has(rawName.trim())) {
          subtoolPrefixes.add(LEGACY_COMPONENT_TOOL_TO_PREFIX[rawName.trim()]);
        }
      }
    }
    // 旧 homepage_workbench 禁用状态迁移为 temporary_workbench。
    if (Array.isArray(rawNames) && rawNames.some((rawName) => typeof rawName === "string" && rawName.trim() === "homepage_workbench")) {
      names.push("temporary_workbench");
    }
    // 全部子工具均禁用时，父工具也应禁用。
    const allSubtools = [...LEGACY_MANAGE_COMPONENT_PREFIXES, ...Object.values(LEGACY_COMPONENT_TOOL_TO_PREFIX)];
    if (allSubtools.every((prefix) => subtoolPrefixes.has(prefix))) {
      names.push("homepage_components");
    }
  }
  names = [...new Set(names)];

  // 无 action 的直接写工具仍使用工具级确认开关。
  const rawWriteConfirmation = s.disabledWriteToolConfirmationNames;
  let writeConfirmationNames: string[] = [];
  if (Array.isArray(rawWriteConfirmation)) {
    writeConfirmationNames = rawWriteConfirmation
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
  }
  writeConfirmationNames = [...new Set(writeConfirmationNames)];

  // 聚合工具仅接受 action 级确认覆盖；旧组件工具名的覆盖迁移到 homepage_components 的 dotted action。
  const rawOverrides = s.toolActionConfirmOverrides;
  const overrides = normalizeToolActionConfirmOverrides(rawOverrides);
  const validHomepageComponentWriteActions = new Set(writeActionsOf("homepage_components"));
  if (rawOverrides && typeof rawOverrides === "object" && !Array.isArray(rawOverrides)) {
    const legacyMap = rawOverrides as Record<string, unknown>;
    for (const [toolName, actionMap] of Object.entries(legacyMap)) {
      if (!actionMap || typeof actionMap !== "object" || Array.isArray(actionMap)) continue;
      const actionEntries = actionMap as Record<string, unknown>;
      // 旧组件业务工具确认 → homepage_components.<prefix>.<action>
      const prefix = LEGACY_COMPONENT_TOOL_TO_PREFIX[toolName];
      if (!prefix) continue;
      for (const [actionName, flag] of Object.entries(actionEntries)) {
        if (typeof flag !== "boolean") continue;
        if (!overrides.homepage_components) overrides.homepage_components = {};
        const dotted = `${prefix}.${actionName}`;
        if (!validHomepageComponentWriteActions.has(dotted)) continue;
        if (dotted in overrides.homepage_components) continue;
        overrides.homepage_components[dotted] = flag;
      }
    }
  }

  // writeConfirmationNames 仅保留无 action 的直接工具。
  // 聚合工具的可信状态由 action 级配置单独管理。
  const directWriteConfirmationNames = writeConfirmationNames.filter((n) => DIRECT_WRITE_TOOL_NAMES.has(n));

  const result: KbToolSettings = {
    schemaVersion: 1,
    disabledGlobalToolNames: names,
  };
  if (subtoolPrefixes.size > 0) {
    result.disabledSubtools = { homepage_components: [...subtoolPrefixes] };
  }
  if (directWriteConfirmationNames.length > 0) {
    result.disabledWriteToolConfirmationNames = directWriteConfirmationNames;
  }
  if (Object.keys(overrides).length > 0) {
    result.toolActionConfirmOverrides = overrides;
  }
  return result;
}

/**
 * 归一化快捷提示语设置
 * - 非对象 → 回退默认值
 * - enabled 只接受 boolean
 * - docId 只接受 string，trim
 */
function normalizeQuickPromptsSettings(raw: unknown): QuickPromptsSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_QUICK_PROMPTS_SETTINGS };
  }
  const s = raw as Record<string, unknown>;
  const enabled = typeof s.enabled === "boolean" ? s.enabled : DEFAULT_QUICK_PROMPTS_SETTINGS.enabled;
  const docId = typeof s.docId === "string" ? s.docId.trim() : DEFAULT_QUICK_PROMPTS_SETTINGS.docId;
  const rawUpdatedAt = s.updatedAt;
  const updatedAt = typeof rawUpdatedAt === "number" && Number.isFinite(rawUpdatedAt) ? rawUpdatedAt : undefined;
  return {
    enabled,
    docId,
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

function normalizeNotebrainWorkspaceSettings(raw: unknown): NotebrainAgentWorkspaceSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS };
  }
  const s = raw as Record<string, unknown>;
  return {
    enabled: typeof s.enabled === "boolean"
      ? s.enabled
      : DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS.enabled,
    commandExecutionEnabled: typeof s.commandExecutionEnabled === "boolean"
      ? s.commandExecutionEnabled
      : DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS.commandExecutionEnabled,
    defaultCommandTimeoutMs: normalizeIntegerSetting(
      s.defaultCommandTimeoutMs,
      DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS.defaultCommandTimeoutMs,
      5000,
      600000,
    ),
    maxCommandOutputChars: normalizeIntegerSetting(
      s.maxCommandOutputChars,
      DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS.maxCommandOutputChars,
      2000,
      100000,
    ),
    commandDefaultAction: normalizePermissionAction(
      s.commandDefaultAction,
      DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS.commandDefaultAction,
    ),
    commandAllowRules: normalizeStringArray(s.commandAllowRules),
    commandAskRules: normalizeStringArray(s.commandAskRules).length > 0
      ? normalizeStringArray(s.commandAskRules)
      : [...DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS.commandAskRules],
    commandDenyRules: normalizeStringArray(s.commandDenyRules),
    fileWriteToolsEnabled: typeof s.fileWriteToolsEnabled === "boolean"
      ? s.fileWriteToolsEnabled
      : DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS.fileWriteToolsEnabled,
    commandStrictWorkspaceMode: typeof s.commandStrictWorkspaceMode === "boolean"
      ? s.commandStrictWorkspaceMode
      : DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS.commandStrictWorkspaceMode,
    allowNetworkAccess: typeof s.allowNetworkAccess === "boolean"
      ? s.allowNetworkAccess
      : DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS.allowNetworkAccess,
    allowSystemInfoCommands: typeof s.allowSystemInfoCommands === "boolean"
      ? s.allowSystemInfoCommands
      : DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS.allowSystemInfoCommands,
    allowAbsolutePaths: typeof s.allowAbsolutePaths === "boolean"
      ? s.allowAbsolutePaths
      : DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS.allowAbsolutePaths,
  };
}

function normalizeExternalSkillSettings(raw: unknown): ExternalSkillSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_EXTERNAL_SKILL_SETTINGS };
  }
  const s = raw as Record<string, unknown>;
  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : DEFAULT_EXTERNAL_SKILL_SETTINGS.enabled,
    maxSkillReadChars: normalizeIntegerSetting(
      s.maxSkillReadChars,
      DEFAULT_EXTERNAL_SKILL_SETTINGS.maxSkillReadChars,
      2000,
      100000,
    ),
    autoInstallEnabled: typeof s.autoInstallEnabled === "boolean"
      ? s.autoInstallEnabled
      : DEFAULT_EXTERNAL_SKILL_SETTINGS.autoInstallEnabled,
    disabledSkillIds: normalizeStringArray(s.disabledSkillIds),
  };
}

function normalizeMcpSettings(raw: unknown): McpSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_MCP_SETTINGS };
  }
  const s = raw as Record<string, unknown>;

  let maxVisible = DEFAULT_MCP_SETTINGS.maxVisibleToolsPerTurn;
  const rawVal = s.maxVisibleToolsPerTurn;
  if (rawVal !== undefined && rawVal !== null) {
    const parsed = parseInt(String(rawVal), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      maxVisible = Math.min(80, Math.max(1, Math.round(parsed)));
    }
  }

  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : DEFAULT_MCP_SETTINGS.enabled,
    maxVisibleToolsPerTurn: maxVisible,
    disabledServerIds: normalizeStringArray(s.disabledServerIds),
    disabledToolNames: normalizeStringArray(s.disabledToolNames),
    trustedToolNames: normalizeStringArray(s.trustedToolNames),
  };
}

function normalizeRuntimeToolsSettings(raw: unknown): RuntimeToolsSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_RUNTIME_TOOLS_SETTINGS };
  }
  const s = raw as Record<string, unknown>;
  const defaults = DEFAULT_RUNTIME_TOOLS_SETTINGS;

  const enabled = typeof s.enabled === "boolean" ? s.enabled : defaults.enabled;
  const exposeToAgent = typeof s.exposeToAgent === "boolean" ? s.exposeToAgent : defaults.exposeToAgent;
  const extraPathDirs = normalizeStringArray(s.extraPathDirs);

  // commandOverrides: must be Record<string, string>
  let commandOverrides: Record<string, string> = {};
  if (s.commandOverrides && typeof s.commandOverrides === "object" && !Array.isArray(s.commandOverrides)) {
    for (const [key, value] of Object.entries(s.commandOverrides as Record<string, unknown>)) {
      if (typeof key === "string" && typeof value === "string" && key.trim() && value.trim()) {
        commandOverrides[key.trim()] = value.trim();
      }
    }
  }

  // detectedTools: pass through as-is (cached detection data)
  const detectedTools = s.detectedTools && typeof s.detectedTools === "object"
    ? s.detectedTools as Record<string, any>
    : undefined;

  return { enabled, exposeToAgent, extraPathDirs, commandOverrides, detectedTools };
}

/**
 * 归一化网页搜索设置
 * - 非对象 → 回退默认值
 * - 数值 clamp 到有效范围
 * - 空字符串的可选字段 → undefined
 * - 无效 provider → "anysearch"
 * - 无效 zone → "auto"
 * - 空 language → ""
 */
function normalizeWebSearchSettings(raw: unknown): WebSearchSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_WEB_SEARCH_SETTINGS };
  }

  const s = raw as Record<string, unknown>;

  // enabled
  const enabled = typeof s.enabled === "boolean" ? s.enabled : DEFAULT_WEB_SEARCH_SETTINGS.enabled;
  const nativeSearchEnabled = typeof s.nativeSearchEnabled === "boolean"
    ? s.nativeSearchEnabled
    : DEFAULT_WEB_SEARCH_SETTINGS.nativeSearchEnabled;

  // provider
  const providerRaw = s.provider;
  const provider =
    providerRaw === "anysearch" || providerRaw === "custom_json" || providerRaw === "tavily"
      ? providerRaw
      : DEFAULT_WEB_SEARCH_SETTINGS.provider;

  // optional string fields — empty string → undefined
  const optionalString = (key: string): string | undefined => {
    const v = s[key];
    if (typeof v === "string" && v.length > 0) return v;
    return undefined;
  };

  // maxResults (1-10, integer)
  const maxResults =
    typeof s.maxResults === "number" && Number.isFinite(s.maxResults)
      ? clampNumber(Math.round(s.maxResults), 1, 10)
      : DEFAULT_WEB_SEARCH_SETTINGS.maxResults;

  // readPageMaxChars (2000-30000, integer)
  const readPageMaxChars =
    typeof s.readPageMaxChars === "number" && Number.isFinite(s.readPageMaxChars)
      ? clampNumber(Math.round(s.readPageMaxChars), 2000, 30000)
      : DEFAULT_WEB_SEARCH_SETTINGS.readPageMaxChars;

  // timeoutMs (5000-60000, integer)
  const timeoutMs =
    typeof s.timeoutMs === "number" && Number.isFinite(s.timeoutMs)
      ? clampNumber(Math.round(s.timeoutMs), 5000, 60000)
      : DEFAULT_WEB_SEARCH_SETTINGS.timeoutMs;

  // anySearchZone
  const zoneRaw = s.anySearchZone;
  const anySearchZone: WebSearchSettings["anySearchZone"] =
    zoneRaw === "auto" || zoneRaw === "cn" || zoneRaw === "intl"
      ? zoneRaw
      : DEFAULT_WEB_SEARCH_SETTINGS.anySearchZone;

  // anySearchLanguage
  const langRaw = s.anySearchLanguage;
  const anySearchLanguage =
    typeof langRaw === "string"
      ? langRaw
      : DEFAULT_WEB_SEARCH_SETTINGS.anySearchLanguage;

  return {
    enabled,
    nativeSearchEnabled,
    provider,
    searchEndpoint: optionalString("searchEndpoint"),
    readProxyEndpoint: optionalString("readProxyEndpoint"),
    apiKey: optionalString("apiKey"),
    maxResults,
    readPageMaxChars,
    timeoutMs,
    anySearchZone,
    anySearchLanguage,
  };
}

// ==================== KB Settings Changed Event ====================

/**
 * KB 设置变更事件名
 * 用于通知其他模块（如主面板）设置已更新
 */
export const KB_SETTINGS_CHANGED_EVENT = "kb-settings-changed";

// 插件实例引用，由外部注入
let pluginInstance: any = null;
let kbSettingsSaveQueue: Promise<void> = Promise.resolve();

async function awaitPendingKbSettingsSaves(): Promise<void> {
  await kbSettingsSaveQueue.catch(() => undefined);
}

// ── Internal explicit-clear state (never persisted) ──
// Tracks user's explicit intent to clear secrets, so saveKbSettings can
// distinguish "decrypt-failure → empty" from "user-cleared → empty".
const explicitClearedProviderIds = new Set<string>();
const explicitClearedLocations = new Set<"chatProviderApiKey" | "webSearchApiKey">();

/** Mark a chat provider's apiKey as explicitly cleared by the user. */
export function markProviderApiKeyCleared(providerId: string): void {
  explicitClearedProviderIds.add(providerId);
}

/** Mark webSearch apiKey as explicitly cleared by the user. */
export function markWebSearchApiKeyCleared(): void {
  explicitClearedLocations.add("webSearchApiKey");
}

/** Clear all explicit-clear markers for initialization or controlled test cleanup. */
export function clearExplicitClearedSecrets(): void {
  explicitClearedProviderIds.clear();
  explicitClearedLocations.clear();
}

/**
 * 注入插件实例
 * 应在插件初始化时调用
 */
export function setKbSettingsPlugin(plugin: any) {
  pluginInstance = plugin;
  setKbSensitiveSecretCryptoPlugin(plugin);
}

/**
 * 获取插件实例
 */
function getPlugin(): any {
  if (!pluginInstance) {
    console.warn("[KB Settings] Plugin instance not set");
  }
  return pluginInstance;
}

/**
 * 获取插件实例（供 UI 组件使用）
 */
export function getKbPlugin(): any {
  return pluginInstance;
}

function normalizeKbSettingsStorageRoot(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("KB settings storage format invalid");
  }
  return value as Record<string, unknown>;
}

async function loadKbSettingsInternal(): Promise<KbSettings> {
  const plugin = getPlugin();
  if (!plugin) {
    throw new Error("Plugin instance not set");
  }

  const savedSettings = await plugin.loadData(SETTINGS_KEY);
  const rawSettings = normalizeKbSettingsStorageRoot(savedSettings);
  const { settings: runtimeSettings, diagnostics } = await decryptSensitiveSecretsFromStorage(
    rawSettings,
  );
  // Store diagnostics for __kbAgentDebug access without leaking key material
  setLastSecretDiagnostics(diagnostics);
  if (diagnostics.hasDecryptFailure) {
    pushAgentDebugEvent("SECRET_DECRYPT_FAILURE", {
      failedChatProviderIds: diagnostics.failedChatProviderIds,
      failedLocations: diagnostics.failedLocations,
      encryptedSecretCount: diagnostics.encryptedSecretCount,
      secretStoragePresent: diagnostics.secretStoragePresent,
      secretStorageValidLength: diagnostics.secretStorageValidLength,
    }, "warn");
  }
  return mergeKbSettings(runtimeSettings as Partial<KbSettings>);
}

/**
 * 获取当前 KB 设置（已合并默认值）
 * 读取失败必须抛错，避免把未知状态误当成默认设置。
 */
export async function getKbSettings(): Promise<KbSettings> {
  await awaitPendingKbSettingsSaves();
  try {
    return await loadKbSettingsInternal();
  } catch (error) {
    setLastSecretDiagnostics({ ...createEmptySecretDecryptDiagnostics(), hasDecryptFailure: true });
    throw error;
  }
}

/**
 * 读取可编辑设置。读取失败必须抛错，且先等待已入队的保存完成。
 */
export async function getKbSettingsForEdit(): Promise<KbSettings> {
  await awaitPendingKbSettingsSaves();
  return loadKbSettingsInternal();
}

/**
 * 保存 KB 设置
 * 返回最终 mergedSettings，方便调用方同步更新 UI
 */
export function saveKbSettings(settings: Partial<KbSettings>): Promise<KbSettings> {
  const snapshot = structuredClone(settings);
  const run = kbSettingsSaveQueue
    .catch(() => undefined)
    .then(() => saveKbSettingsUnlocked(snapshot));
  kbSettingsSaveQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function saveKbSettingsUnlocked(settings: Partial<KbSettings>): Promise<KbSettings> {
  const plugin = getPlugin();
  if (!plugin) {
    throw new Error("Plugin instance not set");
  }

  const ownsChatProviderSettings = Object.prototype.hasOwnProperty.call(settings, "chatProviders");
  const ownsWebSearchSettings = Object.prototype.hasOwnProperty.call(settings, "webSearch");
  const clearedProviderIds = new Set<string>();
  if (ownsChatProviderSettings) {
    for (const providerId of explicitClearedProviderIds) {
      clearedProviderIds.add(providerId);
      explicitClearedProviderIds.delete(providerId);
    }
  }
  const webSearchCleared = ownsWebSearchSettings
    && explicitClearedLocations.delete("webSearchApiKey");
  let saveCommitted = false;

  try {

  // Read raw existing settings BEFORE decryption — used to protect enc:v1
  // ciphertext from being accidentally overwritten when decryption fails.
  const existingRaw = await plugin.loadData(SETTINGS_KEY);
    const existingRawObj = normalizeKbSettingsStorageRoot(existingRaw);

    // Build map of raw enc:v1 apiKey values per provider id
    const rawEncryptedApiKeys = new Map<string, string>();
    const rawProviders = existingRawObj.chatProviders;
    if (Array.isArray(rawProviders)) {
      for (const p of rawProviders) {
        if (!p || typeof p !== "object") continue;
        const provider = p as Record<string, unknown>;
        const pid = typeof provider.id === "string" ? provider.id : "";
        const apiKey = typeof provider.apiKey === "string" ? provider.apiKey : "";
        if (pid && isEncryptedSecret(apiKey)) {
          rawEncryptedApiKeys.set(pid, apiKey);
        }
      }
    }
    // Also capture webSearch apiKey
    const rawWebSearch = existingRawObj.webSearch;
    let rawWebSearchEncKey = "";
    if (rawWebSearch && typeof rawWebSearch === "object") {
      const wsKey = (rawWebSearch as Record<string, unknown>).apiKey;
      if (typeof wsKey === "string" && isEncryptedSecret(wsKey)) {
        rawWebSearchEncKey = wsKey;
      }
    }

    // Decrypt existing settings (may produce empty keys on failure)
    const { settings: existingRuntimeSettings, diagnostics } = await decryptSensitiveSecretsFromStorage(existingRawObj);
    setLastSecretDiagnostics(diagnostics);

    const inputRuntimeSettings = await normalizeSensitiveSecretsFromRuntime(
      settings as Record<string, unknown>,
    );
    const merged = mergeKbSettings({
      ...(existingRuntimeSettings as Partial<KbSettings>),
      ...(inputRuntimeSettings as Partial<KbSettings>),
    });

    // ── Ciphertext preservation ──
    // If a provider's apiKey was enc:v1 in raw storage, but became empty after
    // merge, we need to distinguish:
    //   a) Decrypt failure → apiKey is empty in runtime → KEEP old enc:v1 ciphertext
    //   b) User explicitly cleared the key → apiKey is empty intentionally → ALLOW overwrite
    //
    // Detection: if diagnostics.failedChatProviderIds includes this provider, it's
    // a decrypt failure. But if the user explicitly marked this provider for clearing,
    // we allow the overwrite regardless of decrypt failure.
    let didPreserveCipher = false;
    const decryptFailedIds = new Set(diagnostics.failedChatProviderIds ?? []);
    if (Array.isArray(merged.chatProviders)) {
      merged.chatProviders = merged.chatProviders.map((p) => {
        const existingEnc = rawEncryptedApiKeys.get(p.id);
        // Only preserve if: old key was enc:v1, merged key is empty, decrypt failed,
        // AND user did NOT explicitly clear this provider.
        if (existingEnc && !p.apiKey && decryptFailedIds.has(p.id) && !clearedProviderIds.has(p.id)) {
          didPreserveCipher = true;
          return { ...p, apiKey: existingEnc };
        }
        return p;
      });
    }
    // webSearch apiKey preservation
    // Only preserve the old enc:v1 ciphertext when the decryption actually
    // failed for webSearch (runtime value became empty due to decrypt failure).
    // If the user explicitly cleared the key, allow saving empty.
    const webSearchDecryptFailed = diagnostics.failedLocations.includes("webSearchApiKey");
    if (merged.webSearch && !(merged.webSearch.apiKey) && rawWebSearchEncKey && webSearchDecryptFailed && !webSearchCleared) {
      didPreserveCipher = true;
      merged.webSearch = { ...merged.webSearch, apiKey: rawWebSearchEncKey };
    }

    const encryptedSettings = await encryptSensitiveSecretsForStorage(
      merged as unknown as Record<string, unknown>,
    );
    await plugin.saveData(SETTINGS_KEY, encryptedSettings);
    saveCommitted = true;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(KB_SETTINGS_CHANGED_EVENT, { detail: merged })
      );
    }

    // Log cipher preservation event (safe, no key material)
    if (didPreserveCipher) {
      pushAgentDebugEvent("SECRET_CIPHER_PRESERVED", {
        preservedProviderCount: rawEncryptedApiKeys.size,
        hadWebSearchEncKey: !!rawWebSearchEncKey,
        diagnostics: {
          hasDecryptFailure: diagnostics.hasDecryptFailure,
          encryptedSecretCount: diagnostics.encryptedSecretCount,
        },
      }, "info");
    }

    // Log explicit secret clear events (safe, no key material)
    if (clearedProviderIds.size > 0) {
      for (const pid of clearedProviderIds) {
        pushAgentDebugEvent("SECRET_CLEAR_REQUESTED", {
          providerId: pid,
          location: "chatProviderApiKey",
          action: "secret_cleared",
        }, "info");
      }
    }
    if (webSearchCleared) {
      pushAgentDebugEvent("SECRET_CLEAR_REQUESTED", {
        location: "webSearchApiKey",
        action: "secret_cleared",
      }, "info");
    }

    return merged;
  } catch (error) {
    if (!saveCommitted) {
      for (const providerId of clearedProviderIds) {
        explicitClearedProviderIds.add(providerId);
      }
      if (webSearchCleared) {
        explicitClearedLocations.add("webSearchApiKey");
      }
    }
    throw error;
  }
}

/**
 * 归一化数值型设置，避免字符串型配置漂移
 */
function normalizeNumericSettings(settings: Partial<KbSettings>): Partial<KbSettings> {
  const normalized = { ...settings };

  if (normalized.firstPassMaxHits !== undefined) {
    normalized.firstPassMaxHits = normalizeIntegerSetting(
      normalized.firstPassMaxHits,
      DEFAULT_KB_SETTINGS.firstPassMaxHits,
      1,
      100
    );
  }

  if (normalized.docTitleMatchWeight !== undefined) {
    normalized.docTitleMatchWeight = normalizeFloatSetting(
      normalized.docTitleMatchWeight,
      DEFAULT_KB_SETTINGS.docTitleMatchWeight,
      0,
      50
    );
  }

  if (normalized.headingMatchWeight !== undefined) {
    normalized.headingMatchWeight = normalizeFloatSetting(
      normalized.headingMatchWeight,
      DEFAULT_KB_SETTINGS.headingMatchWeight,
      0,
      50
    );
  }

  if (normalized.textMatchWeight !== undefined) {
    normalized.textMatchWeight = normalizeFloatSetting(
      normalized.textMatchWeight,
      DEFAULT_KB_SETTINGS.textMatchWeight,
      0,
      50
    );
  }

  if (normalized.previewMatchWeight !== undefined) {
    normalized.previewMatchWeight = normalizeFloatSetting(
      normalized.previewMatchWeight,
      DEFAULT_KB_SETTINGS.previewMatchWeight,
      0,
      50
    );
  }

  if (normalized.agentReadMaxCharsPerDoc !== undefined) {
    normalized.agentReadMaxCharsPerDoc = normalizeIntegerSetting(
      normalized.agentReadMaxCharsPerDoc,
      DEFAULT_KB_SETTINGS.agentReadMaxCharsPerDoc,
      2000,
      100000
    );
  }

  // 归一化 webSearch 中的数值字段（处理字符串型配置漂移）
  // normalizeWebSearchSettings 会做最终 clamp，这里先做 parseInt 转换
  const rawWebSearch = (normalized as { webSearch?: unknown }).webSearch;
  if (rawWebSearch && typeof rawWebSearch === "object") {
    const ws = { ...rawWebSearch } as Record<string, unknown>;

    if (ws.maxResults !== undefined) {
      ws.maxResults = normalizeIntegerSetting(
        ws.maxResults,
        DEFAULT_WEB_SEARCH_SETTINGS.maxResults,
        1,
        10
      );
    }

    if (ws.readPageMaxChars !== undefined) {
      ws.readPageMaxChars = normalizeIntegerSetting(
        ws.readPageMaxChars,
        DEFAULT_WEB_SEARCH_SETTINGS.readPageMaxChars,
        2000,
        30000
      );
    }

    if (ws.timeoutMs !== undefined) {
      ws.timeoutMs = normalizeIntegerSetting(
        ws.timeoutMs,
        DEFAULT_WEB_SEARCH_SETTINGS.timeoutMs,
        5000,
        60000
      );
    }

    (normalized as { webSearch?: unknown }).webSearch = ws;
  }

  // 归一化 chatProviders 中模型的 temperature 和 maxTokens
  // 注意：这里只负责数值归一化，不要补 id/name/type/baseUrl，交给 sanitizeChatProviders 统一处理
  // 使用 unknown 中间态避免 TypeScript 类型冲突
  const rawProviders = (normalized as { chatProviders?: unknown }).chatProviders;
  if (Array.isArray(rawProviders)) {
    (normalized as { chatProviders?: unknown }).chatProviders = rawProviders.map((provider) => {
      // provider 不是对象时返回空对象占位，sanitizeChatProviders 会兜底
      if (!provider || typeof provider !== "object") {
        return {};
      }

      // 浅拷贝 provider，避免修改原对象
      const providerCopy = { ...provider } as Record<string, unknown>;

      // models 不是数组时设为空数组，sanitizeChatProviders 会兜底
      const rawModels = providerCopy.models;
      const models = Array.isArray(rawModels) ? rawModels : [];

      providerCopy.models = models.map((model) => {
        // model 不是对象时返回空对象占位，sanitizeChatProviders 会兜底
        if (!model || typeof model !== "object") {
          return {};
        }

        // 浅拷贝 model
        const modelCopy = { ...model } as Record<string, unknown>;

        // 归一化 temperature
        if (modelCopy.temperature !== undefined) {
          const val = parseFloat(String(modelCopy.temperature));
          modelCopy.temperature = isNaN(val) ? DEFAULT_TEMPERATURE : val;
        }

        // 归一化 maxTokens
        if (modelCopy.maxTokens !== undefined) {
          const val = parseInt(String(modelCopy.maxTokens), 10);
          modelCopy.maxTokens = isNaN(val) || val <= 0 ? undefined : val;
        }

        // 归一化 contextWindowTokens
        if (modelCopy.contextWindowTokens !== undefined) {
          const val = parseInt(String(modelCopy.contextWindowTokens), 10);
          modelCopy.contextWindowTokens = isNaN(val) || val <= 0 ? undefined : val;
        }

        return modelCopy;
      });

      return providerCopy;
    });
  }

  return normalized;
}

/**
 * 清洗和补全 chatProviders（委托给统一模块）
 */
function sanitizeChatProviders(
  providers: unknown,
  fallbackTemperature: number
): KbChatProviderConfig[] {
  return sanitizeChatProvidersCore(providers, fallbackTemperature);
}

/**
 * 解析选中的聊天配置（委托给统一模块）
 */
function resolveSelectedChatConfig(
  chatProviders: KbChatProviderConfig[],
  selectedProviderId: string | undefined,
  selectedModelId: string | undefined
): {
  provider: KbChatProviderConfig | undefined;
  model: KbChatModelConfig | undefined;
  selectedProviderId: string;
  selectedModelId: string;
} {
  return resolveSelectedChatConfigCore(chatProviders, selectedProviderId, selectedModelId);
}

/**
 * 合并用户设置与默认值
 */
export function mergeKbSettings(userSettings: Partial<KbSettings>): KbSettings {
  // 第一步：归一化数值型设置
  const normalized = normalizeNumericSettings(userSettings);

  // 第二步：清洗 chatProviders
  const chatProviders = sanitizeChatProviders(
    normalized.chatProviders,
    DEFAULT_TEMPERATURE
  );

  // 第三步：解析选中的配置
  const selectedConfig = resolveSelectedChatConfig(
    chatProviders,
    normalized.selectedChatProviderId ?? userSettings.selectedChatProviderId,
    normalized.selectedChatModelId ?? userSettings.selectedChatModelId
  );
  const finalSelectedProviderId = selectedConfig.selectedProviderId;
  const finalSelectedModelId = selectedConfig.selectedModelId;

  // 第四步：显式构造 KbSettings 返回对象
  return {
    chatAppearance: normalizeChatAppearanceSettings(normalized.chatAppearance),
    assistantActionAlignment: normalizeAssistantActionAlignment(normalized.assistantActionAlignment),
    firstPassMaxHits: normalized.firstPassMaxHits ?? DEFAULT_KB_SETTINGS.firstPassMaxHits,
    docTitleMatchWeight: normalized.docTitleMatchWeight ?? DEFAULT_KB_SETTINGS.docTitleMatchWeight,
    headingMatchWeight: normalized.headingMatchWeight ?? DEFAULT_KB_SETTINGS.headingMatchWeight,
    textMatchWeight: normalized.textMatchWeight ?? DEFAULT_KB_SETTINGS.textMatchWeight,
    previewMatchWeight: normalized.previewMatchWeight ?? DEFAULT_KB_SETTINGS.previewMatchWeight,
    agentReadMaxCharsPerDoc: normalized.agentReadMaxCharsPerDoc ?? DEFAULT_KB_SETTINGS.agentReadMaxCharsPerDoc,
    agentThinkingEnabled: typeof normalized.agentThinkingEnabled === "boolean"
      ? normalized.agentThinkingEnabled
      : DEFAULT_KB_SETTINGS.agentThinkingEnabled,
    agentMaxToolCallsPerTurn: normalizeAgentMaxToolCallsPerTurn(normalized.agentMaxToolCallsPerTurn),
    chatProviders,
    selectedChatProviderId: finalSelectedProviderId,
    selectedChatModelId: finalSelectedModelId,
    webSearch: normalizeWebSearchSettings(normalized.webSearch),
    toolSettings: normalizeToolSettings(normalized.toolSettings),
    quickPrompts: normalizeQuickPromptsSettings(normalized.quickPrompts),
    notebrainWorkspace: normalizeNotebrainWorkspaceSettings(normalized.notebrainWorkspace),
    externalSkills: normalizeExternalSkillSettings(normalized.externalSkills),
    mcp: normalizeMcpSettings(normalized.mcp),
    runtimeTools: normalizeRuntimeToolsSettings(normalized.runtimeTools),
    workbenchProcessDisplayMode: normalizeProcessDisplayMode(normalized.workbenchProcessDisplayMode),
    reasoningProcessDisplayMode: normalizeProcessDisplayMode(normalized.reasoningProcessDisplayMode),
  };
}

/**
 * 获取单个设置项（带默认值回退）
 */
export function getKbSetting<K extends keyof KbSettings>(
  settings: Partial<KbSettings> | undefined,
  key: K
): KbSettings[K] {
  return (settings?.[key] as KbSettings[K]) ?? DEFAULT_KB_SETTINGS[key];
}

// ─── Secret diagnostics (non-sensitive, safe for debug output) ───

let _lastSecretDiagnostics: SecretDecryptDiagnostics = createEmptySecretDecryptDiagnostics();

export function setLastSecretDiagnostics(d: SecretDecryptDiagnostics): void {
  _lastSecretDiagnostics = d;
}

export function getLastSecretDiagnostics(): SecretDecryptDiagnostics {
  return _lastSecretDiagnostics;
}
