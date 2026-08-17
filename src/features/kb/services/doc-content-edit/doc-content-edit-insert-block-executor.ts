/**
 * insert_block 内部确认执行服务。
 * 仅在用户通过 UI 弹窗确认后调用，不暴露给 Agent。
 * 真实写入统一走 src/api.ts 的 insertBlock wrapper。
 */
import { insertBlock } from "../../../../api";
import {
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
} from "./doc-content-edit-confirmation-store";
import { resolveDocEditBlock } from "./doc-content-edit-block-resolver";

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

  // 5. 再次确认目标块真实存在：SQL miss 不等同于块不存在。
  const referenceResolution = await resolveDocEditBlock(referenceBlockId);
  if (referenceResolution.status !== "exists") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: referenceResolution.status === "missing"
        ? "参考块已不存在，未执行插入。"
        : "无法确认参考块状态，未执行插入。",
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

  const operationGroups = res as Array<{ doOperations?: Array<{ action?: string; id?: string }> }>;
  const operations = operationGroups.flatMap((group) => Array.isArray(group?.doOperations) ? group.doOperations : []);
  const insertedOperation = operations.find((operation) => operation.action === "insert" && typeof operation.id === "string" && operation.id.trim())
    ?? operations.find((operation) => typeof operation.id === "string" && operation.id.trim());
  const insertedBlockId = insertedOperation?.id?.trim();
  if (!insertedBlockId) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "内容已提交，但未能确认真实 insertedBlockId。",
    };
  }

  // 写入成功以内核操作返回为主；SQL 索引未同步不能阻断成功结果。
  const insertedResolution = await resolveDocEditBlock(insertedBlockId);
  if (insertedResolution.status !== "exists") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: insertedResolution.status === "missing"
        ? "内容已提交，但新块已无法读取，未能确认写入结果。"
        : "内容已提交，但暂时无法确认新块可读性。",
      target: {
        referenceBlockId,
        position,
        insertedBlockId,
        docId: confirmation.target.docId,
        title: confirmation.target.title,
      },
    };
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
