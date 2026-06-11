/**
 * 文档内容编辑内部确认桥。
 * Runtime/UI 内部机制，不暴露给 Planner / Skill / Prompt。
 * 负责把 pending confirmation 桥接到 UI 弹窗，等待用户确认或拒绝。
 */

export interface DocContentEditConfirmationRequest {
  confirmationId: string;
  action: string;
}

export interface DocContentEditConfirmationResponse {
  status: "confirmed" | "rejected";
  message: string;
}

export type DocContentEditConfirmationHandler = (
  request: DocContentEditConfirmationRequest,
) => Promise<DocContentEditConfirmationResponse>;

let currentHandler: DocContentEditConfirmationHandler | null = null;

/**
 * 注册 UI 确认 handler。通常由 KbMainPanel 在 onMount 时调用。
 * 返回注销函数，建议在 onDestroy 时调用。
 */
export function setDocContentEditConfirmationHandler(
  handler: DocContentEditConfirmationHandler,
): () => void {
  currentHandler = handler;
  return () => {
    currentHandler = null;
  };
}

/**
 * 请求用户对 pending confirmation 进行确认。
 * 如果没有 handler（UI 未就绪），直接返回 rejected，避免卡死。
 */
export async function requestDocContentEditConfirmation(
  request: DocContentEditConfirmationRequest,
): Promise<DocContentEditConfirmationResponse> {
  if (!currentHandler) {
    return {
      status: "rejected",
      message: "确认处理程序未就绪，无法执行文档内容编辑操作。",
    };
  }
  return currentHandler(request);
}
