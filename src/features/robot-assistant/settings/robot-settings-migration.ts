import {
  createDefaultRobotAdmission,
  createDefaultRobotAssistantSettings,
  isRobotProviderId,
  type RobotAssistantSettings,
  type RobotToolPolicy,
} from "./robot-settings-types";
import type { RobotAdmissionSettings } from "../contracts/robot-pairing";

/** 归一化当前 v2 设置：其他版本直接回退当前默认值。 */
export function normalizeV2Settings(raw: unknown): RobotAssistantSettings {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const value = input.version === 2 ? input : {};
  const out = createDefaultRobotAssistantSettings();
  out.enabled = value.enabled === true;
  const runtimeOwner = value.runtimeOwner && typeof value.runtimeOwner === "object" && !Array.isArray(value.runtimeOwner)
    ? value.runtimeOwner as Record<string, unknown>
    : null;
  if (runtimeOwner && typeof runtimeOwner.deviceId === "string" && runtimeOwner.deviceId.trim()) {
    out.runtimeOwner = {
      deviceId: runtimeOwner.deviceId.trim(),
      deviceName: typeof runtimeOwner.deviceName === "string" ? runtimeOwner.deviceName.trim() : "",
      container: typeof runtimeOwner.container === "string" ? runtimeOwner.container.trim() : "",
    };
  }
  out.agentModel = value.agentModel === "explicit" ? "explicit" : "use_kb_current";
  out.agentModelProviderId = typeof value.agentModelProviderId === "string" ? value.agentModelProviderId.trim() : "";
  out.agentModelId = typeof value.agentModelId === "string" ? value.agentModelId.trim() : "";
  if (out.agentModel === "explicit" && (!out.agentModelProviderId || !out.agentModelId)) {
    out.agentModel = "use_kb_current";
  }
  if (typeof value.maxMessageLength === "number" && Number.isFinite(value.maxMessageLength)) {
    out.maxMessageLength = Math.max(1, Math.round(value.maxMessageLength));
  }
  if (typeof value.sessionTtlMs === "number" && Number.isFinite(value.sessionTtlMs) && value.sessionTtlMs > 0) {
    out.sessionTtlMs = Math.round(value.sessionTtlMs);
  }
  if (typeof value.keepHistoryLimit === "number" && Number.isFinite(value.keepHistoryLimit) && value.keepHistoryLimit > 0) {
    out.keepHistoryLimit = Math.min(20, Math.round(value.keepHistoryLimit));
  }
  out.replyAfterAction = value.replyAfterAction !== false;
  if (typeof value.maxReplyChars === "number" && Number.isFinite(value.maxReplyChars) && value.maxReplyChars > 0) {
    out.maxReplyChars = Math.round(value.maxReplyChars);
  }
  if (typeof value.maxConcurrentTurns === "number" && Number.isFinite(value.maxConcurrentTurns)) {
    out.maxConcurrentTurns = Math.max(1, Math.round(value.maxConcurrentTurns));
  }
  if (typeof value.modelTimeoutMs === "number" && Number.isFinite(value.modelTimeoutMs) && value.modelTimeoutMs > 0) {
    out.modelTimeoutMs = Math.round(value.modelTimeoutMs);
  }
  if (typeof value.turnTimeoutMs === "number" && Number.isFinite(value.turnTimeoutMs) && value.turnTimeoutMs > 0) {
    out.turnTimeoutMs = Math.round(value.turnTimeoutMs);
  }
  const feishu = value.feishu && typeof value.feishu === "object" ? value.feishu as Record<string, unknown> : {};
  out.feishu.enabled = feishu.enabled === true;
  out.feishu.appId = typeof feishu.appId === "string" ? feishu.appId.trim() : "";
  out.feishu.encryptedAppSecret = typeof feishu.encryptedAppSecret === "string" ? feishu.encryptedAppSecret.trim() : "";
  out.feishu.admission = normalizeAdmission(feishu.admission);
  const qq = value.qq && typeof value.qq === "object" ? value.qq as Record<string, unknown> : {};
  out.qq.enabled = qq.enabled === true;
  out.qq.appId = typeof qq.appId === "string" ? qq.appId.trim() : "";
  out.qq.encryptedAppSecret = typeof qq.encryptedAppSecret === "string" ? qq.encryptedAppSecret.trim() : "";
  out.qq.admission = normalizeAdmission(qq.admission);
  const wechat = value.wechat && typeof value.wechat === "object" ? value.wechat as Record<string, unknown> : {};
  out.wechat.enabled = wechat.enabled === true;
  out.wechat.accountId = typeof wechat.accountId === "string" ? wechat.accountId : undefined;
  out.wechat.displayName = typeof wechat.displayName === "string" ? wechat.displayName : undefined;
  out.wechat.admission = normalizeAdmission(wechat.admission);
  out.activeProvider = value.activeProvider === "none" || isRobotProviderId(value.activeProvider)
    ? value.activeProvider
    : "none";
  out.robotToolPolicy = normalizeToolPolicy(value.robotToolPolicy);
  return out;
}

function normalizeAdmission(raw: unknown): RobotAdmissionSettings {
  const defaults = createDefaultRobotAdmission();
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    privateChatAllowed: typeof value.privateChatAllowed === "boolean"
      ? value.privateChatAllowed
      : defaults.privateChatAllowed,
    groupChatAllowed: typeof value.groupChatAllowed === "boolean"
      ? value.groupChatAllowed
      : defaults.groupChatAllowed,
    groupRequireMention: typeof value.groupRequireMention === "boolean"
      ? value.groupRequireMention
      : defaults.groupRequireMention,
    allowedSenderIds: normalizeStringList(value.allowedSenderIds),
    allowedChatIds: normalizeStringList(value.allowedChatIds),
  };
}

/** 旧主页组件工具名 → homepage_components 子工具前缀（迁移用户旧显式策略）。 */
const LEGACY_COMPONENT_TOOL_TO_PREFIX: Record<string, string> = {
  homepage_quick_note: "quick_note",
  homepage_focus: "focus",
  homepage_accounting: "accounting",
  homepage_fixed_assets: "fixed_assets",
  homepage_anniversary: "anniversary",
  homepage_favorites: "favorites",
  homepage_review: "review",
};

/** 旧死 key 判定：以 homepage_ 开头但不是新结构 key 的旧工具名（如 homepage_music）直接丢弃。 */
function isLegacyDeadToolKey(key: string): boolean {
  return key.startsWith("homepage_") && !key.startsWith("homepage_components");
}

function normalizeToolPolicy(raw: unknown): RobotToolPolicy {
  const defaults = createDefaultRobotAssistantSettings().robotToolPolicy;
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const rawTools = value.tools && typeof value.tools === "object" && !Array.isArray(value.tools)
    ? value.tools as Record<string, unknown>
    : {};
  // 先铺当前安全默认值，再尊重当前 schema 中的显式开关。
  const tools: RobotToolPolicy["tools"] = structuredClone(defaults.tools);
  const explicitNewKeys = new Set<string>();
  const writePolicy = (entry: unknown): { remoteAllowed: boolean; writeAction?: "ask" | "deny" } | null => {
    const remoteAllowed = (entry as Record<string, unknown>).remoteAllowed;
    if (typeof remoteAllowed !== "boolean") return null;
    const writeAction = (entry as Record<string, unknown>).writeAction;
    return {
      remoteAllowed,
      ...(writeAction === "ask" || writeAction === "deny" ? { writeAction: writeAction as "ask" | "deny" } : {}),
    };
  };
  // 第一遍：新结构 key 显式值（homepage_components.xxx 或顶层工具名）；旧死 key 直接丢弃。
  for (const [name, rawEntry] of Object.entries(rawTools)) {
    const toolName = name.trim();
    if (!toolName || toolName in LEGACY_COMPONENT_TOOL_TO_PREFIX || isLegacyDeadToolKey(toolName)) continue;
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const policy = writePolicy(rawEntry);
    if (!policy) continue;
    explicitNewKeys.add(toolName);
    tools[toolName] = policy;
  }
  // 第二遍：旧 homepage_* 工具名迁移。旧显式值优先于新默认值；
  // 新 key 已被用户显式设置时以新 key 为准。
  for (const [name, rawEntry] of Object.entries(rawTools)) {
    const toolName = name.trim();
    const prefix = LEGACY_COMPONENT_TOOL_TO_PREFIX[toolName];
    if (!prefix) continue;
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const policy = writePolicy(rawEntry);
    if (!policy) continue;
    const dotted = `homepage_components.${prefix}`;
    if (explicitNewKeys.has(dotted)) continue;
    tools[dotted] = policy;
  }
  // 迁移后不再保留旧死 key（旧名不在默认集合中，也不会被重新写入）。
  return {
    tools,
    defaultWriteAction: value.defaultWriteAction === "deny" ? "deny" : "ask",
    readOnlyDefaultAllowed: typeof value.readOnlyDefaultAllowed === "boolean"
      ? value.readOnlyDefaultAllowed
      : defaults.readOnlyDefaultAllowed,
  };
}

function normalizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)));
}
