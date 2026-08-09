import type { RobotProviderId } from "./robot-provider";

/** 机器人历史条目（robot-history-v2，替换旧 chat-action-history）。 */
export interface RobotHistoryItem {
  id: string;
  provider: RobotProviderId;
  accountId?: string;
  direction: "in" | "out";
  senderMasked: string;
  chatMasked: string;
  messageId?: string;
  contentPreview?: string;
  resultSummary?: string;
  /** tool 摘要（toolName / action / 脱敏摘要）。 */
  toolSummary?: string;
  status: "received" | "ignored" | "rejected" | "executed" | "failed" | "sent";
  durationMs?: number;
  createdAt: number;
}

/** 机器人去重：provider:accountId:messageId，持久化 ring/cache，TTL 24h。 */
export interface RobotProcessedMessageRecord {
  key: string;
  processedAt: number;
}
