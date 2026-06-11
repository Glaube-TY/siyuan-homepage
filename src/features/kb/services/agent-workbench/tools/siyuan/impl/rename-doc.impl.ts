import type { RenameDocInput, RenameDocOutput, PreparedRenameDocConfirmation } from "../contracts/rename-doc.contract";
import { assessDocContentEditRisk } from "../../../../doc-content-edit/doc-content-edit-risk";
import { createArrowFlowCompare } from "../../../../doc-content-edit/doc-content-edit-diff";
import { createDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-service";
import { requestDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-bridge";
import { shouldRequireDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-policy";
import { executeConfirmedRenameDoc } from "../../../../doc-content-edit/doc-content-edit-rename-doc-executor";
import { removeDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-store";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type { DocContentEditArrowFlow } from "../../../../doc-content-edit/doc-content-edit-types";
import { sql } from "../../../../../../../api";

export interface RenameDocImplDeps extends SiyuanToolDeps {
  conversationId: string;
}

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

/**
 * 内部确认准备能力：生成 pending confirmation，不实际写入思源文档。
 */
export async function prepareRenameDocConfirmation(
  deps: RenameDocImplDeps,
  args: RenameDocInput,
): Promise<{ prepareResult: PreparedRenameDocConfirmation }> {
  const docId = args.docId.trim();
  const title = args.title.trim();

  // 1. 确认目标文档存在并读取当前标题
  const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(docId)}' AND type = 'd'`);
  const block = rows[0] as Block | undefined;
  if (!block) {
    const prepareResult: PreparedRenameDocConfirmation = {
      confirmationId: "",
      action: "rename_doc",
      target: { docId, title },
      riskLevel: "high",
      message: "目标文档不存在。",
    };
    return { prepareResult };
  }

  const previousTitle = block.content || block.name || "";

  // 2. 风险评估
  const riskResult = assessDocContentEditRisk({
    operation: "rename_doc",
    target: { docId },
  });

  // 3. 生成 arrow_flow 视觉对比
  const arrow: DocContentEditArrowFlow = createArrowFlowCompare(
    previousTitle || "未命名",
    title,
    { fromDescription: `文档 ID: ${docId}`, toDescription: `重命名为: ${title}` },
  );
  const visualCompare = {
    type: "arrow_flow" as const,
    arrow,
  };

  // 4. 创建 pending confirmation
  const confirmation = await createDocContentEditConfirmation({
    conversationId: deps.conversationId,
    action: "rename_doc",
    toolName: "rename_doc",
    toolInput: { docId, title, summary: undefined },
    target: {
      docId,
      title,
    },
    beforeSnapshot: previousTitle,
    visualCompare,
    riskLevel: riskResult.riskLevel,
    warnings: riskResult.warnings.length > 0 ? riskResult.warnings : undefined,
  });

  const prepareResult: PreparedRenameDocConfirmation = {
    confirmationId: confirmation.id,
    action: "rename_doc",
    target: {
      docId,
      title,
      previousTitle,
    },
    riskLevel: riskResult.riskLevel,
    warnings: riskResult.warnings.length > 0 ? riskResult.warnings : undefined,
    message: "内部确认已准备，等待 UI 流程处理。",
  };

  return { prepareResult };
}

/**
 * Planner-facing rename_doc 执行器。
 * 内部触发确认弹窗，用户确认后重命名，最终返回成功/拒绝/失败结果。
 */
export async function executeRenameDoc(
  deps: RenameDocImplDeps,
  args: RenameDocInput,
): Promise<{ output: RenameDocOutput }> {
  const docId = args.docId.trim();
  const title = args.title.trim();

  // 1. 前置校验
  if (!docId || !title) {
    return {
      output: {
        status: "failed",
        message: "参数无效：docId 和 title 不能为空。",
        target: { docId, title },
      },
    };
  }

  // 2. 准备内部 confirmation
  let prepareResult: PreparedRenameDocConfirmation;
  try {
    const prepare = await prepareRenameDocConfirmation(deps, args);
    prepareResult = prepare.prepareResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: {
        status: "failed",
        message,
        target: { docId, title },
      },
    };
  }

  // 若目标文档不存在，prepareResult.confirmationId 为空字符串
  if (!prepareResult.confirmationId) {
    return {
      output: {
        status: "failed",
        message: prepareResult.message,
        target: { docId, title },
      },
    };
  }

  const confirmationId = prepareResult.confirmationId;
  const target = prepareResult.target;

  // 3. 请求用户确认（内部桥接 UI 弹窗）
  const requireConfirmation = shouldRequireDocContentEditConfirmation(
    deps.getSettings?.(),
    "rename_doc",
  );

  if (requireConfirmation) {
    const confirmationRes = await requestDocContentEditConfirmation({
      confirmationId,
      action: "rename_doc",
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

  // 5. 用户确认（或跳过确认），执行真实重命名
  const execRes = await executeConfirmedRenameDoc({ confirmationId });

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
