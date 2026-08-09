import type { RobotAdmissionSettings } from "../contracts/robot-pairing";
import type { RobotProviderId } from "../contracts/robot-provider";

/**
 * 机器人助手设置 v2，替换旧 `ChatActionBridgeSettings`。
 * 不再包含 localGateway / defaultMode / requireCommandPrefix / commandPrefixes / actions。
 */

/** 每个 Provider 独立的账号 / 状态字段。 */
export interface RobotProviderSettings {
  enabled: boolean;
  admission: RobotAdmissionSettings;
}

export interface RobotWechatSettings extends RobotProviderSettings {
  /** 登录后由 Kernel 回填（非敏感摘要，不存 token）。 */
  accountId?: string;
  displayName?: string;
}

export interface RobotFeishuSettings extends RobotProviderSettings {
  appId: string;
  /** 加密后的 App Secret（robot-secret-vault 格式）。 */
  encryptedAppSecret: string;
}

export interface RobotQqSettings extends RobotProviderSettings {
  appId: string;
  encryptedAppSecret: string;
}

/** 唯一负责接收和回复远程消息的思源 Kernel。 */
export interface RobotRuntimeOwner {
  deviceId: string;
  deviceName: string;
  container: string;
}

/** 远程机器人工具权限：只回答“该工具是否允许通过远程聊天使用”。 */
export interface RobotToolPolicy {
  /** key = 聚合工具名（如 siyuan_kb / diary_task / homepage_accounting）。 */
  tools: Record<string, { remoteAllowed: boolean; writeAction?: "ask" | "deny" }>;
  /** 写操作默认策略：allow / ask / deny（可被 tools 单项覆盖）。 */
  defaultWriteAction: "ask" | "deny";
  /** 只读工具默认允许。 */
  readOnlyDefaultAllowed: boolean;
}

export interface RobotAssistantSettings {
  version: 2;
  enabled: boolean;
  /** null 兼容旧配置；设置后仅匹配的 Kernel 运行 Provider。 */
  runtimeOwner: RobotRuntimeOwner | null;
  /** "use-kb-current" 或显式模型快照由前端 syncAgentRuntimeConfig 推送，此处仅记录选择意向。 */
  agentModel: "use_kb_current" | "explicit";
  maxMessageLength: number;
  /** 每个会话串行 Agent turn，后续消息进入短队列。 */
  sessionTtlMs: number;
  keepHistoryLimit: number;
  /** 是否在每次 action 后主动回复结果。 */
  replyAfterAction: boolean;
  maxReplyChars: number;
  /** 全局并发 Agent turn 上限（默认 2～3）。 */
  maxConcurrentTurns: number;
  /** 单次模型调用超时（ms），默认 50s。 */
  modelTimeoutMs: number;
  /** 整个 Agent turn 总超时（ms），默认 180s。 */
  turnTimeoutMs: number;
  robotToolPolicy: RobotToolPolicy;
  wechat: RobotWechatSettings;
  feishu: RobotFeishuSettings;
  qq: RobotQqSettings;
}

export const ROBOT_SETTINGS_VERSION = 2;

/** 原方案默认开放的 Kernel-safe 聚合工具；所有写 action 仍必须经过远程确认。 */
export const DEFAULT_ROBOT_REMOTE_TOOLS: RobotToolPolicy["tools"] = {
  siyuan_kb: { remoteAllowed: true, writeAction: "ask" },
  diary_task: { remoteAllowed: true, writeAction: "ask" },
  homepage_quick_note: { remoteAllowed: true, writeAction: "ask" },
  homepage_accounting: { remoteAllowed: true, writeAction: "ask" },
  homepage_fixed_assets: { remoteAllowed: true, writeAction: "ask" },
  homepage_anniversary: { remoteAllowed: true, writeAction: "ask" },
  homepage_favorites: { remoteAllowed: true, writeAction: "ask" },
  homepage_review: { remoteAllowed: true, writeAction: "ask" },
};

export function createDefaultRobotAdmission(): RobotAdmissionSettings {
  return {
    privateChatAllowed: true,
    groupChatAllowed: true,
    groupRequireMention: true,
    allowedSenderIds: [],
    allowedChatIds: [],
  };
}

export function createDefaultRobotAssistantSettings(): RobotAssistantSettings {
  return {
    version: ROBOT_SETTINGS_VERSION,
    enabled: false,
    runtimeOwner: null,
    agentModel: "use_kb_current",
    maxMessageLength: 4000,
    sessionTtlMs: 24 * 60 * 60 * 1000,
    keepHistoryLimit: 20,
    replyAfterAction: true,
    maxReplyChars: 4000,
    maxConcurrentTurns: 2,
    modelTimeoutMs: 50 * 1000,
    turnTimeoutMs: 180 * 1000,
    robotToolPolicy: {
      tools: structuredClone(DEFAULT_ROBOT_REMOTE_TOOLS),
      defaultWriteAction: "ask",
      readOnlyDefaultAllowed: true,
    },
    wechat: { enabled: false, admission: createDefaultRobotAdmission() },
    feishu: { enabled: false, appId: "", encryptedAppSecret: "", admission: createDefaultRobotAdmission() },
    qq: { enabled: false, appId: "", encryptedAppSecret: "", admission: createDefaultRobotAdmission() },
  };
}

export function isRobotProviderId(value: unknown): value is RobotProviderId {
  return value === "wechat" || value === "feishu" || value === "qq";
}
