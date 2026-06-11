/**
 * insert_block 内部确认执行服务。
 * 仅在用户通过 UI 弹窗确认后调用，不暴露给 Planner。
 * 真实写入统一走 src/api.ts 的 insertBlock wrapper。
 */
import { sql, insertBlock } from "../../../../api";
import {
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
} from "./doc-content-edit-confirmation-store";

export interface ExecuteConfirmedInsertBlockInput {
  confirmationId: string;
}

export interface ExecuteConfirmedInsertBlockResult {
  ok: boolean;
  status: "success" | "rejected" | "failed";
  message: string;
  target?: {
    referenceBlockId: string;
    position: "before" | "after" | "child";
    insertedBlockId?: string;
    docId?: string;
    title?: string;
  };
}

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

export async function executeConfirmedInsertBlock(
  input: ExecuteConfirmedInsertBlockInput,
): Promise<ExecuteConfirmedInsertBlockResult> {
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
      message: "确认信息已过期，未执行插入。",
    };
  }

  // 3. 确认 action
  if (confirmation.action !== "insert_block") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "该操作类型不支持 insert_block 执行器。",
    };
  }

  // 4. 从 toolInput 读取参数并防御校验
  const rawReferenceBlockId = confirmation.toolInput.referenceBlockId as string | undefined;
  const rawPosition = confirmation.toolInput.position as string | undefined;
  const rawMarkdown = confirmation.toolInput.markdown as string | undefined;
  const referenceBlockId = typeof rawReferenceBlockId === "string" ? rawReferenceBlockId.trim() : "";
  const markdown = typeof rawMarkdown === "string" ? rawMarkdown : "";
  const isInsertBlockPosition =
    rawPosition === "before" || rawPosition === "after" || rawPosition === "child";
  const position = isInsertBlockPosition ? rawPosition : undefined;
  if (!referenceBlockId || !position || markdown.trim() === "") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: isInsertBlockPosition
        ? "确认信息缺少有效的 referenceBlockId 或 markdown。"
        : "确认信息缺少有效的 position。",
    };
  }

  // 5. 再次确认目标块存在
  try {
    const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(referenceBlockId)}'`);
    const block = rows[0] as Block | undefined;
    if (!block) {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "参考块已不存在，未执行插入。",
      };
    }
  } catch {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "无法查询参考块，未执行插入。",
    };
  }

  // 6. 根据 position 映射 insertBlock 参数
  let res: unknown;
  try {
    if (position === "before") {
      res = await insertBlock("markdown", markdown, referenceBlockId, undefined, undefined);
    } else if (position === "after") {
      res = await insertBlock("markdown", markdown, undefined, referenceBlockId, undefined);
    } else {
      // child
      res = await insertBlock("markdown", markdown, undefined, undefined, referenceBlockId);
    }
  } catch (err) {
    await removeDocContentEditConfirmation(confirmationId);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      message: `写入失败：${message}`,
    };
  }

  // 7. 校验并提取 insertedBlockId
  if (!Array.isArray(res) || res.length === 0) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "内容插入失败。",
    };
  }

  let insertedBlockId: string | undefined;
  const ops = (res[0] as { doOperations?: Array<{ id?: string }> })?.doOperations;
  if (Array.isArray(ops) && ops.length > 0) {
    insertedBlockId = ops[0]?.id ?? undefined;
  }

  // 8. 成功后清理 confirmation
  await removeDocContentEditConfirmation(confirmationId);

  return {
    ok: true,
    status: "success",
    message: "内容已插入。",
    target: {
      referenceBlockId,
      position,
      insertedBlockId,
      docId: confirmation.target.docId,
      title: confirmation.target.title,
    },
  };
}
