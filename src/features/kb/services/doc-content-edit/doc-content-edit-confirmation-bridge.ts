/** 文档编辑内部确认桥：按发起面板精确路由，不暴露给 Agent。 */
import type { ConfirmationRoute } from "../agent-core/permissions/confirmation-bridge";

export interface DocContentEditConfirmationRequest {
  confirmationId: string;
  action: string;
  abortSignal?: AbortSignal;
  route?: ConfirmationRoute;
}

export interface DocContentEditConfirmationResponse {
  status: "confirmed" | "rejected";
  message: string;
}

export type DocContentEditConfirmationHandler = (
  request: DocContentEditConfirmationRequest,
) => Promise<DocContentEditConfirmationResponse>;

interface RegisteredHandler {
  token: symbol;
  handler: DocContentEditConfirmationHandler;
  pending: Set<(response: DocContentEditConfirmationResponse) => void>;
}

const handlers = new Map<string, RegisteredHandler>();

export function registerDocContentEditConfirmationHandler(
  panelInstanceId: string,
  handler: DocContentEditConfirmationHandler,
): () => void {
  const token = Symbol(panelInstanceId);
  const registered: RegisteredHandler = { token, handler, pending: new Set() };
  handlers.set(panelInstanceId, registered);
  return () => {
    const current = handlers.get(panelInstanceId);
    if (!current || current.token !== token) return;
    handlers.delete(panelInstanceId);
    for (const settle of current.pending) {
      settle({ status: "rejected", message: "发起确认的面板已销毁。" });
    }
    current.pending.clear();
  };
}

/** @deprecated 请使用 registerDocContentEditConfirmationHandler。 */
export function setDocContentEditConfirmationHandler(
  handler: DocContentEditConfirmationHandler,
): () => void {
  return registerDocContentEditConfirmationHandler("legacy-unrouted", handler);
}

export async function requestDocContentEditConfirmation(
  request: DocContentEditConfirmationRequest,
): Promise<DocContentEditConfirmationResponse> {
  if (request.abortSignal?.aborted) {
    return { status: "rejected", message: "用户已取消操作。" };
  }
  const route = request.route;
  if (!route?.panelInstanceId || !route.conversationId || !route.turnId) {
    return { status: "rejected", message: "文档编辑确认路由信息不完整。" };
  }
  const registered = handlers.get(route.panelInstanceId);
  if (!registered) {
    return { status: "rejected", message: "发起确认的面板已不可用。" };
  }

  return new Promise<DocContentEditConfirmationResponse>((resolve) => {
    let settled = false;
    const settle = (response: DocContentEditConfirmationResponse) => {
      if (settled) return;
      settled = true;
      request.abortSignal?.removeEventListener("abort", onAbort);
      registered.pending.delete(settle);
      resolve(response);
    };
    const onAbort = () => settle({ status: "rejected", message: "用户已取消操作。" });
    registered.pending.add(settle);
    request.abortSignal?.addEventListener("abort", onAbort, { once: true });
    void registered.handler(request).then(settle, () => {
      settle({ status: "rejected", message: "确认处理程序执行失败。" });
    });
  });
}
