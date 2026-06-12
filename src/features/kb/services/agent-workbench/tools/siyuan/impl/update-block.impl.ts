import { sql, getBlockKramdown } from "../../../../../../../api";
import type { UpdateBlockInput, UpdateBlockOutput, PreparedUpdateBlockConfirmation } from "../contracts/update-block.contract";
import { assessDocContentEditRisk } from "../../../../doc-content-edit/doc-content-edit-risk";
import { createRenderedSideBySideCompare, toDisplayMarkdownFromKramdown } from "../../../../doc-content-edit/doc-content-edit-diff";
import { createDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-service";
import { requestDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-bridge";
import { shouldRequireDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-policy";
import { executeConfirmedUpdateBlock } from "../../../../doc-content-edit/doc-content-edit-update-block-executor";
import { removeDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-store";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

export interface UpdateBlockImplDeps extends SiyuanToolDeps {
  conversationId: string;
}

/**
 * 内部确认准备能力：生成 pending confirmation，不实际写入思源文档。
 * 当前不注册为 Agent-facing 工具；confirmation 是 Runtime/UI 内部安全闸门。
 */
export async function prepareUpdateBlockConfirmation(
  deps: UpdateBlockImplDeps,
  args: UpdateBlockInput,
): Promise<{ prepareResult: PreparedUpdateBlockConfirmation }> {
  const blockId = args.blockId.trim();
  const markdown = args.markdown;

  // 1. 确认目标块存在
  const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(blockId)}'`);
  const block = rows[0] as Block | undefined;
  if (!block) {
    throw new Error("目标块不存在。");
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

  // 3. afterSnapshot 使用输入 markdown
  const afterSnapshot = markdown;

  // 4. 生成视觉对比
  const displayBefore = toDisplayMarkdownFromKramdown(beforeSnapshot);
  const displayAfter = toDisplayMarkdownFromKramdown(afterSnapshot);

  const visualCompare = {
    type: "rendered_side_by_side" as const,
    sideBySide: createRenderedSideBySideCompare(
      displayBefore,
      displayAfter,
      { maxLines: 200, maxChars: 15000 },
    ),
  };

  // 5. 风险评估
  const riskResult = assessDocContentEditRisk({
    operation: "update_block",
    target: { blockId },
    markdownLength: markdown.length,
  });
  warnings = warnings.concat(riskResult.warnings);

  if (markdown === "") {
    warnings.push("将块内容更新为空。");
  }

  // 6. 创建 pending confirmation
  const confirmation = await createDocContentEditConfirmation({
    conversationId: deps.conversationId,
    action: "update_block",
    toolName: "update_block",
    toolInput: { blockId, markdown, summary: undefined },
    target: {
      blockId,
      docId: block.root_id,
      title: block.content?.slice(0, 100),
    },
    beforeSnapshot,
    afterSnapshot,
    visualCompare,
    riskLevel: riskResult.riskLevel,
    warnings: warnings.length > 0 ? warnings : undefined,
  });

  // 内部准备结果，不作为 Agent observation 使用
  const prepareResult: PreparedUpdateBlockConfirmation = {
    confirmationId: confirmation.id,
    action: "update_block",
    target: {
      blockId,
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
 * Agent-facing update_block 执行器。
 * 内部触发确认弹窗，用户确认后写入，最终返回成功/拒绝/失败结果。
 * 不暴露 confirmationId / visualCompare 等内部机制。
 */
export async function executeUpdateBlock(
  deps: UpdateBlockImplDeps,
  args: UpdateBlockInput,
): Promise<{ output: UpdateBlockOutput }> {
  // 1. 准备内部 confirmation
  const { prepareResult } = await prepareUpdateBlockConfirmation(deps, args);
  const confirmationId = prepareResult.confirmationId;
  const target = prepareResult.target;

  // 2. 请求用户确认（内部桥接 UI 弹窗）
  const requireConfirmation = shouldRequireDocContentEditConfirmation(
    deps.getSettings?.(),
    "update_block",
  );

  if (requireConfirmation) {
    const confirmationRes = await requestDocContentEditConfirmation({
      confirmationId,
      action: "update_block",
      abortSignal: deps.abortSignal,
    });

    // 3. 用户拒绝
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

  // 4. 用户确认（或跳过确认），执行真实写入
  const execRes = await executeConfirmedUpdateBlock({ confirmationId });

  if (execRes.ok && execRes.status === "success") {
    return {
      output: {
        status: "success",
        message: execRes.message,
        target,
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
