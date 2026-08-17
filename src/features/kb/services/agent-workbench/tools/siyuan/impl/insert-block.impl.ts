import { sql, getBlockKramdown } from "../../../../../../../api";
import type { InsertBlockInput, InsertBlockOutput, PreparedInsertBlockConfirmation } from "../contracts/insert-block.contract";
import { assessDocContentEditRisk } from "../../../../doc-content-edit/doc-content-edit-risk";
import { buildEditDiffPreview } from "../../../../doc-content-edit/diff/edit-diff-preview-builder";
import { previewInsertedBlockInDocument, withDocumentTitle } from "../../../../doc-content-edit/doc-content-edit-document-preview";
import { createDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-service";
import { requestDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-bridge";
import { executeConfirmedInsertBlock } from "../../../../doc-content-edit/doc-content-edit-insert-block-executor";
import { removeDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-store";
import { resolveDocEditBlock } from "../../../../doc-content-edit/doc-content-edit-block-resolver";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import { resolveDisplayPath, resolveNotebookName } from "../../../../doc-content-edit/doc-content-edit-display";

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

  // 1. 确认目标块存在：SQL miss 时使用思源内核 API，不把索引延迟当成不存在。
  const resolution = await resolveDocEditBlock(referenceBlockId);
  if (resolution.status !== "exists") {
    const prepareResult: PreparedInsertBlockConfirmation = {
      confirmationId: "",
      action: "insert_block",
      target: { referenceBlockId, position },
      riskLevel: "high",
      message: resolution.status === "missing" ? "参考块不存在。" : "无法确认参考块状态，未准备添加确认。",
    };
    return { prepareResult };
  }
  const block = resolution.block;
  if (!block.rootId) {
    return {
      prepareResult: {
        confirmationId: "",
        action: "insert_block",
        target: { referenceBlockId, position },
        riskLevel: "high",
        message: "无法读取参考块所在文档，未准备添加确认。",
      },
    };
  }

  // 2. beforeSnapshot：参考块内容（用于展示上下文）
  let beforeSnapshot: string;
  let warnings: string[] = [];
  try {
    beforeSnapshot = block.kramdown ?? (await getBlockKramdown(referenceBlockId))?.kramdown ?? "";
  } catch {
    beforeSnapshot = block.markdown ?? block.content ?? block.rootTitle ?? "";
    warnings.push("无法读取参考块 kramdown，已回退到 markdown/content。");
  }

  // 3. 保留执行快照，同时用真实文档上下文构造 Git 式新增 Diff。
  const positionLabel = position === "before" ? "上方" : position === "after" ? "下方" : "子块";
  const afterSnapshot = markdown;
  const displayPath = await resolveDisplayPath(block.rootId);
  const notebookName = block.box ? await resolveNotebookName(block.box) : undefined;
  const documentResult = await getBlockKramdown(block.rootId);
  const documentKramdown = documentResult?.kramdown ?? "";
  if (!documentKramdown) {
    throw new Error("无法读取参考块所在文档的完整上下文，未准备添加确认。");
  }
  let documentTitle = block.rootTitle || "未命名文档";
  try {
    const documentRows = await sql(`SELECT content FROM blocks WHERE id = '${block.rootId.replace(/'/g, "''")}' AND type = 'd' LIMIT 1`);
    documentTitle = (documentRows[0] as Pick<Block, "content"> | undefined)?.content || documentTitle;
  } catch {
    warnings.push("文档索引尚未同步，已使用内核返回的文档标题。");
  }
  const referenceTitle = block.content?.slice(0, 100) || block.rootTitle || "参考内容块";
  const proposedDocument = previewInsertedBlockInDocument(documentKramdown, beforeSnapshot, markdown, position);
  if (proposedDocument === undefined) {
    throw new Error("无法在完整文档中定位参考内容块，未准备添加确认。");
  }
  const visualCompare = {
    type: "block_diff" as const,
    diff: buildEditDiffPreview({
      title: "确认添加内容块",
      oldContent: withDocumentTitle(documentTitle, documentKramdown),
      newContent: withDocumentTitle(documentTitle, proposedDocument),
      targetBlockIds: [referenceBlockId],
      toolName: "内容块添加",
    }),
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
      docId: block.rootId,
      title: referenceTitle,
      displayPath,
      notebookName,
    },
    presentation: {
      mode: "create",
      heading: "确认添加内容块",
      description: "将把新内容添加到下面的位置。",
      destination: {
        label: notebookName || "目标笔记本",
        path: displayPath,
        detail: `在「${referenceTitle}」${positionLabel}`,
      },
      method: `以 Markdown 内容块形式插入到参考块${positionLabel}`,
      addedContent: markdown,
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
      docId: block.rootId,
      title: referenceTitle,
    },
    riskLevel: riskResult.riskLevel,
    warnings: warnings.length > 0 ? warnings : undefined,
    message: "内部确认已准备，等待 UI 流程处理。",
  };

  return { prepareResult };
}

/**
 * Agent-facing insert_block 执行器。
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

  // 准备阶段未能建立确认时，不进入确认桥，更不能让空 confirmationId 继续执行。
  if (!prepareResult.confirmationId) {
    return {
      output: {
        status: "failed",
        message: prepareResult.message,
        target: { referenceBlockId, position },
      },
    };
  }

  const confirmationId = prepareResult.confirmationId;
  const target = prepareResult.target;

  const requireConfirmation = true;

  if (requireConfirmation) {
    const confirmationRes = await requestDocContentEditConfirmation({
      confirmationId,
      action: "insert_block",
      abortSignal: deps.abortSignal,
      route: deps.confirmationRoute,
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
