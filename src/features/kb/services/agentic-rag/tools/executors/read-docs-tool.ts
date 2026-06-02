/**
 * Read Docs Tool Executor
 *
 * Agentic RAG 只读工具：读取文档全文（Markdown）。
 *
 * 职责：
 * - 复用 readDocsFullForAgent/exportMdContent 链路，不用 SQL 拼全文
 * - 只读，不导入写入 API，不直接 import api.ts
 * - docIds 必须来自当前 scope、workspace.candidateDocs、workspace.recentEvidence 或 custom docs
 * - 不允许 scope 外读取
 * - 按 budget.maxContextChars/maxCharsPerDoc 截断
 * - 尽量保留 title/box/path 元数据
 * - 不直接修改 workspace
 */

import { z } from "zod";
import type {
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolExecutionResult,
  AgentToolAvailability,
  AgentToolBudgetCost,
} from "../tool-types";
import { mapAgentDocFullToEvidenceDocument, findDocMetaById } from "../tool-mappers";
import { readDocsFullForAgenticRag } from "../readers/read-doc-full";
import type { AgenticDocLite } from "../doc-types";
import { canReadMoreDocs } from "../../safety/budget-guard";
import { isDocIdAllowedInScope } from "../../scope/scope-guard";
import { isInventoryOnlyCandidateDoc } from "../../workspace/candidate-quality";

const ReadDocsArgsSchema = z.object({
  docIds: z.array(z.string()).min(1),
  maxCharsPerDoc: z.number().optional(),
  readSource: z.enum(["previous_evidence", "search_scope", "candidate_docs", "list_scope_docs", "manual"]).optional(),
});

function checkAvailability(context: AgentToolExecutionContext): AgentToolAvailability {
  const { scope, budget, workspace } = context;

  if (!scope) {
    return { available: false, reason: "未定义检索范围" };
  }

  const maxTotalResearchDocs = budget.maxTotalResearchDocs ?? 20;
  const totalReadSoFar = workspace?.readDocuments.length ?? 0;
  const researchReadRemaining = Math.max(0, maxTotalResearchDocs - totalReadSoFar);

  // 候选研究读取保护：如果 workspace.candidateDocs 中仍有未读的可读候选（排除 inventoryOnly），
  // 且 researchReadRemaining > 0，则 read_docs 必须 available
  const readDocIdSet = new Set(workspace?.readDocuments.map((d) => d.docId) ?? []);
  const allCandidateDocs = workspace?.candidateDocs ?? [];
  const readableCandidateUnreadCount = allCandidateDocs.filter(
    (d) => !isInventoryOnlyCandidateDoc(d) && !readDocIdSet.has(d.docId)
  ).length;
  const inventoryOnlyCandidateCount = allCandidateDocs.filter(isInventoryOnlyCandidateDoc).length;

  if (readableCandidateUnreadCount > 0 && researchReadRemaining > 0) {
    console.info("[KB-AGENT | READ_DOCS_AVAILABILITY_SAFE]", {
      readSource: "candidate_research",
      readDocCount: totalReadSoFar,
      readableCandidateUnreadCount,
      inventoryOnlyCandidateCount,
      candidateResearchRemaining: researchReadRemaining,
      available: true,
    });
    return { available: true };
  }

  // 历史引用保护：如果 conversationUsedReferences 仍有未读 internalDocId，
  // 且 workspace.readDocuments.length < maxTotalResearchDocs，则 read_docs 仍 available
  if (workspace?.conversationUsedReferences && workspace.conversationUsedReferences.length > 0) {
    let hasUnreadHistoricalRef = false;
    for (const turnRef of workspace.conversationUsedReferences) {
      for (const ref of turnRef.references ?? []) {
        if (ref.internalDocId && !readDocIdSet.has(ref.internalDocId)) {
          hasUnreadHistoricalRef = true;
          break;
        }
      }
      if (hasUnreadHistoricalRef) break;
    }

    if (hasUnreadHistoricalRef && totalReadSoFar < maxTotalResearchDocs) {
      console.info("[KB-AGENT | READ_DOCS_AVAILABILITY_SAFE]", {
        readSource: "previous_evidence",
        readDocCount: totalReadSoFar,
        readableCandidateUnreadCount,
        inventoryOnlyCandidateCount,
        candidateResearchRemaining: researchReadRemaining,
        available: true,
      });
      return { available: true };
    }
  }

  // followUpContext 历史引用保护：如果 followUpContext.previousReferenceDocIds 仍有未读项，
  // 且 researchReadRemaining > 0，则 read_docs 仍 available
  const followUpDocIds = context.followUpContext?.previousReferenceDocIds;
  if (Array.isArray(followUpDocIds) && followUpDocIds.length > 0) {
    const hasUnreadFollowUpRef = followUpDocIds.some((id) => id && id.trim().length > 0 && !readDocIdSet.has(id));
    if (hasUnreadFollowUpRef && totalReadSoFar < maxTotalResearchDocs) {
      console.info("[KB-AGENT | READ_DOCS_AVAILABILITY_SAFE]", {
        readSource: "followUp_context",
        readDocCount: totalReadSoFar,
        followUpDocCount: followUpDocIds.length,
        candidateResearchRemaining: researchReadRemaining,
        available: true,
      });
      return { available: true };
    }
  }

  // 普通 read_docs 仍使用 maxReadDocs 保护
  const budgetCheck = canReadMoreDocs(budget, {
    counters: undefined,
    workspaceCoverage: workspace?.coverage,
  });

  console.info("[KB-AGENT | READ_DOCS_AVAILABILITY_SAFE]", {
    readSource: "normal",
    readDocCount: totalReadSoFar,
    readableCandidateUnreadCount,
    inventoryOnlyCandidateCount,
    candidateResearchRemaining: researchReadRemaining,
    available: budgetCheck.allowed,
  });

  if (!budgetCheck.allowed) {
    return { available: false, reason: budgetCheck.reason };
  }

  return { available: true };
}

function calcBudgetCost(context: AgentToolExecutionContext): AgentToolBudgetCost {
  const maxCalls = context.budget?.maxReadDocs ?? 10;
  const used = context.workspace?.coverage.readDocCount ?? 0;
  return {
    toolCallsUsed: 1,
    toolCallsRemaining: Math.max(0, maxCalls - used - 1),
  };
}

async function execute(
  args: Record<string, unknown>,
  context: AgentToolExecutionContext
): Promise<AgentToolExecutionResult> {
  const { scope, budget, workspace, trace } = context;

  if (!scope) {
    return { success: false, error: "未定义检索范围", warning: "read_docs 需要检索范围" };
  }

  const parsed = ReadDocsArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `无效的参数：${parsed.error.message}` };
  }

  const { docIds, maxCharsPerDoc, readSource } = parsed.data;
  const uniqueDocIds = [...new Set(docIds)];

  const placeholderPatterns = /^(docId\d+|example|test|placeholder|sample)/i;
  const suspiciousDocIds = uniqueDocIds.filter((id) => placeholderPatterns.test(id));
  if (suspiciousDocIds.length > 0) {
    console.warn(
      `[KB-AGENT | read_docs | PLACEHOLDER_GUARD] 检测到 ${suspiciousDocIds.length} 个占位符 docId，拒绝执行`
    );
    return {
      success: false,
      error: `检测到 ${suspiciousDocIds.length} 个占位符 docId，拒绝执行`,
      warning: `以下 docId 明显是占位符而非真实 ID。read_docs 的 docIds 必须来自当前工作区候选、scope 固定文档或证据复用决策。`,
    };
  }

  const scopeAllowedDocIds = uniqueDocIds.filter((id) => isDocIdAllowedInScope(id, { scope, workspace }));
  let allowedDocIds = scopeAllowedDocIds;
  let disallowedCount = uniqueDocIds.length - allowedDocIds.length;

  let followUpDocCount = 0;
  let conversationRefDocCount = 0;

  if (readSource === "previous_evidence") {
    const additionalAllowed = new Set<string>();

    const followUpDocIds = context.followUpContext?.previousReferenceDocIds;
    if (Array.isArray(followUpDocIds)) {
      for (const id of followUpDocIds) {
        if (id && id.trim().length > 0) {
          additionalAllowed.add(id);
          followUpDocCount++;
        }
      }
    }

    if (workspace?.conversationUsedReferences) {
      for (const turnRef of workspace.conversationUsedReferences) {
        for (const ref of turnRef.references ?? []) {
          if (ref.internalDocId && ref.internalDocId.trim().length > 0) {
            additionalAllowed.add(ref.internalDocId);
            conversationRefDocCount++;
          }
        }
      }
    }

    const recentDocIds = context.runtime?.recentContext?.lastReferenceDocIds;
    if (Array.isArray(recentDocIds)) {
      for (const id of recentDocIds) {
        if (id && id.trim().length > 0) {
          additionalAllowed.add(id);
        }
      }
    }

    const enhancedAllowed = uniqueDocIds.filter((id) => scopeAllowedDocIds.includes(id) || additionalAllowed.has(id));
    allowedDocIds = enhancedAllowed;
    disallowedCount = uniqueDocIds.length - allowedDocIds.length;

    console.info("[KB-AGENT | READ_DOCS_EXEC_PREVIOUS_EVIDENCE_SCOPE_SAFE]", {
      inputDocCount: uniqueDocIds.length,
      allowedDocCount: allowedDocIds.length,
      disallowedCount,
      followUpDocCount,
      conversationRefDocCount,
    });
  }

  // 历史引用保护：previous_evidence 使用 maxTotalResearchDocs 控制总读取数量，不使用 maxReadDocs
  // 候选研究读取（search_scope/candidate_docs）也使用 maxTotalResearchDocs/maxCandidateReadDocs
  let remainingReadDocs: number;
  const isCandidateResearchRead = readSource === "search_scope" || readSource === "candidate_docs";
  const isPreviousEvidenceRead = readSource === "previous_evidence";

  if (isCandidateResearchRead && readSource === "candidate_docs" && workspace) {
    const candidateDocMap = new Map(workspace.candidateDocs.map((d) => [d.docId, d]));
    const rejectedInventoryDocIds: string[] = [];
    for (const docId of allowedDocIds) {
      const candidate = candidateDocMap.get(docId);
      if (candidate && isInventoryOnlyCandidateDoc(candidate)) {
        rejectedInventoryDocIds.push(docId);
      }
    }
    if (rejectedInventoryDocIds.length > 0) {
      console.info("[KB-AGENT | INVENTORY_DOC_READ_REJECTED_SAFE]", {
        readSource,
        materializedFrom: "read_candidate_docs",
        inputDocCount: uniqueDocIds.length,
        rejectedInventoryCount: rejectedInventoryDocIds.length,
      });
      return {
        success: false,
        error: "read_docs 拒绝读取 inventoryOnly 文档",
        warning: `readSource=candidate_docs 时发现 ${rejectedInventoryDocIds.length} 个 inventoryOnly 文档，拒绝执行`,
      };
    }
  }

  if (isCandidateResearchRead) {
    // 候选研究读取：使用 maxTotalResearchDocs 或 maxCandidateReadDocs
    const maxCandidateReadDocs = ((budget as unknown) as Record<string, unknown>).maxCandidateReadDocs as number | undefined ?? budget.maxTotalResearchDocs ?? 20;
    // 已读候选文档数量 = workspace.readDocuments 与 workspace.candidateDocs 的 docId 交集
    const candidateDocIdSet = new Set(workspace?.candidateDocs.map((d) => d.docId) ?? []);
    const candidateReadCount = workspace?.readDocuments.filter((d) => candidateDocIdSet.has(d.docId)).length ?? 0;
    remainingReadDocs = Math.max(0, maxCandidateReadDocs - candidateReadCount);

    console.info("[KB-AGENT | READ_DOCS_EXEC_BUDGET_SAFE]", {
      readSource,
      inputDocCount: uniqueDocIds.length,
      allowedDocCount: allowedDocIds.length,
      remainingReadDocs,
      clampedDocCount: Math.min(allowedDocIds.length, Math.max(0, remainingReadDocs)),
      candidateReadCount,
    });
  } else if (isPreviousEvidenceRead) {
    const maxTotalResearchDocs = budget.maxTotalResearchDocs ?? 20;
    const totalReadSoFar = workspace?.readDocuments.length ?? 0;
    remainingReadDocs = Math.max(0, maxTotalResearchDocs - totalReadSoFar);
  } else {
    // 普通手动 read_docs 仍使用 maxReadDocs 保护
    const maxReadDocs = budget?.maxReadDocs ?? 10;
    remainingReadDocs = maxReadDocs - (workspace?.coverage.readDocCount ?? 0);
  }
  const clampedDocIds = allowedDocIds.slice(0, Math.max(0, remainingReadDocs));

  if (clampedDocIds.length === 0) {
    return {
      success: false,
      error: "范围内没有有效的可读取文档",
      warning: disallowedCount > 0
        ? `${disallowedCount} 个文档 ID 不在允许的来源范围内`
        : undefined,
    };
  }

  // maxCharsPerDoc 未传时读取完整文档，不默认截断
  // 只有显式传入 maxCharsPerDoc 时才按显式值处理
  const maxCharsPerDocClamped = maxCharsPerDoc !== undefined
    ? Math.min(maxCharsPerDoc, budget?.maxContextChars ?? Number.MAX_SAFE_INTEGER)
    : undefined;

  const docs: AgenticDocLite[] = clampedDocIds.map((id) => {
    const meta = findDocMetaById(id, context, context.runtime?.recentContext);
    return {
      docId: id,
      title: meta?.title || "未命名文档",
      box: meta?.box,
      path: meta?.path,
    };
  });

  const resolvedTitleCount = docs.filter((d) => d.title !== "未命名文档").length;
  const fallbackTitleCount = docs.length - resolvedTitleCount;
  console.info("[KB-AGENT | READ_DOCS_TITLE_META_RESOLVED_SAFE]", {
    inputDocCount: clampedDocIds.length,
    resolvedTitleCount,
    fallbackTitleCount,
    readSource: readSource ?? "normal",
  });

  try {
    const results = await readDocsFullForAgenticRag({
      docs,
      maxChars: maxCharsPerDocClamped,
      trace: trace ?? false,
    });

    const evidenceDocuments = results.map(mapAgentDocFullToEvidenceDocument);
    const warnings: string[] = [];

    // 全文读取确认日志
    const totalOriginalChars = results.reduce((sum, r) => sum + (r?.originalContentChars ?? 0), 0);
    const totalFinalChars = results.reduce((sum, r) => sum + (r?.contentChars ?? 0), 0);
    const truncatedCount = results.filter((r) => r?.truncated === true).length;

    console.info("[KB-AGENT | READ_DOC_FULL_SAFE]", {
      docCount: results.length,
      totalOriginalChars,
      totalFinalChars,
      truncatedCount,
    });

    const failedDocIds = clampedDocIds.filter(
      (id) => !results.some((r) => r?.docId === id)
    );

    if (clampedDocIds.length > 0 && evidenceDocuments.length === 0) {
      console.warn(
        `[KB-AGENT | read_docs] read_docs 未产生任何可读文档。inputDocCount=${clampedDocIds.length}, failedDocCount=${failedDocIds.length}`
      );
      return {
        success: false,
        error: "read_docs 未产生任何可读文档",
        warning: `全部 ${clampedDocIds.length} 个文档读取失败`,
        data: {
          documents: [],
          attemptedDocIds: clampedDocIds,
          failedDocIds: clampedDocIds,
          warnings,
        },
      };
    }

    if (failedDocIds.length > 0) {
      warnings.push(`${failedDocIds.length} 个文档读取失败`);
    }
    if (disallowedCount > 0) {
      warnings.push(`${disallowedCount} 个文档 ID 不在允许的来源范围内`);
    }
    if (clampedDocIds.length < uniqueDocIds.length) {
      warnings.push(`由于预算限制，仅读取 ${clampedDocIds.length} 个文档，而不是 ${uniqueDocIds.length} 个`);
    }
    if (failedDocIds.length > 0 && evidenceDocuments.length > 0) {
      warnings.push(`部分失败：${failedDocIds.length}/${clampedDocIds.length} 个文档读取失败`);
    }

    for (const docId of clampedDocIds) {
      const candidateDoc = workspace?.candidateDocs.find((d) => d.docId === docId);
      if (candidateDoc?.inventoryOnly === true) {
        console.info("[KB-AGENT | INVENTORY_DOC_READ_BLOCKED_OR_WARNED_SAFE]", {
          inventoryOnlyCount: 1,
        });
        warnings.push("inventory_doc_read_attempted");
      }
    }

    return {
      success: true,
      data: {
        documents: evidenceDocuments,
        attemptedDocIds: clampedDocIds,
        failedDocIds,
        warnings,
      },
      warning: warnings.length > 0 ? warnings.join("; ") : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `read_docs 执行失败：${msg}` };
  }
}

function formatObservation(result: AgentToolExecutionResult) {
  if (!result.success) {
    return { summary: "read_docs 失败", error: result.error, warning: result.warning };
  }

  const data = result.data as Record<string, unknown> | undefined;
  const docs = (data?.documents as unknown[])?.length ?? 0;

  return {
    summary: `read_docs 加载 ${docs} 个文档`,
    counts: { evidenceDocs: docs },
    warning: result.warning,
  };
}

export function createReadDocsTool(): AgentToolDefinition {
  return {
    name: "read_docs",
    description: "读取指定文档的全文内容。",
    readOnly: true,
    inputSchema: ReadDocsArgsSchema,
    outputSchema: z.object({
      documents: z.array(z.unknown()),
      failedDocIds: z.array(z.string()),
      warnings: z.array(z.string()),
    }),
    availability: checkAvailability,
    budgetCost: calcBudgetCost,
    execute,
    observationFormatter: formatObservation,
  };
}
