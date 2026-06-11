/**
 * update_block 内部确认执行服务。
 * 仅在用户通过 UI 弹窗确认后调用，不暴露给 Planner。
 * 真实写入统一走 src/api.ts 的 updateBlock wrapper。
 */
import { updateBlock, getBlockKramdown } from "../../../../api";
import {
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
} from "./doc-content-edit-confirmation-store";

export interface ExecuteConfirmedUpdateBlockInput {
  confirmationId: string;
}

export interface ExecuteConfirmedUpdateBlockResult {
  ok: boolean;
  status: "success" | "rejected" | "failed";
  message: string;
}

export async function executeConfirmedUpdateBlock(
  input: ExecuteConfirmedUpdateBlockInput,
): Promise<ExecuteConfirmedUpdateBlockResult> {
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
      message: "确认信息已过期，未执行修改。",
    };
  }

  // 3. 确认 action
  if (confirmation.action !== "update_block") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "该操作类型不支持 update_block 执行器。",
    };
  }

  // 4. 从 toolInput 读取参数
  const blockId = confirmation.toolInput.blockId as string | undefined;
  const markdown = confirmation.toolInput.markdown as string | undefined;
  if (!blockId || typeof markdown !== "string") {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "确认信息缺少 blockId 或 markdown。",
    };
  }

  // 5. 执行前重新读取当前内容，校验一致性
  try {
    const currentRes = await getBlockKramdown(blockId);
    const currentContent = currentRes?.kramdown ?? "";
    const beforeSnapshot = confirmation.beforeSnapshot ?? "";

    if (currentContent !== beforeSnapshot) {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        ok: false,
        status: "failed",
        message: "文档内容已变化，未执行修改。",
      };
    }
  } catch {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "无法读取目标块当前内容，未执行修改。",
    };
  }

  // 6. 调用 updateBlock 执行真实写入
  let updateResult: unknown;
  try {
    updateResult = await updateBlock("markdown", markdown, blockId);
  } catch (err) {
    await removeDocContentEditConfirmation(confirmationId);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "failed",
      message: `写入失败：${message}`,
    };
  }

  if (!updateResult) {
    await removeDocContentEditConfirmation(confirmationId);
    return {
      ok: false,
      status: "failed",
      message: "块内容更新失败。",
    };
  }

  // 7. 成功后清理 confirmation
  await removeDocContentEditConfirmation(confirmationId);

  return {
    ok: true,
    status: "success",
    message: "块内容已更新。",
  };
}
