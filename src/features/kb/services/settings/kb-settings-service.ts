/**
 * KB 设置服务
 * 负责读取/合并/保存 KB 设置
 */

import type { KbSettings, KbChatProviderConfig, KbChatModelConfig, WebSearchSettings, KbSkillSettings, KbToolSettings, KbDangerousSkillToolName, GlobalMemorySettings, QuickPromptsSettings, KbProcessDisplayMode, NotebrainAgentWorkspaceSettings, ExternalSkillSettings, McpSettings, NotebrainPermissionAction, RuntimeToolsSettings, KbChatAppearanceSettings, KbChatAppearanceStyle, KbChatAvatarSettings } from "../../types/settings";
import {
  DEFAULT_KB_SETTINGS,
  DEFAULT_TEMPERATURE,
  DEFAULT_WEB_SEARCH_SETTINGS,
  DEFAULT_SKILL_SETTINGS,
  DEFAULT_TOOL_SETTINGS,
  DEFAULT_GLOBAL_MEMORY_SETTINGS,
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
  // 迁移旧品牌样式名到新中性样式
  if (raw === "gpt") return "minimal";
  if (raw === "deepseek" || raw === "gemini") return "prose";
  if (raw === "claude") return "card";
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

const DEFAULT_DISABLED_BUILTIN_SKILL_NAMES = [
  "builtin_doc_content_editing",
  "builtin_notebook_doc_tree",
  "builtin_tag_bookmark_outline",
  "builtin_asset_management",
  "builtin_riff_review",
];

/**
 * 归一化 Skill 设置
 * - disabledBuiltinSkillNames 只保留合法 string，去重
 * - 对新增内置 Skill 做一次性默认关闭迁移：旧配置首次加载时自动关闭，用户手动开启后不再重置
 */
function normalizeSkillSettings(raw: unknown): KbSkillSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SKILL_SETTINGS };
  }
  const s = raw as Record<string, unknown>;
  const rawNames = s.disabledBuiltinSkillNames;
  let names: string[] = [];
  if (Array.isArray(rawNames)) {
    names = rawNames.filter((n): n is string => typeof n === "string" && n.length > 0);
    names = [...new Set(names)];
  }

  const rawInit = s.initializedDefaultDisabledBuiltinSkillNames;
  let initialized: string[] = [];
  if (Array.isArray(rawInit)) {
    initialized = rawInit.filter((n): n is string => typeof n === "string" && n.length > 0);
    initialized = [...new Set(initialized)];
  }

  // 一次性迁移：新增默认关闭 Skill 首次加载时自动关闭，用户手动开启后不再重置
  for (const skillName of DEFAULT_DISABLED_BUILTIN_SKILL_NAMES) {
    if (!initialized.includes(skillName)) {
      if (!names.includes(skillName)) {
        names.push(skillName);
      }
      initialized.push(skillName);
    }
  }

  return {
    disabledBuiltinSkillNames: names,
    initializedDefaultDisabledBuiltinSkillNames: initialized,
  };
}

/**
 * 归一化全局工具设置
 * - 只保留合法全局工具名 read_docs / web_read_page
 * - 去重
 * - 旧设置缺失时回退默认值
 */
function normalizeToolSettings(raw: unknown): KbToolSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_TOOL_SETTINGS };
  }
  const s = raw as Record<string, unknown>;
  const rawNames = s.disabledGlobalToolNames;
  const validNames: KbToolSettings["disabledGlobalToolNames"] = ["read_docs", "web_read_page", "edit_global_memory", "get_doc_info", "web_http_get", "web_http_post"];
  let names: KbToolSettings["disabledGlobalToolNames"] = [];
  if (Array.isArray(rawNames)) {
    names = rawNames
      .map((n) => (n === "append_global_memory" ? "edit_global_memory" : n))
      .filter((n): n is KbToolSettings["disabledGlobalToolNames"][number] =>
        typeof n === "string" && validNames.includes(n as KbToolSettings["disabledGlobalToolNames"][number])
      );
    names = [...new Set(names)];
  }

  // 归一化旧字段 disabledDangerousSkillToolConfirmationNames（迁移用）
  const validDangerousToolNames: KbDangerousSkillToolName[] = [
    "create_doc", "update_block", "insert_block", "delete_blocks",
    "move_block", "rename_doc", "delete_doc", "replace_doc_content",
  ];
  const rawDangerous = s.disabledDangerousSkillToolConfirmationNames;
  let dangerousNames: KbDangerousSkillToolName[] = [];
  if (Array.isArray(rawDangerous)) {
    dangerousNames = rawDangerous.filter(
      (n): n is KbDangerousSkillToolName =>
        typeof n === "string" && validDangerousToolNames.includes(n as KbDangerousSkillToolName)
    );
    dangerousNames = [...new Set(dangerousNames)];
  }

  // 归一化 disabledWriteToolConfirmationNames
  // 合并旧字段 dangerousNames 到新字段
  const rawWriteConfirmation = s.disabledWriteToolConfirmationNames;
  let writeConfirmationNames: string[] = [];
  if (Array.isArray(rawWriteConfirmation)) {
    writeConfirmationNames = rawWriteConfirmation
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
  }
  // 合并旧字段
  for (const name of dangerousNames) {
    if (!writeConfirmationNames.includes(name)) {
      writeConfirmationNames.push(name);
    }
  }
  writeConfirmationNames = [...new Set(writeConfirmationNames)];

  const result: KbToolSettings = {
    disabledGlobalToolNames: names,
  };
  if (writeConfirmationNames.length > 0) {
    result.disabledWriteToolConfirmationNames = writeConfirmationNames;
  }
  // 保留旧字段存储（下次合并时仍可读取）
  if (dangerousNames.length > 0) {
    result.disabledDangerousSkillToolConfirmationNames = dangerousNames;
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

/**
 * 归一化全局记忆设置
 * - 非对象 → 回退默认值
 * - docId 只保留 string
 * - maxChars clamp 到 [500, 30000]
 */
function normalizeGlobalMemorySettings(raw: unknown): GlobalMemorySettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_GLOBAL_MEMORY_SETTINGS };
  }
  const s = raw as Record<string, unknown>;

  const enabled = typeof s.enabled === "boolean" ? s.enabled : DEFAULT_GLOBAL_MEMORY_SETTINGS.enabled;
  const docId = typeof s.docId === "string" ? s.docId : DEFAULT_GLOBAL_MEMORY_SETTINGS.docId;

  const rawMaxChars = s.maxChars;
  let maxChars = DEFAULT_GLOBAL_MEMORY_SETTINGS.maxChars;
  if (typeof rawMaxChars === "number" && Number.isFinite(rawMaxChars)) {
    maxChars = clampNumber(Math.round(rawMaxChars), 500, 30000);
  }

  const allowAiUpdate = typeof s.allowAiUpdate === "boolean" ? s.allowAiUpdate : DEFAULT_GLOBAL_MEMORY_SETTINGS.allowAiUpdate;

  const rawUpdatedAt = s.updatedAt;
  const updatedAt = typeof rawUpdatedAt === "number" && Number.isFinite(rawUpdatedAt) ? rawUpdatedAt : undefined;

  return {
    enabled,
    docId,
    maxChars,
    allowAiUpdate,
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

function normalizeNotebrainWorkspaceSettings(raw: unknown): NotebrainAgentWorkspaceSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS };
  }
  const s = raw as Record<string, unknown>;
  return {
    // 迁移：老设置没有 enabled 字段时，如果 commandExecutionEnabled 为 true 则自动启用沙箱
    enabled: typeof s.enabled === "boolean"
      ? s.enabled
      : s.commandExecutionEnabled === true,
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
    legacyUserSkillDirectInject: typeof s.legacyUserSkillDirectInject === "boolean"
      ? s.legacyUserSkillDirectInject
      : DEFAULT_EXTERNAL_SKILL_SETTINGS.legacyUserSkillDirectInject,
  };
}

function normalizeMcpSettings(raw: unknown): McpSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_MCP_SETTINGS };
  }
  const s = raw as Record<string, unknown>;

  // Migration: old default maxVisibleToolsPerTurn was 12, new default is 40.
  // Treat exact-12 as old default and migrate to 40.
  let maxVisible = DEFAULT_MCP_SETTINGS.maxVisibleToolsPerTurn; // 40
  const rawVal = s.maxVisibleToolsPerTurn;
  if (rawVal !== undefined && rawVal !== null) {
    const parsed = parseInt(String(rawVal), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      if (parsed === 12) {
        maxVisible = 40; // Migrate old default
      } else {
        maxVisible = Math.min(80, Math.max(1, Math.round(parsed)));
      }
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
 * - 无效 zone → "cn"
 * - 空 language → "zh-CN"
 */
function normalizeWebSearchSettings(raw: unknown): WebSearchSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_WEB_SEARCH_SETTINGS };
  }

  const s = raw as Record<string, unknown>;

  // enabled
  const enabled = typeof s.enabled === "boolean" ? s.enabled : DEFAULT_WEB_SEARCH_SETTINGS.enabled;

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
    zoneRaw === "cn" || zoneRaw === "intl" ? zoneRaw : DEFAULT_WEB_SEARCH_SETTINGS.anySearchZone;

  // anySearchLanguage
  const langRaw = s.anySearchLanguage;
  const anySearchLanguage =
    typeof langRaw === "string" && langRaw.length > 0
      ? langRaw
      : DEFAULT_WEB_SEARCH_SETTINGS.anySearchLanguage;

  return {
    enabled,
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

/** Clear all explicit-clear markers (called after save to reset state). */
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
    console.warn("[KB Settings] Plugin instance not set, using default settings");
  }
  return pluginInstance;
}

/**
 * 获取插件实例（供 UI 组件使用）
 */
export function getKbPlugin(): any {
  return pluginInstance;
}

/**
 * 获取当前 KB 设置（已合并默认值）
 * 从插件 storage 读取，如不存在则返回默认值
 */
export async function getKbSettings(): Promise<KbSettings> {
  const plugin = getPlugin();
  if (!plugin) {
    return mergeKbSettings({});
  }

  try {
    const savedSettings = await plugin.loadData(SETTINGS_KEY);
    const { settings: runtimeSettings, diagnostics } = await decryptSensitiveSecretsFromStorage(
      (savedSettings || {}) as Record<string, unknown>,
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
  } catch {
    setLastSecretDiagnostics({ ...createEmptySecretDecryptDiagnostics(), hasDecryptFailure: true });
    return mergeKbSettings({});
  }
}

/**
 * 保存 KB 设置
 * 返回最终 mergedSettings，方便调用方同步更新 UI
 */
export async function saveKbSettings(settings: Partial<KbSettings>): Promise<KbSettings> {
  const plugin = getPlugin();
  if (!plugin) {
    throw new Error("Plugin instance not set");
  }

  // Read raw existing settings BEFORE decryption — used to protect enc:v1
  // ciphertext from being accidentally overwritten when decryption fails.
  const existingRaw = await plugin.loadData(SETTINGS_KEY);
    const existingRawObj = (existingRaw || {}) as Record<string, unknown>;

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
    const clearedProviderIds = new Set(explicitClearedProviderIds);
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
    const webSearchCleared = explicitClearedLocations.has("webSearchApiKey");
    const webSearchDecryptFailed = diagnostics.failedLocations.includes("webSearchApiKey");
    if (merged.webSearch && !(merged.webSearch.apiKey) && rawWebSearchEncKey && webSearchDecryptFailed && !webSearchCleared) {
      didPreserveCipher = true;
      merged.webSearch = { ...merged.webSearch, apiKey: rawWebSearchEncKey };
    }

    const encryptedSettings = await encryptSensitiveSecretsForStorage(
      merged as unknown as Record<string, unknown>,
    );
    await plugin.saveData(SETTINGS_KEY, encryptedSettings);
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
    if (explicitClearedLocations.has("webSearchApiKey")) {
      pushAgentDebugEvent("SECRET_CLEAR_REQUESTED", {
        location: "webSearchApiKey",
        action: "secret_cleared",
      }, "info");
    }

    // Reset explicit-clear markers after save (they are one-shot)
    clearExplicitClearedSecrets();

    return merged;
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
    agentMaxToolCallsPerTurn: normalizeIntegerSetting(
      normalized.agentMaxToolCallsPerTurn,
      DEFAULT_KB_SETTINGS.agentMaxToolCallsPerTurn,
      1,
      50,
    ),
    chatProviders,
    selectedChatProviderId: finalSelectedProviderId,
    selectedChatModelId: finalSelectedModelId,
    webSearch: normalizeWebSearchSettings(normalized.webSearch),
    skillSettings: normalizeSkillSettings(normalized.skillSettings),
    toolSettings: normalizeToolSettings(normalized.toolSettings),
    globalMemory: normalizeGlobalMemorySettings(normalized.globalMemory),
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
