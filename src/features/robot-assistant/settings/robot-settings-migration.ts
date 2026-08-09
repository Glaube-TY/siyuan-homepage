import {
  createDefaultRobotAdmission,
  createDefaultRobotAssistantSettings,
  isRobotProviderId,
  type RobotAssistantSettings,
  type RobotToolPolicy,
} from "./robot-settings-types";
import type { RobotAdmissionSettings } from "../contracts/robot-pairing";

/**
 * 旧 chat-action-bridge v1 设置的遗留结构（仅用于一次性迁移读取，
 * 不依赖已移除的 chat-action-bridge 模块）。
 */
interface LegacyChatActionBridgeSettingsV1 {
  enabled?: boolean;
  maxMessageLength?: number;
  sessionTtlMs?: number;
  keepHistoryLimit?: number;
  replyAfterAction?: boolean;
  feishu?: {
    enabled?: boolean;
    appId?: string;
    appSecret?: string;
    encryptedAppSecret?: string;
    allowPrivateChat?: boolean;
    allowGroupChat?: boolean;
    requireMentionInGroup?: boolean;
    allowedOpenIds?: string[];
    allowedUserIds?: string[];
    allowedChatIds?: string[];
  };
}

/**
 * 一次性旧设置迁移：chat-action-v1 → robot-assistant-v2。
 *
 * 保护已经配置飞书的用户：迁移 enabled / 长度 / TTL / reply / history limit /
 * 飞书 App ID / 加密 App Secret / 白名单 / 私聊群聊开关 / @ 要求。
 *
 * 不迁移 local gateway port / token / manual command / 旧固定 actions。
 *
 * 注意：本函数只迁移设置结构；encryptedAppSecret 直接透传原密文，
 * 解密/重加密由调用方用正式 secret 能力处理（v1→v2 不得把密文当明文重复加密）。
 */
export function migrateChatActionV1ToRobotV2(rawV1: unknown): RobotAssistantSettings {
  const v1 = rawV1 && typeof rawV1 === "object" && !Array.isArray(rawV1)
    ? rawV1 as Partial<LegacyChatActionBridgeSettingsV1>
    : null;
  const out = createDefaultRobotAssistantSettings();

  if (!v1) return out;

  out.enabled = v1.enabled === true;
  if (typeof v1.maxMessageLength === "number" && Number.isFinite(v1.maxMessageLength)) {
    out.maxMessageLength = Math.max(1, Math.round(v1.maxMessageLength));
  }
  if (typeof v1.sessionTtlMs === "number" && Number.isFinite(v1.sessionTtlMs) && v1.sessionTtlMs > 0) {
    out.sessionTtlMs = Math.round(v1.sessionTtlMs);
  }
  if (typeof v1.keepHistoryLimit === "number" && Number.isFinite(v1.keepHistoryLimit) && v1.keepHistoryLimit > 0) {
    out.keepHistoryLimit = Math.min(20, Math.round(v1.keepHistoryLimit));
  }
  out.replyAfterAction = v1.replyAfterAction !== false;

  // 飞书子配置迁移
  const feishu = v1.feishu && typeof v1.feishu === "object" ? v1.feishu : null;
  if (feishu) {
    out.feishu.enabled = feishu.enabled === true;
    out.feishu.appId = typeof feishu.appId === "string" ? feishu.appId.trim() : "";
    out.feishu.encryptedAppSecret = typeof feishu.encryptedAppSecret === "string"
      ? feishu.encryptedAppSecret.trim()
      : typeof (feishu as unknown as Record<string, unknown>).appSecret === "string"
        ? String((feishu as unknown as Record<string, unknown>).appSecret).trim()
        : "";
    out.feishu.admission = {
      privateChatAllowed: feishu.allowPrivateChat !== false,
      groupChatAllowed: feishu.allowGroupChat === true,
      groupRequireMention: feishu.requireMentionInGroup !== false,
      allowedSenderIds: [...(feishu.allowedOpenIds ?? []), ...(feishu.allowedUserIds ?? [])]
        .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
        .map((id) => id.trim()),
      allowedChatIds: (feishu.allowedChatIds ?? [])
        .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
        .map((id) => id.trim()),
    };
  }

  if (out.feishu.enabled) out.activeProvider = "feishu";

  return out;
}

export function migrateV1IfNeeded(rawV1: unknown): { needsWrite: boolean; settings: RobotAssistantSettings } {
  const v1 = rawV1 && typeof rawV1 === "object" && !Array.isArray(rawV1)
    ? rawV1 as Record<string, unknown>
    : null;
  if (!v1 || v1.version === 2) {
    return { needsWrite: false, settings: v1?.version === 2
      ? normalizeV2Settings(v1)
      : createDefaultRobotAssistantSettings() };
  }
  return { needsWrite: true, settings: migrateChatActionV1ToRobotV2(rawV1) };
}

/** 归一化 v2 设置：未知/非法字段回退默认值。 */
export function normalizeV2Settings(raw: unknown): RobotAssistantSettings {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
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
    : inferLegacyActiveProvider(out);
  out.robotToolPolicy = normalizeToolPolicy(value.robotToolPolicy);
  return out;
}

/** 旧配置可能同时启用了多个渠道；迁移时保留最常用的一个，随后由用户在总体设置中切换。 */
function inferLegacyActiveProvider(settings: RobotAssistantSettings): RobotAssistantSettings["activeProvider"] {
  if (settings.wechat.enabled) return "wechat";
  if (settings.qq.enabled) return "qq";
  if (settings.feishu.enabled) return "feishu";
  return "none";
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

function normalizeToolPolicy(raw: unknown): RobotToolPolicy {
  const defaults = createDefaultRobotAssistantSettings().robotToolPolicy;
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const rawTools = value.tools && typeof value.tools === "object" && !Array.isArray(value.tools)
    ? value.tools as Record<string, unknown>
    : {};
  // 早期开发包把 tools 写成空对象，导致所有写工具永久不可见；先铺安全默认值，再尊重显式开关。
  const tools: RobotToolPolicy["tools"] = structuredClone(defaults.tools);
  for (const [name, rawEntry] of Object.entries(rawTools)) {
    const toolName = name.trim();
    if (!toolName || !rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const remoteAllowed = (rawEntry as Record<string, unknown>).remoteAllowed;
    if (typeof remoteAllowed === "boolean") {
      const writeAction = (rawEntry as Record<string, unknown>).writeAction;
      tools[toolName] = {
        remoteAllowed,
        ...(writeAction === "ask" || writeAction === "deny" ? { writeAction } : {}),
      };
    }
  }
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
