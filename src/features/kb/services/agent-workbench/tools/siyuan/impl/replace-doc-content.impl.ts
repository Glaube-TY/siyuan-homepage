import { sql, getBlockKramdown } from "../../../../../../../api";
import type { ReplaceDocContentInput, ReplaceDocContentOutput, PreparedReplaceDocContentConfirmation } from "../contracts/replace-doc-content.contract";
import { assessDocContentEditRisk } from "../../../../doc-content-edit/doc-content-edit-risk";
import { createRenderedSideBySideCompare, toDisplayMarkdownFromKramdown } from "../../../../doc-content-edit/doc-content-edit-diff";
import { createDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-service";
import { requestDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-bridge";
import { shouldRequireDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-policy";
import { executeConfirmedReplaceDocContent } from "../../../../doc-content-edit/doc-content-edit-replace-doc-content-executor";
import { removeDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-store";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";

export interface ReplaceDocContentImplDeps extends SiyuanToolDeps {
  conversationId: string;
}

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

/**
 * 内部确认准备能力：生成 pending confirmation，不实际写入思源文档。
 */
export async function prepareReplaceDocContentConfirmation(
  deps: ReplaceDocContentImplDeps,
  args: ReplaceDocContentInput,
): Promise<{ prepareResult: PreparedReplaceDocContentConfirmation }> {
  const docId = args.docId.trim();
  const markdown = args.markdown;

  // 1. 确认目标文档存在
  const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSqlId(docId)}' AND type = 'd'`);
  const block = rows[0] as Block | undefined;
  if (!block) {
    const prepareResult: PreparedReplaceDocContentConfirmation = {
      confirmationId: "",
      action: "replace_doc_content",
      target: { docId },
      riskLevel: "high",
      message: "目标文档不存在。",
    };
    return { prepareResult };
  }

  const title = block.content || block.name || "";

  // 2. 读取当前内容（beforeSnapshot）
  let beforeSnapshot: string;
  let warnings: string[] = [];
  try {
    const kramdownRes = await getBlockKramdown(docId);
    beforeSnapshot = kramdownRes?.kramdown ?? "";
  } catch {
    const prepareResult: PreparedReplaceDocContentConfirmation = {
      confirmationId: "",
      action: "replace_doc_content",
      target: { docId, title },
      riskLevel: "high",
      message: "无法读取目标文档当前内容，未准备替换确认。",
    };
    return { prepareResult };
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
      { maxLines: 500, maxChars: 30000 },
    ),
  };

  // 5. 风险评估
  const riskResult = assessDocContentEditRisk({
    operation: "replace_doc_content",
    target: { docId },
    markdownLength: markdown.length,
  });
  warnings = warnings.concat(riskResult.warnings);

  if (markdown === "") {
    warnings.push("将清空文档正文。");
  }

  // 6. 创建 pending confirmation
  const confirmation = await createDocContentEditConfirmation({
    conversationId: deps.conversationId,
    action: "replace_doc_content",
    toolName: "replace_doc_content",
    toolInput: { docId, markdown, summary: undefined },
    target: {
      docId,
      title,
    },
    beforeSnapshot,
    afterSnapshot,
    visualCompare,
    riskLevel: riskResult.riskLevel,
    warnings: warnings.length > 0 ? warnings : undefined,
  });

  const prepareResult: PreparedReplaceDocContentConfirmation = {
    confirmationId: confirmation.id,
    action: "replace_doc_content",
    target: {
      docId,
      title,
    },
    riskLevel: riskResult.riskLevel,
    warnings: warnings.length > 0 ? warnings : undefined,
    message: "内部确认已准备，等待 UI 流程处理。",
  };

  return { prepareResult };
}

/**
 * Agent-facing replace_doc_content 执行器。
 * 内部触发确认弹窗，用户确认后写入，最终返回成功/拒绝/失败结果。
 */
export async function executeReplaceDocContent(
  deps: ReplaceDocContentImplDeps,
  args: ReplaceDocContentInput,
): Promise<{ output: ReplaceDocContentOutput }> {
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
  let prepareResult: PreparedReplaceDocContentConfirmation;
  try {
    const prepare = await prepareReplaceDocContentConfirmation(deps, args);
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

  if (!prepareResult.confirmationId) {
    return {
      output: {
        status: "failed",
        message: prepareResult.message,
        target: { docId },
      },
    };
  }

  const confirmationId = prepareResult.confirmationId;
  const target = prepareResult.target;

  // 3. 请求用户确认（内部桥接 UI 弹窗）
  const requireConfirmation = shouldRequireDocContentEditConfirmation(
    deps.getSettings?.(),
    "replace_doc_content",
  );

  if (requireConfirmation) {
    const confirmationRes = await requestDocContentEditConfirmation({
      confirmationId,
      action: "replace_doc_content",
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

  // 5. 用户确认（或跳过确认），执行真实写入
  const execRes = await executeConfirmedReplaceDocContent({ confirmationId });

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
