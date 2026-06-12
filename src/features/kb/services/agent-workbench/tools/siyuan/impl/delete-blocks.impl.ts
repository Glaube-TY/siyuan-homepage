import { sql, getBlockKramdown, getChildBlocks } from "../../../../../../../api";
import type { DeleteBlocksInput, DeleteBlocksOutput, PreparedDeleteBlocksConfirmation } from "../contracts/delete-blocks.contract";
import { assessDocContentEditRisk } from "../../../../doc-content-edit/doc-content-edit-risk";
import { createRenderedSideBySideCompare, toDisplayMarkdownFromKramdown } from "../../../../doc-content-edit/doc-content-edit-diff";
import { createDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-service";
import { requestDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-bridge";
import { shouldRequireDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-policy";
import { executeConfirmedDeleteBlocks } from "../../../../doc-content-edit/doc-content-edit-delete-blocks-executor";
import { removeDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-store";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

export interface DeleteBlocksImplDeps extends SiyuanToolDeps {
  conversationId: string;
}

/**
 * 内部确认准备能力：生成 pending confirmation，不实际删除。
 */
export async function prepareDeleteBlocksConfirmation(
  deps: DeleteBlocksImplDeps,
  args: DeleteBlocksInput,
): Promise<{ prepareResult: PreparedDeleteBlocksConfirmation }> {
  // 去重，保留原始顺序
  const seen = new Set<string>();
  const blockIds: string[] = [];
  for (const raw of args.blockIds) {
    const id = raw.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      blockIds.push(id);
    }
  }

  if (blockIds.length === 0) {
    return {
      prepareResult: {
        confirmationId: "",
        action: "delete_blocks",
        target: { blockIds: [] },
        riskLevel: "high",
        message: "未提供有效的 blockId。",
      },
    };
  }

  // 1. 查询所有块是否存在，并检查是否属于同一文档
  const blockMap = new Map<string, Block>();
  let docId: string | undefined;
  let docTitle: string | undefined;
  const missingIds: string[] = [];

  for (const blockId of blockIds) {
    try {
      const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(blockId)}'`);
      const block = rows[0] as Block | undefined;
      if (!block) {
        missingIds.push(blockId);
      } else {
        blockMap.set(blockId, block);
        if (!docId) {
          docId = block.root_id;
          docTitle = block.content?.slice(0, 100);
        } else if (block.root_id !== docId) {
          return {
            prepareResult: {
              confirmationId: "",
              action: "delete_blocks",
              target: { blockIds, docId },
              riskLevel: "high",
              message: "一次批量删除只能处理同一文档内的内容块。",
            },
          };
        }
      }
    } catch {
      missingIds.push(blockId);
    }
  }

  if (missingIds.length > 0) {
    return {
      prepareResult: {
        confirmationId: "",
        action: "delete_blocks",
        target: { blockIds, docId },
        riskLevel: "high",
        message: `以下块不存在：${missingIds.join("、")}。`,
      },
    };
  }

  // 2. 读取每个块的 kramdown 作为 beforeSnapshot
  const snapshots: Array<{ blockId: string; kramdown: string }> = [];
  const warnings: string[] = [];
  let hasChildren = false;

  for (const blockId of blockIds) {
    let kramdown = "";
    try {
      const kramdownRes = await getBlockKramdown(blockId);
      kramdown = kramdownRes?.kramdown ?? "";
    } catch {
      const block = blockMap.get(blockId);
      kramdown = (block as Block)?.markdown ?? (block as Block)?.content ?? "";
    }
    snapshots.push({ blockId, kramdown });

    // 检查子块
    if (!hasChildren) {
      try {
        const children = await getChildBlocks(blockId);
        if (Array.isArray(children) && children.length > 0) {
          hasChildren = true;
        }
      } catch {
        // 忽略
      }
    }
  }

  if (hasChildren) {
    warnings.push("部分块包含子块，删除将同时删除其子块。");
  }

  // 3. 生成视觉对比：左侧按块顺序展示将删除的内容，右侧为空
  const beforeParts: string[] = [];
  for (const snap of snapshots) {
    beforeParts.push(`--- ${snap.blockId} ---`);
    beforeParts.push(toDisplayMarkdownFromKramdown(snap.kramdown));
  }
  const displayBefore = beforeParts.join("\n");

  const visualCompare = {
    type: "rendered_side_by_side" as const,
    sideBySide: createRenderedSideBySideCompare(
      displayBefore,
      "",
      { maxLines: 200, maxChars: 15000 },
    ),
  };

  // 4. 风险评估
  const riskResult = assessDocContentEditRisk({
    operation: "delete_blocks",
    target: { blockId: blockIds[0], docId },
  });

  let riskLevel = riskResult.riskLevel;
  if (hasChildren || blockIds.length > 5) {
    riskLevel = "high";
  }

  const allWarnings = [...warnings, ...riskResult.warnings];

  // 5. 创建 pending confirmation
  const confirmation = await createDocContentEditConfirmation({
    conversationId: deps.conversationId,
    action: "delete_blocks",
    toolName: "delete_blocks",
    toolInput: {
      blockIds,
      snapshots,
    },
    target: {
      blockId: blockIds[0],
      docId,
      title: docTitle,
    },
    beforeSnapshot: snapshots.map((s) => s.kramdown).join("\n---\n"),
    afterSnapshot: "",
    visualCompare,
    riskLevel,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  });

  return {
    prepareResult: {
      confirmationId: confirmation.id,
      action: "delete_blocks",
      target: {
        blockIds,
        docId,
        title: docTitle,
      },
      riskLevel,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
      message: "内部确认已准备，等待 UI 流程处理。",
    },
  };
}

/**
 * Agent-facing delete_blocks 执行器。
 * 内部触发确认弹窗，用户确认后批量删除，最终返回成功/拒绝/失败结果。
 */
export async function executeDeleteBlocks(
  deps: DeleteBlocksImplDeps,
  args: DeleteBlocksInput,
): Promise<{ output: DeleteBlocksOutput }> {
  const blockIds = args.blockIds.map((id) => id.trim()).filter(Boolean);

  // 1. 准备内部 confirmation
  let prepareResult: PreparedDeleteBlocksConfirmation;
  try {
    const prepare = await prepareDeleteBlocksConfirmation(deps, args);
    prepareResult = prepare.prepareResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: {
        status: "failed",
        message,
        target: { blockIds },
        requestedCount: blockIds.length,
      },
    };
  }

  // 2. 若准备阶段已发现失败，直接返回
  if (!prepareResult.confirmationId) {
    return {
      output: {
        status: "failed",
        message: prepareResult.message || "批量删除准备失败。",
        target: prepareResult.target,
        requestedCount: blockIds.length,
      },
    };
  }

  const confirmationId = prepareResult.confirmationId;
  const target = prepareResult.target;

  // 3. 请求用户确认
  const requireConfirmation = shouldRequireDocContentEditConfirmation(
    deps.getSettings?.(),
    "delete_blocks",
  );

  if (requireConfirmation) {
    const confirmationRes = await requestDocContentEditConfirmation({
      confirmationId,
      action: "delete_blocks",
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
          requestedCount: blockIds.length,
        },
      };
    }
  }

  // 5. 用户确认，执行真实批量删除
  const execRes = await executeConfirmedDeleteBlocks({ confirmationId });

  if (execRes.ok && execRes.status === "success") {
    return {
      output: {
        status: "success",
        message: execRes.message,
        target: execRes.target ?? target,
        requestedCount: execRes.requestedCount ?? blockIds.length,
        deletedCount: execRes.deletedCount ?? blockIds.length,
      },
    };
  }

  return {
    output: {
      status: "failed",
      message: execRes.message,
      target: execRes.target ?? target,
      requestedCount: execRes.requestedCount ?? blockIds.length,
      deletedCount: execRes.deletedCount,
    },
  };
}
