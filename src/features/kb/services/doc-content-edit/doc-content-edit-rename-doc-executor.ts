/**
 * rename_doc 内部确认执行服务。
 * 仅在用户通过 UI 弹窗确认后调用，不暴露给 Planner。
 * 真实重命名统一走 src/api.ts 的 renameDocByID wrapper。
 */
import { renameDocByID, sql } from "../../../../api";
import {
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
} from "./doc-content-edit-confirmation-store";

export interface ExecuteConfirmedRenameDocInput {
  confirmationId: string;
}

export interface ExecuteConfirmedRenameDocResult {
  ok: boolean;
  status: "success" | "rejected" | "failed";
  message: string;
  target?: {
    docId: string;
    title?: string;
    previousTitle?: string;
  };
}

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

export async function executeConfirmedRenameDoc(
  input: ExecuteConfirmedRenameDocInput,
): Promise<ExecuteConfirmedRenameDocResult> {
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
      message: "确认信息已过期，未执行重命名。",
    };
  }

  // 3. 确认 action
  if (confirmation.action !== "rename_doc") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "该操作类型不支持 rename_doc 执行器。",
    };
  }

  // 4. 从 toolInput 读取参数并防御校验
  const rawDocId = confirmation.toolInput.docId as string | undefined;
  const rawTitle = confirmation.toolInput.title as string | undefined;
  const docId = typeof rawDocId === "string" ? rawDocId.trim() : "";
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";

  if (!docId || !title) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "确认信息缺少有效的 docId 或 title。",
    };
  }

  // 5. 再次确认目标文档存在，并读取当前标题
  let currentTitle: string | undefined;
  try {
    const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(docId)}' AND type = 'd'`);
    const block = rows[0] as Block | undefined;
    if (!block) {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "目标文档已不存在，未执行重命名。",
      };
    }
    currentTitle = block.content || block.name || undefined;
  } catch {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "无法读取目标文档当前状态，未执行重命名。",
    };
  }

  // 6. 可选：校验当前标题与准备时一致
  const previousTitle = confirmation.beforeSnapshot ?? "";
  if (previousTitle && currentTitle !== undefined && currentTitle !== previousTitle) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "文档标题在确认期间已发生变化，未执行重命名。",
    };
  }

  // 7. 调用 renameDocByID 执行真实重命名
  try {
    await renameDocByID(docId, title);
  } catch (err) {
    await removeDocContentEditConfirmation(confirmationId);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      message: `文档重命名失败：${message}`,
    };
  }

  // 8. 执行后校验：确认标题已变更
  try {
    const rowsAfter = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(docId)}' AND type = 'd'`);
    const blockAfter = rowsAfter[0] as Block | undefined;
    const actualTitle = blockAfter?.content || blockAfter?.name || "";
    if (!blockAfter || actualTitle !== title) {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "重命名后校验失败：文档标题未成功更新。",
      };
    }
  } catch {
    // 校验查询失败不阻断成功，继续返回 success
  }

  await removeDocContentEditConfirmation(confirmationId);
  return {
    ok: true,
    status: "success",
    message: "文档已重命名。",
    target: {
      docId,
      title,
      previousTitle: currentTitle ?? previousTitle,
    },
  };
}
