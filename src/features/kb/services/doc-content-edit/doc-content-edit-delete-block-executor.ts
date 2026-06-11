/**
 * delete_block 内部确认执行服务。
 * 仅在用户通过 UI 弹窗确认后调用，不暴露给 Planner。
 * 真实删除统一走 src/api.ts 的 deleteBlock wrapper。
 */
import { deleteBlock, getBlockKramdown, sql } from "../../../../api";
import {
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
} from "./doc-content-edit-confirmation-store";

export interface ExecuteConfirmedDeleteBlockInput {
  confirmationId: string;
}

export interface ExecuteConfirmedDeleteBlockResult {
  ok: boolean;
  status: "success" | "rejected" | "failed";
  message: string;
  target?: {
    blockId: string;
    docId?: string;
    title?: string;
  };
}

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

export async function executeConfirmedDeleteBlock(
  input: ExecuteConfirmedDeleteBlockInput,
): Promise<ExecuteConfirmedDeleteBlockResult> {
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
  if (confirmation.action !== "delete_block") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "该操作类型不支持 delete_block 执行器。",
    };
  }

  // 4. 从 toolInput 读取 blockId 并防御校验
  const rawBlockId = confirmation.toolInput.blockId as string | undefined;
  const blockId = typeof rawBlockId === "string" ? rawBlockId.trim() : "";
  if (!blockId) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "确认信息缺少有效的 blockId。",
    };
  }

  // 5. 再次确认目标块存在
  let block: Block | undefined;
  try {
    const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(blockId)}'`);
    block = rows[0] as Block | undefined;
    if (!block) {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "目标块已不存在，未执行删除。",
      };
    }
  } catch {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "无法查询目标块，未执行删除。",
    };
  }

  // 6. 如 beforeSnapshot 可用，校验内容未变化
  const beforeSnapshot = confirmation.beforeSnapshot ?? "";
  if (beforeSnapshot !== "") {
    try {
      const currentRes = await getBlockKramdown(blockId);
      const currentContent = currentRes?.kramdown ?? "";
      if (currentContent !== beforeSnapshot) {
        await removeDocContentEditConfirmation(confirmationId);
        return {
          ok: false,
          status: "failed",
          message: "块内容已变化，未执行删除。",
        };
      }
    } catch {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "无法读取目标块当前内容，未执行删除。",
      };
    }
  }

  // 7. 调用 deleteBlock 执行真实删除
  let deleteResult: unknown;
  try {
    deleteResult = await deleteBlock(blockId);
  } catch (err) {
    await removeDocContentEditConfirmation(confirmationId);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      message: `删除失败：${message}`,
    };
  }

  if (!deleteResult) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "块删除失败。",
    };
  }

  // 8. 成功后清理 confirmation
  await removeDocContentEditConfirmation(confirmationId);

  return {
    ok: true,
    status: "success",
    message: "块已删除。",
    target: {
      blockId,
      docId: confirmation.target.docId,
      title: confirmation.target.title,
    },
  };
}
