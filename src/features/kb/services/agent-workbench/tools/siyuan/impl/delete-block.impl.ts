import { sql, getBlockKramdown, getChildBlocks } from "../../../../../../../api";
import type { DeleteBlockInput, DeleteBlockOutput, PreparedDeleteBlockConfirmation } from "../contracts/delete-block.contract";
import { assessDocContentEditRisk } from "../../../../doc-content-edit/doc-content-edit-risk";
import { createRenderedSideBySideCompare, toDisplayMarkdownFromKramdown } from "../../../../doc-content-edit/doc-content-edit-diff";
import { createDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-service";
import { requestDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-bridge";
import { shouldRequireDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-policy";
import { executeConfirmedDeleteBlock } from "../../../../doc-content-edit/doc-content-edit-delete-block-executor";
import { removeDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-store";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

export interface DeleteBlockImplDeps extends SiyuanToolDeps {
  conversationId: string;
}

/**
 * 内部确认准备能力：生成 pending confirmation，不实际写入思源文档。
 */
export async function prepareDeleteBlockConfirmation(
  deps: DeleteBlockImplDeps,
  args: DeleteBlockInput,
): Promise<{ prepareResult: PreparedDeleteBlockConfirmation }> {
  const blockId = args.blockId.trim();

  // 1. 确认目标块存在
  const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(blockId)}'`);
  const block = rows[0] as Block | undefined;
  if (!block) {
    const prepareResult: PreparedDeleteBlockConfirmation = {
      confirmationId: "",
      action: "delete_block",
      target: { blockId },
      riskLevel: "high",
      message: "目标块不存在。",
    };
    return { prepareResult };
  }

  // 2. 读取当前内容（beforeSnapshot）
  let beforeSnapshot: string;
  let warnings: string[] = [];
  try {
    const kramdownRes = await getBlockKramdown(blockId);
    beforeSnapshot = kramdownRes?.kramdown ?? "";
  } catch {
    beforeSnapshot = (block as Block).markdown ?? (block as Block).content ?? "";
    warnings.push("无法读取块 kramdown，已回退到 markdown/content。");
  }

  // 3. 检查是否存在子块
  let hasChildren = false;
  try {
    const children = await getChildBlocks(blockId);
    if (Array.isArray(children) && children.length > 0) {
      hasChildren = true;
    }
  } catch {
    // 忽略查询失败，默认视为无子块
  }
  if (hasChildren) {
    warnings.push("该块包含子块，删除将同时删除其子块。");
  }

  // 4. afterSnapshot 为空，表示删除后无内容
  const afterSnapshot = "";

  // 5. 生成视觉对比：左侧显示将被删除的内容（标记为 removed），右侧为空
  const displayBefore = toDisplayMarkdownFromKramdown(beforeSnapshot);
  const visualCompare = {
    type: "rendered_side_by_side" as const,
    sideBySide: createRenderedSideBySideCompare(
      displayBefore,
      afterSnapshot,
      { maxLines: 200, maxChars: 15000 },
    ),
  };

  // 6. 风险评估
  const riskResult = assessDocContentEditRisk({
    operation: "delete_block",
    target: { blockId },
  });
  warnings = warnings.concat(riskResult.warnings);

  // 若包含子块，提升到 high
  let riskLevel = riskResult.riskLevel;
  if (hasChildren) {
    riskLevel = "high";
  }

  // 7. 创建 pending confirmation
  const confirmation = await createDocContentEditConfirmation({
    conversationId: deps.conversationId,
    action: "delete_block",
    toolName: "delete_block",
    toolInput: { blockId, summary: undefined },
    target: {
      blockId,
      docId: block.root_id,
      title: block.content?.slice(0, 100),
    },
    beforeSnapshot,
    afterSnapshot,
    visualCompare,
    riskLevel,
    warnings: warnings.length > 0 ? warnings : undefined,
  });

  const prepareResult: PreparedDeleteBlockConfirmation = {
    confirmationId: confirmation.id,
    action: "delete_block",
    target: {
      blockId,
      docId: block.root_id,
      title: block.content?.slice(0, 100),
    },
    riskLevel,
    warnings: warnings.length > 0 ? warnings : undefined,
    message: "内部确认已准备，等待 UI 流程处理。",
  };

  return { prepareResult };
}

/**
 * Planner-facing delete_block 执行器。
 * 内部触发确认弹窗，用户确认后删除，最终返回成功/拒绝/失败结果。
 */
export async function executeDeleteBlock(
  deps: DeleteBlockImplDeps,
  args: DeleteBlockInput,
): Promise<{ output: DeleteBlockOutput }> {
  const blockId = args.blockId.trim();

  // 1. 准备内部 confirmation
  let prepareResult: PreparedDeleteBlockConfirmation;
  try {
    const prepare = await prepareDeleteBlockConfirmation(deps, args);
    prepareResult = prepare.prepareResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: {
        status: "failed",
        message,
        target: { blockId },
      },
    };
  }

  // 2. 若准备阶段已发现目标不存在，直接返回失败
  if (!prepareResult.confirmationId) {
    return {
      output: {
        status: "failed",
        message: prepareResult.message || "删除准备失败。",
        target: prepareResult.target,
      },
    };
  }

  const confirmationId = prepareResult.confirmationId;
  const target = prepareResult.target;

  // 3. 请求用户确认（内部桥接 UI 弹窗）
  const requireConfirmation = shouldRequireDocContentEditConfirmation(
    deps.getSettings?.(),
    "delete_block",
  );

  if (requireConfirmation) {
    const confirmationRes = await requestDocContentEditConfirmation({
      confirmationId,
      action: "delete_block",
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
  const execRes = await executeConfirmedDeleteBlock({ confirmationId });

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
