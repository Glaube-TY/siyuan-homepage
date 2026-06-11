/**
 * replace_doc_content 内部确认执行服务。
 * 仅在用户通过 UI 弹窗确认后调用，不暴露给 Planner。
 * 真实写入统一走 src/api.ts 的 updateBlock wrapper。
 */
import { updateBlock, getBlockKramdown, sql } from "../../../../api";
import {
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
} from "./doc-content-edit-confirmation-store";
import { normalizeKramdownForStability } from "./doc-content-edit-diff";

export interface ExecuteConfirmedReplaceDocContentInput {
  confirmationId: string;
}

export interface ExecuteConfirmedReplaceDocContentResult {
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

export async function executeConfirmedReplaceDocContent(
  input: ExecuteConfirmedReplaceDocContentInput,
): Promise<ExecuteConfirmedReplaceDocContentResult> {
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
      message: "确认信息已过期，未执行替换。",
    };
  }

  // 3. 确认 action
  if (confirmation.action !== "replace_doc_content") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "该操作类型不支持 replace_doc_content 执行器。",
    };
  }

  // 4. 从 toolInput 读取参数并防御校验
  const rawDocId = confirmation.toolInput.docId as string | undefined;
  const rawMarkdown = confirmation.toolInput.markdown as string | undefined;
  const docId = typeof rawDocId === "string" ? rawDocId.trim() : "";
  const markdown = typeof rawMarkdown === "string" ? rawMarkdown : "";

  if (!docId) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "确认信息缺少有效的 docId。",
    };
  }

  // 5. 再次确认目标文档存在
  let currentTitle: string | undefined;
  try {
    const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(docId)}' AND type = 'd'`);
    const block = rows[0] as Block | undefined;
    if (!block) {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "目标文档已不存在，未执行替换。",
      };
    }
    currentTitle = block.content || block.name || undefined;
  } catch {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "无法读取目标文档当前状态，未执行替换。",
    };
  }

  // 5.5 标题一致性校验：若确认时记录了标题且当前标题已变化，则拒绝执行
  const confirmedTitle = confirmation.target?.title;
  if (confirmedTitle !== undefined && confirmedTitle !== currentTitle) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "目标文档标题已变化，未执行替换。",
    };
  }

  // 6. 执行前重新读取当前 kramdown，校验正文一致性（稳定化后比较）
  const beforeSnapshot = confirmation.beforeSnapshot ?? "";
  try {
    const currentRes = await getBlockKramdown(docId);
    const currentContent = currentRes?.kramdown ?? "";
    if (normalizeKramdownForStability(currentContent) !== normalizeKramdownForStability(beforeSnapshot)) {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "文档内容已变化，未执行替换。",
      };
    }
  } catch {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "无法读取目标文档当前内容，未执行替换。",
    };
  }

  // 7. 调用 updateBlock 执行真实写入
  let updateResult: unknown;
  try {
    updateResult = await updateBlock("markdown", markdown, docId);
  } catch (err) {
    await removeDocContentEditConfirmation(confirmationId);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      message: `文档内容替换失败：${message}`,
    };
  }

  // updateBlock 基于旧 request() 语义，code !== 0 时返回 null
  if (!updateResult) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "文档内容替换失败。",
    };
  }

  await removeDocContentEditConfirmation(confirmationId);
  return {
    ok: true,
    status: "success",
    message: "文档正文已替换。",
    target: {
      docId,
      title: currentTitle,
    },
  };
}
