/**
 * create_doc 内部确认执行服务。
 * 仅在用户通过 UI 弹窗确认后调用，不暴露给 Agent。
 * 真实创建统一走 src/api.ts 的 createDocWithMd wrapper。
 */
import { createDocWithMd } from "../../../../api";
import {
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
} from "./doc-content-edit-confirmation-store";

export interface ExecuteConfirmedCreateDocInput {
  confirmationId: string;
}

export interface ExecuteConfirmedCreateDocResult {
  ok: boolean;
  status: "success" | "rejected" | "failed";
  message: string;
  target?: {
    notebookId: string;
    path: string;
    docId?: string;
    title?: string;
  };
}

export async function executeConfirmedCreateDoc(
  input: ExecuteConfirmedCreateDocInput,
): Promise<ExecuteConfirmedCreateDocResult> {
  const { confirmationId } = input;

  // 1. 读取 pending confirmation
  const confirmation = await getDocContentEditConfirmation(confirmationId);
  if (!confirmation) {
    return {
      ok: false,
      status: "failed",
      message: "确认信息不存在或已过期。",
    };
  }

  // 2. 校验过期
  if (confirmation.expiresAt && confirmation.expiresAt <= Date.now()) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "确认信息已过期，未执行创建。",
    };
  }

  // 3. 确认 action
  if (confirmation.action !== "create_doc") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "该操作类型不支持 create_doc 执行器。",
    };
  }

  // 4. 从 toolInput 读取参数并防御校验
  const rawNotebookId = confirmation.toolInput.notebookId as string | undefined;
  const rawPath = confirmation.toolInput.path as string | undefined;
  const rawMarkdown = confirmation.toolInput.markdown as string | undefined;
  const notebookId = typeof rawNotebookId === "string" ? rawNotebookId.trim() : "";
  const path = typeof rawPath === "string" ? rawPath.trim() : "";
  const markdown = typeof rawMarkdown === "string" ? rawMarkdown : "";

  if (!notebookId || !path) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "确认信息缺少有效的 notebookId 或 path。",
    };
  }

  // 5. 调用 createDocWithMd 执行真实创建
  try {
    const docId = await createDocWithMd(notebookId, path, markdown);
    if (typeof docId !== "string" || docId.trim() === "") {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "文档创建失败：createDocWithMd 返回了无效文档 ID。",
      };
    }
    await removeDocContentEditConfirmation(confirmationId);
    const hasContent = markdown.trim().length > 0;
    return {
      ok: true,
      status: "success",
      message: hasContent ? "文档已创建并写入初始 Markdown 内容。" : "空文档已创建。",
      target: {
        notebookId,
        path,
        docId,
        title: path.split("/").pop(),
      },
    };
  } catch (err) {
    await removeDocContentEditConfirmation(confirmationId);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      message: `文档创建失败：${message}`,
    };
  }
}
