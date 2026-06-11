/**
 * delete_doc 内部确认执行服务。
 * 仅在用户通过 UI 弹窗确认后调用，不暴露给 Planner。
 * 真实删除统一走 src/api.ts 的 removeDocByID wrapper。
 */
import { removeDocByID, sql } from "../../../../api";
import {
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
} from "./doc-content-edit-confirmation-store";

export interface ExecuteConfirmedDeleteDocInput {
  confirmationId: string;
}

export interface ExecuteConfirmedDeleteDocResult {
  ok: boolean;
  status: "success" | "rejected" | "failed";
  message: string;
  target?: {
    docId: string;
    title?: string;
  };
}

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

export async function executeConfirmedDeleteDoc(
  input: ExecuteConfirmedDeleteDocInput,
): Promise<ExecuteConfirmedDeleteDocResult> {
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
      message: "确认信息已过期，未执行删除。",
    };
  }

  // 3. 确认 action
  if (confirmation.action !== "delete_doc") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "该操作类型不支持 delete_doc 执行器。",
    };
  }

  // 4. 从 toolInput 读取参数并防御校验
  const rawDocId = confirmation.toolInput.docId as string | undefined;
  const docId = typeof rawDocId === "string" ? rawDocId.trim() : "";

  if (!docId) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "确认信息缺少有效的 docId。",
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
        message: "目标文档已不存在，未执行删除。",
      };
    }
    currentTitle = block.content || block.name || undefined;
  } catch {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "无法读取目标文档当前状态，未执行删除。",
    };
  }

  // 5.5 标题一致性校验：若确认时记录了标题且当前标题已变化，则拒绝执行
  const confirmedTitle = confirmation.beforeSnapshot ?? confirmation.target?.title;
  if (confirmedTitle !== undefined && confirmedTitle !== currentTitle) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "目标文档标题已变化，未执行删除。",
    };
  }

  // 6. 调用 removeDocByID 执行真实删除
  try {
    await removeDocByID(docId);
  } catch (err) {
    await removeDocContentEditConfirmation(confirmationId);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      message: `文档删除失败：${message}`,
    };
  }

  // 7. 执行后校验：确认文档已不存在
  try {
    const rowsAfter = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(docId)}' AND type = 'd'`);
    if (rowsAfter && rowsAfter.length > 0) {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "删除后校验失败：文档仍存在。",
      };
    }
  } catch {
    // 校验查询失败不阻断成功，继续返回 success
  }

  await removeDocContentEditConfirmation(confirmationId);
  return {
    ok: true,
    status: "success",
    message: "文档已删除。",
    target: {
      docId,
      title: currentTitle,
    },
  };
}
