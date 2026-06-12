import { sql, getBlockKramdown } from "../../../../../../../api";
import type { MoveBlockInput, MoveBlockOutput, PreparedMoveBlockConfirmation } from "../contracts/move-block.contract";
import { assessDocContentEditRisk } from "../../../../doc-content-edit/doc-content-edit-risk";
import { createDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-service";
import { requestDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-bridge";
import { shouldRequireDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-policy";
import { executeConfirmedMoveBlock } from "../../../../doc-content-edit/doc-content-edit-move-block-executor";
import { removeDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-store";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type { DocContentEditArrowFlow } from "../../../../doc-content-edit/doc-content-edit-types";

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

export interface MoveBlockImplDeps extends SiyuanToolDeps {
  conversationId: string;
}

/**
 * 内部确认准备能力：生成 pending confirmation，不实际写入思源文档。
 */
export async function prepareMoveBlockConfirmation(
  deps: MoveBlockImplDeps,
  args: MoveBlockInput,
): Promise<{ prepareResult: PreparedMoveBlockConfirmation }> {
  const blockId = args.blockId.trim();
  const previousID = args.previousID?.trim();
  const parentID = args.parentID?.trim();

  // 1. 确认目标块存在
  const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(blockId)}'`);
  const block = rows[0] as Block | undefined;
  if (!block) {
    const prepareResult: PreparedMoveBlockConfirmation = {
      confirmationId: "",
      action: "move_block",
      target: { blockId, previousID, parentID },
      riskLevel: "high",
      message: "目标块不存在。",
    };
    return { prepareResult };
  }

  // 2. 若提供了 previousID，确认其存在，且不能是 blockId 的子孙块
  if (previousID) {
    const prevRows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(previousID)}'`);
    if (!prevRows[0]) {
      const prepareResult: PreparedMoveBlockConfirmation = {
        confirmationId: "",
        action: "move_block",
        target: { blockId, previousID, parentID },
        riskLevel: "high",
        message: "目标 previousID 不存在。",
      };
      return { prepareResult };
    }
    if (await isDescendantOf(previousID, blockId)) {
      const prepareResult: PreparedMoveBlockConfirmation = {
        confirmationId: "",
        action: "move_block",
        target: { blockId, previousID, parentID },
        riskLevel: "high",
        message: "目标 previousID 是 blockId 的子孙块，不能移动到自身子孙块之后。",
      };
      return { prepareResult };
    }
  }

  // 3. 若提供了 parentID，确认其存在，且不能是 blockId 的子孙块
  if (parentID) {
    const parentRows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(parentID)}'`);
    if (!parentRows[0]) {
      const prepareResult: PreparedMoveBlockConfirmation = {
        confirmationId: "",
        action: "move_block",
        target: { blockId, previousID, parentID },
        riskLevel: "high",
        message: "目标 parentID 不存在。",
      };
      return { prepareResult };
    }
    if (await isDescendantOf(parentID, blockId)) {
      const prepareResult: PreparedMoveBlockConfirmation = {
        confirmationId: "",
        action: "move_block",
        target: { blockId, previousID, parentID },
        riskLevel: "high",
        message: "目标 parentID 是 blockId 的子孙块，不能移动到自身子孙块之下。",
      };
      return { prepareResult };
    }
  }

  // 4. 读取当前内容（beforeSnapshot）
  let beforeSnapshot: string;
  let warnings: string[] = [];
  try {
    const kramdownRes = await getBlockKramdown(blockId);
    beforeSnapshot = kramdownRes?.kramdown ?? "";
  } catch {
    beforeSnapshot = (block as Block).markdown ?? (block as Block).content ?? "";
    warnings.push("无法读取块 kramdown，已回退到 markdown/content。");
  }

  // 5. afterSnapshot 与 beforeSnapshot 相同（移动不改变内容）
  const afterSnapshot = beforeSnapshot;

  // 6. 生成 arrow_flow 视觉对比
  const blockLabel = (block as Block).content?.slice(0, 50) || blockId;
  const toLabel = previousID ? `after ${previousID}` : `under ${parentID}`;
  const arrow: DocContentEditArrowFlow = {
    fromLabel: blockLabel,
    toLabel,
    fromDescription: "当前位置",
    toDescription: previousID ? "移动到该块之后" : "移动到该块之下",
  };
  const visualCompare = {
    type: "arrow_flow" as const,
    arrow,
  };

  // 7. 风险评估
  const riskResult = assessDocContentEditRisk({
    operation: "move_block",
    target: { blockId },
  });
  warnings = warnings.concat(riskResult.warnings);

  // 8. 创建 pending confirmation
  const confirmation = await createDocContentEditConfirmation({
    conversationId: deps.conversationId,
    action: "move_block",
    toolName: "move_block",
    toolInput: { blockId, previousID, parentID, summary: undefined },
    target: {
      blockId,
      previousID,
      parentID,
      docId: block.root_id,
      title: block.content?.slice(0, 100),
    },
    beforeSnapshot,
    afterSnapshot,
    visualCompare,
    riskLevel: riskResult.riskLevel,
    warnings: warnings.length > 0 ? warnings : undefined,
  });

  const prepareResult: PreparedMoveBlockConfirmation = {
    confirmationId: confirmation.id,
    action: "move_block",
    target: {
      blockId,
      previousID,
      parentID,
      docId: block.root_id,
      title: block.content?.slice(0, 100),
    },
    riskLevel: riskResult.riskLevel,
    warnings: warnings.length > 0 ? warnings : undefined,
    message: "内部确认已准备，等待 UI 流程处理。",
  };

  return { prepareResult };
}

/**
 * Agent-facing move_block 执行器。
 * 内部触发确认弹窗，用户确认后移动，最终返回成功/拒绝/失败结果。
 */
export async function executeMoveBlock(
  deps: MoveBlockImplDeps,
  args: MoveBlockInput,
): Promise<{ output: MoveBlockOutput }> {
  const blockId = args.blockId.trim();

  // 1. 准备内部 confirmation
  let prepareResult: PreparedMoveBlockConfirmation;
  try {
    const prepare = await prepareMoveBlockConfirmation(deps, args);
    prepareResult = prepare.prepareResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: {
        status: "failed",
        message,
        target: { blockId, previousID: args.previousID, parentID: args.parentID },
      },
    };
  }

  // 2. 若准备阶段已发现目标不存在，直接返回失败
  if (!prepareResult.confirmationId) {
    return {
      output: {
        status: "failed",
        message: prepareResult.message || "移动准备失败。",
        target: prepareResult.target,
      },
    };
  }

  const confirmationId = prepareResult.confirmationId;
  const target = prepareResult.target;

  // 3. 请求用户确认（内部桥接 UI 弹窗）
  const requireConfirmation = shouldRequireDocContentEditConfirmation(
    deps.getSettings?.(),
    "move_block",
  );

  if (requireConfirmation) {
    const confirmationRes = await requestDocContentEditConfirmation({
      confirmationId,
      action: "move_block",
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

  // 5. 用户确认（或跳过确认），执行真实移动
  const execRes = await executeConfirmedMoveBlock({ confirmationId });

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
