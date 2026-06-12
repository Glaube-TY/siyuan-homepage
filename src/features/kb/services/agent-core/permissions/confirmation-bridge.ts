import type { ToolPermissionDecision, ToolPermissionPreview } from "./tool-preview";

export interface ToolConfirmationBridge {
  request(preview: ToolPermissionPreview): Promise<ToolPermissionDecision>;
}

/**
 * @deprecated Dev-only bridge that always allows writes. Never use in production.
 */
export class AllowingConfirmationBridge implements ToolConfirmationBridge {
  async request(): Promise<ToolPermissionDecision> {
    return { type: "allow" };
  }
}

/**
 * Real confirmation bridge that delegates to a registered handler.
 * The handler is set by the UI layer (KbMainPanel) on mount.
 * If no handler is set, the bridge returns deny for safety.
 *
 * This is the SINGLE bridge used by both dispatch-tool-calls and
 * native-tool-agent-loop. No deferred/private bridges.
 */
export class RegisteredConfirmationBridge implements ToolConfirmationBridge {
  private static handler: ((preview: ToolPermissionPreview) => Promise<ToolPermissionDecision>) | null = null;

  static setHandler(handler: (preview: ToolPermissionPreview) => Promise<ToolPermissionDecision>): () => void {
    RegisteredConfirmationBridge.handler = handler;
    return () => {
      RegisteredConfirmationBridge.handler = null;
    };
  }

  async request(preview: ToolPermissionPreview): Promise<ToolPermissionDecision> {
    const handler = RegisteredConfirmationBridge.handler;
    if (!handler) {
      return {
        type: "deny",
        reason: "确认处理程序未就绪。",
      };
    }
    return handler(preview);
  }
}
