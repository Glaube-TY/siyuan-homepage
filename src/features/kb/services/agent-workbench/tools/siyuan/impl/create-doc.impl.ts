import type { CreateDocInput, CreateDocOutput, PreparedCreateDocConfirmation } from "../contracts/create-doc.contract";
import { assessDocContentEditRisk } from "../../../../doc-content-edit/doc-content-edit-risk";
import { createArrowFlowCompare } from "../../../../doc-content-edit/doc-content-edit-diff";
import { createDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-service";
import { requestDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-bridge";
import { shouldRequireDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-policy";
import { executeConfirmedCreateDoc } from "../../../../doc-content-edit/doc-content-edit-create-doc-executor";
import { removeDocContentEditConfirmation } from "../../../../doc-content-edit/doc-content-edit-confirmation-store";
import type { SiyuanToolDeps } from "../siyuan-tool-deps";
import type { DocContentEditArrowFlow } from "../../../../doc-content-edit/doc-content-edit-types";

export interface CreateDocImplDeps extends SiyuanToolDeps {
  conversationId: string;
}

/**
 * 内部确认准备能力：生成 pending confirmation，不实际写入思源文档。
 */
export async function prepareCreateDocConfirmation(
  deps: CreateDocImplDeps,
  args: CreateDocInput,
): Promise<{ prepareResult: PreparedCreateDocConfirmation }> {
  const notebookId = args.notebookId.trim();
  const path = args.path.trim();
  const markdown = args.markdown ?? "";

  const warnings: string[] = [];

  // 1. 风险评估
  const riskResult = assessDocContentEditRisk({
    operation: "create_doc",
    target: { notebookId, docPath: path },
    markdownLength: markdown.length,
  });

  if (markdown.length > 12000) {
    warnings.push("内容长度超过 12000 字符，创建长文档风险较高。");
  }

  const allWarnings = warnings.length > 0 ? warnings.concat(riskResult.warnings) : riskResult.warnings;

  // 2. 生成 arrow_flow 视觉对比
  const title = path.split("/").pop() || path;
  const arrow: DocContentEditArrowFlow = createArrowFlowCompare(
    "无",
    title,
    { fromDescription: "当前无此文档", toDescription: `在笔记本下创建文档 ${path}` },
  );
  const visualCompare = {
    type: "arrow_flow" as const,
    arrow,
  };

  // 3. 创建 pending confirmation
  const confirmation = await createDocContentEditConfirmation({
    conversationId: deps.conversationId,
    action: "create_doc",
    toolName: "create_doc",
    toolInput: { notebookId, path, markdown, summary: undefined },
    target: {
      notebookId,
      docPath: path,
      title,
    },
    afterSnapshot: markdown,
    visualCompare,
    riskLevel: riskResult.riskLevel,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  });

  const prepareResult: PreparedCreateDocConfirmation = {
    confirmationId: confirmation.id,
    action: "create_doc",
    target: {
      notebookId,
      path,
      title,
    },
    riskLevel: riskResult.riskLevel,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    message: "内部确认已准备，等待 UI 流程处理。",
  };

  return { prepareResult };
}

/**
 * Agent-facing create_doc 执行器。
 * 内部触发确认弹窗，用户确认后创建，最终返回成功/拒绝/失败结果。
 */
export async function executeCreateDoc(
  deps: CreateDocImplDeps,
  args: CreateDocInput,
): Promise<{ output: CreateDocOutput }> {
  const notebookId = args.notebookId.trim();
  const path = args.path.trim();

  // 1. path 前置校验：必须以 / 开头
  if (!path.startsWith("/")) {
    return {
      output: {
        status: "failed",
        message: "文档路径无效：path 必须以 / 开头。",
        target: { notebookId, path },
      },
    };
  }

  // 2. 准备内部 confirmation
  let prepareResult: PreparedCreateDocConfirmation;
  try {
    const prepare = await prepareCreateDocConfirmation(deps, args);
    prepareResult = prepare.prepareResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: {
        status: "failed",
        message,
        target: { notebookId, path },
      },
    };
  }

  const confirmationId = prepareResult.confirmationId;
  const target = prepareResult.target;

  // 2. 请求用户确认（内部桥接 UI 弹窗）
  const requireConfirmation = shouldRequireDocContentEditConfirmation(
    deps.getSettings?.(),
    "create_doc",
  );

  if (requireConfirmation) {
    const confirmationRes = await requestDocContentEditConfirmation({
      confirmationId,
      action: "create_doc",
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

  // 4. 用户确认（或跳过确认），执行真实创建
  const execRes = await executeConfirmedCreateDoc({ confirmationId });

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
