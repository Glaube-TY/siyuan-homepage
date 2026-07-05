import type { DeleteDocInput, DeleteDocOutput, PreparedDeleteDocConfirmation } from "../contracts/delete-doc.contract";
import { assessDocContentEditRisk } from "../../../../doc-content-edit/doc-content-edit-risk";
import { createArrowFlowCompare } from "../../../../doc-content-edit/doc-content-edit-diff";
import { createDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-service";
import { requestDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-bridge";
import { shouldRequireDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-policy";
import { executeConfirmedDeleteDoc } from "../../../../doc-content-edit/doc-content-edit-delete-doc-executor";
import { removeDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-store";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type { DocContentEditArrowFlow } from "../../../../doc-content-edit/doc-content-edit-types";
import { sql } from "../../../../../../../api";

export interface DeleteDocImplDeps extends SiyuanToolDeps {
  conversationId: string;
}

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

const PROTECTED_DIARY_DOC_MARKER = /custom-dailynote-\d{8}/;

/**
 * 检查文档是否为强化日记管理文档（日/周/月/年记）。
 * 优先使用思源 daily note 属性标记 custom-dailynote-YYYYMMDD，避免全库正文 LIKE。
 */
async function checkIsProtectedDiaryDoc(docId: string): Promise<{ protected: boolean; reason?: string }> {
  const rows = await sql(`SELECT id, type, ial, content FROM blocks WHERE id = '${escapeSqlId(docId)}' LIMIT 1`);
  const block = rows[0] as { id?: string; type?: string; ial?: string; content?: string } | undefined;
  if (!block) {
    return { protected: false };
  }
  if (block.type !== "d") {
    return { protected: false };
  }
  const ial = block.ial || "";
  if (PROTECTED_DIARY_DOC_MARKER.test(ial)) {
    return {
      protected: true,
      reason: `文档 "${block.content || docId}" 是强化日记管理文档（ial 含 custom-dailynote 标记），Agent 不允许通过 delete_doc 删除。`,
    };
  }
  return { protected: false };
}

/**
 * 内部确认准备能力：生成 pending confirmation，不实际写入思源文档。
 */
export async function prepareDeleteDocConfirmation(
  deps: DeleteDocImplDeps,
  args: DeleteDocInput,
): Promise<{ prepareResult: PreparedDeleteDocConfirmation }> {
  const docId = args.docId.trim();

  // 0. 强化日记文档硬保护：必须在确认弹窗出现前拦截
  const protection = await checkIsProtectedDiaryDoc(docId);
  if (protection.protected) {
    const prepareResult: PreparedDeleteDocConfirmation = {
      confirmationId: "",
      action: "delete_doc",
      target: { docId },
      riskLevel: "high",
      errorCode: "protected_diary_doc_delete_blocked",
      message: protection.reason || "这是强化日记管理文档，Agent 不允许通过 delete_doc 删除。请在思源 UI 或专门的回收/恢复流程中处理。",
    };
    return { prepareResult };
  }

  // 1. 确认目标文档存在并读取当前标题
  const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(docId)}' AND type = 'd'`);
  const block = rows[0] as Block | undefined;
  if (!block) {
    const prepareResult: PreparedDeleteDocConfirmation = {
      confirmationId: "",
      action: "delete_doc",
      target: { docId },
      riskLevel: "high",
      message: "目标文档不存在。",
    };
    return { prepareResult };
  }

  const title = block.content || block.name || "";

  // 2. 风险评估
  const riskResult = assessDocContentEditRisk({
    operation: "delete_doc",
    target: { docId },
  });

  // 3. 生成 arrow_flow 视觉对比
  const arrow: DocContentEditArrowFlow = createArrowFlowCompare(
    title || "未命名",
    "删除",
    { fromDescription: `文档 ID: ${docId}`, toDescription: "文档将被永久删除" },
  );
  const visualCompare = {
    type: "arrow_flow" as const,
    arrow,
  };

  // 4. 创建 pending confirmation
  const confirmation = await createDocContentEditConfirmation({
    conversationId: deps.conversationId,
    action: "delete_doc",
    toolName: "delete_doc",
    toolInput: { docId, summary: undefined },
    target: {
      docId,
      title,
    },
    beforeSnapshot: title,
    afterSnapshot: "",
    visualCompare,
    riskLevel: riskResult.riskLevel,
    warnings: riskResult.warnings.length > 0 ? riskResult.warnings : undefined,
  });

  const prepareResult: PreparedDeleteDocConfirmation = {
    confirmationId: confirmation.id,
    action: "delete_doc",
    target: {
      docId,
      title,
    },
    riskLevel: riskResult.riskLevel,
    warnings: riskResult.warnings.length > 0 ? riskResult.warnings : undefined,
    message: "内部确认已准备，等待 UI 流程处理。",
  };

  return { prepareResult };
}

/**
 * Agent-facing delete_doc 执行器。
 * 内部触发确认弹窗，用户确认后删除，最终返回成功/拒绝/失败结果。
 */
export async function executeDeleteDoc(
  deps: DeleteDocImplDeps,
  args: DeleteDocInput,
): Promise<{ output: DeleteDocOutput }> {
  const docId = args.docId.trim();

  // 1. 前置校验
  if (!docId) {
    return {
      output: {
        status: "failed",
        message: "参数无效：docId 不能为空。",
        target: { docId },
      },
    };
  }

  // 2. 准备内部 confirmation
  let prepareResult: PreparedDeleteDocConfirmation;
  try {
    const prepare = await prepareDeleteDocConfirmation(deps, args);
    prepareResult = prepare.prepareResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: {
        status: "failed",
        message,
        target: { docId },
      },
    };
  }

  // 若目标文档不存在或被安全策略拦截，prepareResult.confirmationId 为空字符串
  if (!prepareResult.confirmationId) {
    return {
      output: {
        status: "failed",
        message: prepareResult.message,
        target: { docId },
        errorCode: prepareResult.errorCode,
      },
    };
  }

  const confirmationId = prepareResult.confirmationId;
  const target = prepareResult.target;

  // 3. 请求用户确认（内部桥接 UI 弹窗）
  const requireConfirmation = shouldRequireDocContentEditConfirmation(
    deps.getSettings?.(),
    "delete_doc",
  );

  if (requireConfirmation) {
    const confirmationRes = await requestDocContentEditConfirmation({
      confirmationId,
      action: "delete_doc",
      abortSignal: deps.abortSignal,
    });

    // 4. 用户拒绝
    if (confirmationRes.status === "rejected") {
      await removeDocContentEditConfirmation(confirmationId);
      return {
        output: {
          status: "rejected",
          message: confirmationRes.message || "用户已拒绝操作。",
          target,
        },
      };
    }
  }

  // 5. 用户确认（或跳过确认），执行真实删除
  const execRes = await executeConfirmedDeleteDoc({ confirmationId });

  if (execRes.ok && execRes.status === "success") {
    return {
      output: {
        status: "success",
        message: execRes.message,
        target: execRes.target ?? target,
      },
    };
  }

  return {
    output: {
      status: "failed",
      message: execRes.message,
      target,
    },
  };
}
