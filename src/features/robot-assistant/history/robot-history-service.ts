import type { RobotHistoryItem } from "../contracts/robot-history";
import type { RobotProviderId } from "../contracts/robot-provider";

export interface RobotHistoryStore {
  append(item: RobotHistoryItem): Promise<void>;
  list(limit: number): Promise<RobotHistoryItem[]>;
  clear(): Promise<void>;
}

/** 生成历史条目（纯函数）。 */
export function buildRobotHistoryItem(input: {
  id: string;
  provider: RobotProviderId;
  direction: "in" | "out";
  senderMasked: string;
  chatMasked: string;
  messageId?: string;
  contentPreview?: string;
  resultSummary?: string;
  toolSummary?: string;
  status: RobotHistoryItem["status"];
  durationMs?: number;
  createdAt: number;
}): RobotHistoryItem {
  return {
    id: input.id,
    provider: input.provider,
    direction: input.direction,
    senderMasked: input.senderMasked,
    chatMasked: input.chatMasked,
    ...(input.messageId ? { messageId: input.messageId } : {}),
    ...(input.contentPreview ? { contentPreview: input.contentPreview } : {}),
    ...(input.resultSummary ? { resultSummary: input.resultSummary } : {}),
    ...(input.toolSummary ? { toolSummary: input.toolSummary } : {}),
    status: input.status,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    createdAt: input.createdAt,
  };
}

/** 掩码展示 ID：保留首尾字符。 */
export function maskIdentity(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return `${value[0]}***`;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export class RobotHistoryService {
  constructor(private readonly store: RobotHistoryStore) {}

  async append(item: RobotHistoryItem): Promise<void> {
    await this.store.append(item);
  }

  async list(limit: number): Promise<RobotHistoryItem[]> {
    return this.store.list(limit);
  }

  async clear(): Promise<void> {
    return this.store.clear();
  }
}
