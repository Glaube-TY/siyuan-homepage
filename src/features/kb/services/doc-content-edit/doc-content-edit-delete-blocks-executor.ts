/**
 * delete_blocks 内部确认执行服务。
 * 仅在用户通过 UI 弹窗确认后调用，不暴露给 Agent。
 * 顺序调用 api.ts 的 deleteBlock wrapper 删除每个块。
 */
import { deleteBlock, getBlockKramdown, sql } from "../../../../api";
import { normalizeKramdownForStability } from "./doc-content-edit-diff";
import {
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
} from "./doc-content-edit-confirmation-store";

export interface ExecuteConfirmedDeleteBlocksInput {
  confirmationId: string;
}

export interface ExecuteConfirmedDeleteBlocksResult {
  ok: boolean;
  status: "success" | "rejected" | "failed";
  message: string;
  target?: {
    blockIds: string[];
    docId?: string;
    title?: string;
  };
  requestedCount?: number;
  deletedCount?: number;
  reasonCode?: string;
}

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

export async function executeConfirmedDeleteBlocks(
  input: ExecuteConfirmedDeleteBlocksInput,
): Promise<ExecuteConfirmedDeleteBlocksResult> {
  const { confirmationId } = input;

  // 1. 读取 pending confirmation
  const confirmation = await getDocContentEditConfirmation(confirmationId);
  if (!confirmation) {
    return {
      ok: false,
      status: "failed",
      message: "确认信息不存在或已过期。",
      reasonCode: "confirmation_expired",
    };
  }

  // 2. 校验过期
  if (confirmation.expiresAt && confirmation.expiresAt <= Date.now()) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "确认信息已过期，未执行删除。",
      reasonCode: "confirmation_expired",
    };
  }

  // 3. 确认 action
  if (confirmation.action !== "delete_blocks") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "该操作类型不支持 delete_blocks 执行器。",
      reasonCode: "unknown_error",
    };
  }

  // 4. 从 toolInput 读取 blockIds
  const rawBlockIds = confirmation.toolInput.blockIds as string[] | undefined;
  if (!Array.isArray(rawBlockIds) || rawBlockIds.length === 0) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "确认信息缺少有效的 blockIds。",
      reasonCode: "target_not_found",
    };
  }

  const blockIds = rawBlockIds.map((id) => typeof id === "string" ? id.trim() : "").filter(Boolean);
  const requestedCount = blockIds.length;

  // 5. 再次确认所有块仍存在
  for (const blockId of blockIds) {
    try {
      const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(blockId)}'`);
      if (!rows || rows.length === 0) {
        await removeDocContentEditConfirmation(confirmationId);
        return {
          ok: false,
          status: "failed",
          message: `块 ${blockId} 已不存在，未执行批量删除。`,
          requestedCount,
          reasonCode: "target_not_found",
        };
      }
    } catch {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "无法查询目标块状态，未执行删除。",
        requestedCount,
        reasonCode: "unknown_error",
      };
    }
  }

  // 6. 如保存了 snapshots，逐个校验内容未变化（使用稳定化比较）
  const snapshots = confirmation.toolInput.snapshots as Array<{ blockId: string; kramdown: string }> | undefined;
  if (Array.isArray(snapshots)) {
    for (const snap of snapshots) {
      try {
        const currentRes = await getBlockKramdown(snap.blockId);
        const currentContent = currentRes?.kramdown ?? "";
        const currentStable = normalizeKramdownForStability(currentContent);
        const snapshotStable = normalizeKramdownForStability(snap.kramdown);
        if (currentStable !== snapshotStable) {
          await removeDocContentEditConfirmation(confirmationId);
          return {
            ok: false,
            status: "failed",
            message: `目标块内容已变化，未执行批量删除。`,
            requestedCount,
            reasonCode: "precondition_changed",
          };
        }
      } catch {
        await removeDocContentEditConfirmation(confirmationId);
        return {
          ok: false,
          status: "failed",
          message: "无法读取目标块当前内容，未执行删除。",
          requestedCount,
          reasonCode: "precondition_changed",
        };
      }
    }
  }

  // 7. 顺序删除每个块
  let deletedCount = 0;
  const deletedIds: string[] = [];
  const failedIds: string[] = [];

  for (const blockId of blockIds) {
    try {
      const deleteResult = await deleteBlock(blockId);
      if (deleteResult) {
        deletedCount++;
        deletedIds.push(blockId);
      } else {
        failedIds.push(blockId);
      }
    } catch {
      failedIds.push(blockId);
    }
  }

  await removeDocContentEditConfirmation(confirmationId);

  // 8. 返回结果
  if (failedIds.length === 0) {
    // 全部成功
    return {
      ok: true,
      status: "success",
      message: `已删除 ${deletedCount} 个内容块。`,
      target: {
        blockIds: deletedIds,
        docId: confirmation.target.docId,
        title: confirmation.target.title,
      },
      requestedCount,
      deletedCount,
    };
  }

  if (deletedCount > 0) {
    // 部分成功
    return {
      ok: false,
      status: "failed",
      message: `已删除 ${deletedCount} 个块，但 ${failedIds.length} 个块删除失败。部分块可能已删除，请重新读取文档确认当前状态。`,
      target: {
        blockIds: [...deletedIds, ...failedIds],
        docId: confirmation.target.docId,
        title: confirmation.target.title,
      },
      requestedCount,
      deletedCount,
      reasonCode: "partial_delete_failed",
    };
  }

  // 全部失败
  return {
    ok: false,
    status: "failed",
    message: "批量删除内容块失败。",
    target: {
      blockIds: failedIds,
      docId: confirmation.target.docId,
      title: confirmation.target.title,
    },
    requestedCount,
    deletedCount: 0,
    reasonCode: "delete_failed",
  };
}
