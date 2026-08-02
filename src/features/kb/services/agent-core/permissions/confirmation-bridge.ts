import type { ToolPermissionDecision, ToolPermissionPreview } from "./tool-preview";

export interface ConfirmationRoute {
  panelInstanceId: string;
  conversationId: string;
  turnId: string;
}

export interface ToolConfirmationBridge {
  request(preview: ToolPermissionPreview): Promise<ToolPermissionDecision>;
}

type ConfirmationHandler = (
  preview: ToolPermissionPreview,
  route: ConfirmationRoute,
) => Promise<ToolPermissionDecision>;

interface RegisteredHandler {
  token: symbol;
  handler: ConfirmationHandler;
  pending: Set<(decision: ToolPermissionDecision) => void>;
}

/** @deprecated 仅用于开发测试，生产环境不得使用。 */
export class AllowingConfirmationBridge implements ToolConfirmationBridge {
  async request(): Promise<ToolPermissionDecision> {
    return { type: "allow" };
  }
}

/**
 * 按 panelInstanceId 精确路由的确认桥。
 * 没有精确路由时安全拒绝；注销面板时会结束该面板全部 pending Promise。
 */
export class RegisteredConfirmationBridge implements ToolConfirmationBridge {
  private static readonly handlers = new Map<string, RegisteredHandler>();

  constructor(private readonly route?: ConfirmationRoute) {}

  static register(panelInstanceId: string, handler: ConfirmationHandler): () => void {
    const token = Symbol(panelInstanceId);
    const registered: RegisteredHandler = { token, handler, pending: new Set() };
    RegisteredConfirmationBridge.handlers.set(panelInstanceId, registered);
    return () => {
      const current = RegisteredConfirmationBridge.handlers.get(panelInstanceId);
      if (!current || current.token !== token) return;
      RegisteredConfirmationBridge.handlers.delete(panelInstanceId);
      for (const settle of current.pending) {
        settle({ type: "deny", reason: "发起确认的面板已销毁。" });
      }
      current.pending.clear();
    };
  }

  /** @deprecated 请使用 register(panelInstanceId, handler)。 */
  static setHandler(handler: ConfirmationHandler): () => void {
    return RegisteredConfirmationBridge.register("legacy-unrouted", handler);
  }

  async request(preview: ToolPermissionPreview): Promise<ToolPermissionDecision> {
    const route = this.route;
    if (!route?.panelInstanceId || !route.conversationId || !route.turnId) {
      return { type: "deny", reason: "确认路由信息不完整。" };
    }
    const registered = RegisteredConfirmationBridge.handlers.get(route.panelInstanceId);
    if (!registered) {
      return { type: "deny", reason: "发起确认的面板已不可用。" };
    }

    return new Promise<ToolPermissionDecision>((resolve) => {
      let settled = false;
      const settle = (decision: ToolPermissionDecision) => {
        if (settled) return;
        settled = true;
        registered.pending.delete(settle);
        resolve(decision);
      };
      registered.pending.add(settle);
      void registered.handler(preview, route).then(settle, () => {
        settle({ type: "deny", reason: "确认处理程序执行失败。" });
      });
    });
  }
}
