/**
 * move_block 内部确认执行服务。
 * 仅在用户通过 UI 弹窗确认后调用，不暴露给 Agent。
 * 真实移动统一走 src/api.ts 的 moveBlock wrapper。
 */
import { moveBlock, getBlockKramdown, sql } from "../../../../api";
import {
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
} from "./doc-content-edit-confirmation-store";

export interface ExecuteConfirmedMoveBlockInput {
  confirmationId: string;
}

export interface ExecuteConfirmedMoveBlockResult {
  ok: boolean;
  status: "success" | "rejected" | "failed";
  message: string;
  target?: {
    blockId: string;
    previousID?: string;
    parentID?: string;
    docId?: string;
    title?: string;
  };
}

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

/**
 * 向上追溯 candidateId 的祖先链，判断 ancestorId 是否在其路径上。
 * 包含最大层数防御，避免异常数据导致无限循环。
 */
async function isDescendantOf(candidateId: string, ancestorId: string): Promise<boolean> {
  if (candidateId === ancestorId) return true;
  const maxDepth = 100;
  let currentId = candidateId;
  for (let i = 0; i < maxDepth; i++) {
    const rows = await sql(`SELECT parent_id FROM blocks WHERE id = '${escapeSqlId(currentId)}'`);
    const parentId = (rows[0] as { parent_id?: string } | undefined)?.parent_id;
    if (!parentId) return false;
    if (parentId === ancestorId) return true;
    currentId = parentId;
  }
  return false;
}

export async function executeConfirmedMoveBlock(
  input: ExecuteConfirmedMoveBlockInput,
): Promise<ExecuteConfirmedMoveBlockResult> {
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
      message: "确认信息已过期，未执行移动。",
    };
  }

  // 3. 确认 action
  if (confirmation.action !== "move_block") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "该操作类型不支持 move_block 执行器。",
    };
  }

  // 4. 从 toolInput 读取参数并防御校验
  const rawBlockId = confirmation.toolInput.blockId as string | undefined;
  const rawPreviousID = confirmation.toolInput.previousID as string | undefined;
  const rawParentID = confirmation.toolInput.parentID as string | undefined;

  const blockId = typeof rawBlockId === "string" ? rawBlockId.trim() : "";
  const previousID = typeof rawPreviousID === "string" && rawPreviousID.trim() !== "" ? rawPreviousID.trim() : undefined;
  const parentID = typeof rawParentID === "string" && rawParentID.trim() !== "" ? rawParentID.trim() : undefined;

  if (!blockId) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "确认信息缺少有效的 blockId。",
    };
  }

  if (!previousID && !parentID) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "确认信息缺少有效的 previousID 或 parentID。",
    };
  }

  if (previousID && previousID === blockId) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "previousID 不能与 blockId 相同。",
    };
  }

  if (parentID && parentID === blockId) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "parentID 不能与 blockId 相同。",
    };
  }

  // 5. 再次确认目标块存在
  try {
    const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(blockId)}'`);
    if (!rows[0]) {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "目标块已不存在，未执行移动。",
      };
    }
  } catch {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "无法查询目标块，未执行移动。",
    };
  }

  // 6. 再次确认 previousID / parentID 存在，且不是 blockId 的子孙块
  if (previousID) {
    try {
      const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(previousID)}'`);
      if (!rows[0]) {
        await removeDocContentEditConfirmation(confirmationId);
        return {
          ok: false,
          status: "failed",
          message: "目标 previousID 已不存在，未执行移动。",
        };
      }
      if (await isDescendantOf(previousID, blockId)) {
        await removeDocContentEditConfirmation(confirmationId);
        return {
          ok: false,
          status: "failed",
          message: "目标 previousID 是 blockId 的子孙块，未执行移动。",
        };
      }
    } catch {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "无法查询目标 previousID，未执行移动。",
      };
    }
  }

  if (parentID) {
    try {
      const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(parentID)}'`);
      if (!rows[0]) {
        await removeDocContentEditConfirmation(confirmationId);
        return {
          ok: false,
          status: "failed",
          message: "目标 parentID 已不存在，未执行移动。",
        };
      }
      if (await isDescendantOf(parentID, blockId)) {
        await removeDocContentEditConfirmation(confirmationId);
        return {
          ok: false,
          status: "failed",
          message: "目标 parentID 是 blockId 的子孙块，未执行移动。",
        };
      }
    } catch {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "无法查询目标 parentID，未执行移动。",
      };
    }
  }

  // 7. 如 beforeSnapshot 可用，校验内容未变化
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
          message: "块内容已变化，未执行移动。",
        };
      }
    } catch {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "无法读取目标块当前内容，未执行移动。",
      };
    }
  }

  // 8. 调用 moveBlock 执行真实移动
  let moveResult: unknown;
  try {
    moveResult = await moveBlock(blockId, previousID, parentID);
  } catch (err) {
    await removeDocContentEditConfirmation(confirmationId);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      message: `移动失败：${message}`,
    };
  }

  if (!moveResult) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "块移动失败。",
    };
  }

  // 9. 成功后清理 confirmation
  await removeDocContentEditConfirmation(confirmationId);

  return {
    ok: true,
    status: "success",
    message: "块已移动。",
    target: {
      blockId,
      previousID,
      parentID,
      docId: confirmation.target.docId,
      title: confirmation.target.title,
    },
  };
}
