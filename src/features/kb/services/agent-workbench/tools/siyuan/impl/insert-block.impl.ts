import { sql, getBlockKramdown } from "../../../../../../../api";
import type { InsertBlockInput, InsertBlockOutput, PreparedInsertBlockConfirmation } from "../contracts/insert-block.contract";
import { assessDocContentEditRisk } from "../../../../doc-content-edit/doc-content-edit-risk";
import { createRenderedSideBySideCompare, toDisplayMarkdownFromKramdown } from "../../../../doc-content-edit/doc-content-edit-diff";
import { createDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-service";
import { requestDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-bridge";
import { shouldRequireDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-policy";
import { executeConfirmedInsertBlock } from "../../../../doc-content-edit/doc-content-edit-insert-block-executor";
import { removeDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-store";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

export interface InsertBlockImplDeps extends SiyuanToolDeps {
  conversationId: string;
}

/**
 * 内部确认准备能力：生成 pending confirmation，不实际写入思源文档。
 */
export async function prepareInsertBlockConfirmation(
  deps: InsertBlockImplDeps,
  args: InsertBlockInput,
): Promise<{ prepareResult: PreparedInsertBlockConfirmation }> {
  const referenceBlockId = args.referenceBlockId.trim();
  const position = args.position;
  const markdown = args.markdown;

  // 1. 确认目标块存在
  const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(referenceBlockId)}'`);
  const block = rows[0] as Block | undefined;
  if (!block) {
    const prepareResult: PreparedInsertBlockConfirmation = {
      confirmationId: "",
      action: "insert_block",
      target: { referenceBlockId, position },
      riskLevel: "high",
      message: "参考块不存在。",
    };
    return { prepareResult };
  }

  // 2. beforeSnapshot：参考块内容（用于展示上下文）
  let beforeSnapshot: string;
  let warnings: string[] = [];
  try {
    const kramdownRes = await getBlockKramdown(referenceBlockId);
    beforeSnapshot = kramdownRes?.kramdown ?? "";
  } catch {
    beforeSnapshot = (block as Block).markdown ?? (block as Block).content ?? "";
    warnings.push("无法读取参考块 kramdown，已回退到 markdown/content。");
  }

  // 3. afterSnapshot 用于展示：参考块上下文 + 新增内容
  const displayBefore = toDisplayMarkdownFromKramdown(beforeSnapshot);
  const positionLabel = position === "before" ? "上方" : position === "after" ? "下方" : "子块";
  const afterSnapshot = displayBefore + `\n<!-- 新内容将插入到${positionLabel} -->\n` + markdown;

  // 4. 生成视觉对比
  const visualCompare = {
    type: "rendered_side_by_side" as const,
    sideBySide: createRenderedSideBySideCompare(
      displayBefore,
      afterSnapshot,
      { maxLines: 200, maxChars: 15000 },
    ),
  };

  // 5. 风险评估
  const riskResult = assessDocContentEditRisk({
    operation: "insert_block",
    target: { referenceBlockId },
    markdownLength: markdown.length,
  });
  warnings = warnings.concat(riskResult.warnings);

  // 6. 创建 pending confirmation
  const confirmation = await createDocContentEditConfirmation({
    conversationId: deps.conversationId,
    action: "insert_block",
    toolName: "insert_block",
    toolInput: { referenceBlockId, position, markdown, summary: undefined },
    target: {
      referenceBlockId,
      docId: block.root_id,
      title: block.content?.slice(0, 100),
    },
    beforeSnapshot,
    afterSnapshot,
    visualCompare,
    riskLevel: riskResult.riskLevel,
    warnings: warnings.length > 0 ? warnings : undefined,
  });

  const prepareResult: PreparedInsertBlockConfirmation = {
    confirmationId: confirmation.id,
    action: "insert_block",
    target: {
      referenceBlockId,
      position,
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
 * Planner-facing insert_block 执行器。
 * 内部触发确认弹窗，用户确认后写入，最终返回成功/拒绝/失败结果。
 */
export async function executeInsertBlock(
  deps: InsertBlockImplDeps,
  args: InsertBlockInput,
): Promise<{ output: InsertBlockOutput }> {
  const referenceBlockId = args.referenceBlockId.trim();
  const position = args.position;
  const markdown = args.markdown;

  if (typeof markdown !== "string" || markdown.trim() === "") {
    return {
      output: {
        status: "failed",
        message: "插入内容不能为空。",
        target: { referenceBlockId, position },
      },
    };
  }

  let prepareResult: PreparedInsertBlockConfirmation;
  try {
    const prepare = await prepareInsertBlockConfirmation(deps, args);
    prepareResult = prepare.prepareResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: {
        status: "failed",
        message,
        target: { referenceBlockId, position },
      },
    };
  }

  // 若准备阶段已发现参考块不存在，直接返回失败
  if (prepareResult.message === "参考块不存在。") {
    return {
      output: {
        status: "failed",
        message: "参考块不存在。",
        target: { referenceBlockId, position },
      },
    };
  }

  const confirmationId = prepareResult.confirmationId;
  const target = prepareResult.target;

  const requireConfirmation = shouldRequireDocContentEditConfirmation(
    deps.getSettings?.(),
    "insert_block",
  );

  if (requireConfirmation) {
    const confirmationRes = await requestDocContentEditConfirmation({
      confirmationId,
      action: "insert_block",
    });

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

  const execRes = await executeConfirmedInsertBlock({ confirmationId });

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
