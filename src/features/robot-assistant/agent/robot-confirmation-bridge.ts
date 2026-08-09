import type { ToolConfirmationBridge } from "../../../features/kb/services/agent-core/permissions/confirmation-bridge";
import type { ToolPermissionDecision, ToolPermissionPreview } from "../../../features/kb/services/agent-core/permissions/tool-preview";
import type { RobotConfirmation } from "../contracts/robot-confirmation";
import { ROBOT_CONFIRMATION_DEFAULT_TTL_MS } from "../contracts/robot-confirmation";
import type { RobotProviderId } from "../contracts/robot-provider";
import { createRobotId } from "../contracts/robot-id";
import type { RobotConfirmationOutcome } from "../core/robot-core";
import type { RobotToolPolicy } from "../settings/robot-settings-types";

export interface RobotConfirmationBridgeContext {
  provider: RobotProviderId;
  accountId: string;
  chatId: string;
  senderId: string;
  requestConfirmation(confirmation: RobotConfirmation, promptText: string): Promise<RobotConfirmationOutcome>;
  now?(): number;
  toolPolicy: RobotToolPolicy;
}

/**
 * 复用共享 Agent Tool permission decision core：
 * 当本地 Agent 的 `ask` 落到远程 Robot 时，走 Robot confirmation transport，
 * 而不是前端 Dialog。确认绑定 provider/account/chat/sender，且非本人“确认”无效。
 */
export class RobotConfirmationBridge implements ToolConfirmationBridge {
  constructor(private readonly ctx: RobotConfirmationBridgeContext) {}

  async request(preview: ToolPermissionPreview): Promise<ToolPermissionDecision> {
    const writeAction = this.ctx.toolPolicy.tools[preview.toolName]?.writeAction
      ?? this.ctx.toolPolicy.defaultWriteAction;
    if (writeAction === "deny") {
      return { type: "deny", reason: "远程机器人策略禁止该写操作。", reasonCode: "robot_write_denied" };
    }
    const now = this.ctx.now?.() ?? Date.now();
    const action = preview.argsPreview && typeof preview.argsPreview === "object"
      && typeof (preview.argsPreview as Record<string, unknown>).action === "string"
      ? String((preview.argsPreview as Record<string, unknown>).action)
      : undefined;

    const confirmation: RobotConfirmation = {
      confirmationId: createRobotId(),
      provider: this.ctx.provider,
      accountId: this.ctx.accountId,
      chatId: this.ctx.chatId,
      senderId: this.ctx.senderId,
      toolName: preview.toolName,
      ...(action ? { action } : {}),
      safePreview: preview.summary ?? preview.targetSummary ?? preview.title,
      resumeState: { toolName: preview.toolName, ...(action ? { action } : {}) },
      createdAt: now,
      expiresAt: now + ROBOT_CONFIRMATION_DEFAULT_TTL_MS,
    };

    const prompt = [
      "AI 准备执行：",
      confirmation.safePreview,
      "回复「确认」继续，2 分钟内有效；回复「取消」放弃。",
    ].join("\n");

    const outcome = await this.ctx.requestConfirmation(confirmation, prompt);
    if (outcome === "approved") return { type: "allow" };
    return { type: "deny", reason: outcome === "expired" ? "确认已过期。" : "用户取消了该操作。" };
  }
}
