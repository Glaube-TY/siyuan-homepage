import type { RobotProviderId } from "./robot-provider";

/** 高风险远程写入确认，绑定 sender / chat / provider / pending action。 */
export interface RobotConfirmation {
  confirmationId: string;
  provider: RobotProviderId;
  accountId: string;
  chatId: string;
  senderId: string;
  toolName: string;
  action?: string;
  /** 安全预览（脱敏，不含 secret）。 */
  safePreview: string;
  /** resume 所需的最小状态（工具执行参数等，已脱敏，不含 secret）。 */
  resumeState: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
  /** 收到有效确认回复后置为 resolved；过期自动取消。 */
  resolved?: boolean;
}

export const ROBOT_CONFIRMATION_DEFAULT_TTL_MS = 2 * 60 * 1000;

export interface RobotConfirmationStore {
  get(confirmationId: string): Promise<RobotConfirmation | null>;
  put(confirmation: RobotConfirmation): Promise<void>;
  delete(confirmationId: string): Promise<void>;
  list?(): Promise<RobotConfirmation[]>;
}
