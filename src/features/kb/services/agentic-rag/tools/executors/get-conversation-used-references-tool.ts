/**
 * Get Conversation Used References Tool Executor
 *
 * Agentic RAG 只读工具：返回历史对话中最终已展示给用户的参考资料。
 *
 * 职责：
 * - 只返回前面每一轮最终回答明确使用并展示给用户的参考资料（footer references / final used references）
 * - 不返回 search candidates
 * - 不返回未读候选
 * - 不返回读过但最终 footer 没展示的证据
 * - 不返回真实 docId/blockId/path/box
 * - 如果某轮 footer references 为空，则该轮没有"对用户明确展示的历史参考资料"
 * - 工具结果写入 workspace.conversationUsedReferences，不直接塞入 Evidence Pack
 */

import { z } from "zod";
import type {
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolExecutionResult,
  AgentToolAvailability,
  AgentToolBudgetCost,
} from "../tool-types";
import type { ConversationTurnMemoryForContext } from "../../runtime/recent-context-types";
import type { ConversationUsedReference } from "../../workspace/evidence-workspace";

const GetConversationUsedReferencesArgsSchema = z.object({
  turnScope: z.enum(["last", "recent", "all", "selected"]).optional(),
  turnIndexes: z.array(z.number()).optional(),
  maxTurns: z.number().optional(),
  maxRefsPerTurn: z.number().optional(),
  includeAnswerItemMapping: z.boolean().optional(),
});

function checkAvailability(context: AgentToolExecutionContext): AgentToolAvailability {
  const { runtime } = context;

  const conversationTurns = runtime?.recentContext?.conversationTurns;
  if (!conversationTurns || conversationTurns.length === 0) {
    return { available: false, reason: "无历史对话轮次" };
  }

  return { available: true };
}

function calcBudgetCost(): AgentToolBudgetCost {
  return {
    toolCallsUsed: 1,
    toolCallsRemaining: 0,
  };
}

function selectTurns(
  turns: ConversationTurnMemoryForContext[],
  turnScope?: "last" | "recent" | "all" | "selected",
  turnIndexes?: number[],
  maxTurns?: number
): ConversationTurnMemoryForContext[] {
  switch (turnScope) {
    case "last":
      return turns.length > 0 ? [turns[turns.length - 1]] : [];
    case "selected":
      if (turnIndexes && turnIndexes.length > 0) {
        return turnIndexes
          .map((idx) => turns[idx])
          .filter(Boolean);
      }
      return turns;
    case "all":
      return turns;
    case "recent":
    default:
      const limit = maxTurns ?? 3;
      return turns.slice(-limit);
  }
}

async function execute(
  args: Record<string, unknown>,
  context: AgentToolExecutionContext
): Promise<AgentToolExecutionResult> {
  const { runtime, workspace } = context;

  if (!runtime?.recentContext?.conversationTurns) {
    return { success: false, error: "无历史对话轮次" };
  }

  const parsed = GetConversationUsedReferencesArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `参数无效：${parsed.error.message}` };
  }

  const { turnScope, turnIndexes, maxTurns, maxRefsPerTurn } = parsed.data;

  const allTurns = runtime.recentContext.conversationTurns;
  const selectedTurns = selectTurns(allTurns, turnScope, turnIndexes, maxTurns);

  const refsPerTurn = maxRefsPerTurn ?? 20;
  const result: ConversationUsedReference[] = [];

  let totalFooterRefCount = 0;
  let totalCitedRefCount = 0;

  for (let i = 0; i < selectedTurns.length; i++) {
    const turn = selectedTurns[i];
    const turnIndex = allTurns.indexOf(turn);

    const footerRefs = turn.footerRefs ?? [];

    const dedupedFooterRefs: typeof footerRefs = [];
    const seenDocIds = new Set<string>();
    for (const ref of footerRefs) {
      const key = ref.docId || ref.docTitle;
      if (key && !seenDocIds.has(key)) {
        seenDocIds.add(key);
        dedupedFooterRefs.push(ref);
      }
    }

    const references = dedupedFooterRefs.slice(0, refsPerTurn).map((footerRef, refIndex) => {
      const ref: ConversationUsedReference["references"][number] = {
        referenceHandle: `prev_ref:${turnIndex}:${refIndex}`,
        docTitle: footerRef.docTitle,
        readLevel: "document",
        sourceTurnId: turn.turnId,
        sourceKind: "footer_reference",
        sourceAnswerItemIndexes: [],
      };

      if (footerRef.docId && footerRef.docId.trim().length > 0) {
        ref.internalDocId = footerRef.docId;
      }

      return ref;
    });

    totalFooterRefCount += references.length;

    result.push({
      turnIndex,
      turnId: turn.turnId,
      assistantSummary: turn.assistantSummary ?? "",
      answerItems: [],
      references,
    });
  }

  const totalRefItems = result.reduce((sum, r) => sum + r.references.length, 0);
  let handleWithDocIdCount = 0;
  let handleWithoutDocIdCount = 0;
  for (const turnRef of result) {
    for (const ref of turnRef.references) {
      if (ref.internalDocId && ref.internalDocId.trim().length > 0) {
        handleWithDocIdCount++;
      } else {
        handleWithoutDocIdCount++;
      }
    }
  }

  if (workspace) {
    workspace.conversationUsedReferences = result;

    const allDisplayedDocIds = new Set<string>();
    const selectedTurnIndexes: number[] = [];
    for (const turnRef of result) {
      selectedTurnIndexes.push(turnRef.turnIndex);
      for (const ref of turnRef.references ?? []) {
        if (ref.internalDocId && ref.internalDocId.trim().length > 0) {
          allDisplayedDocIds.add(ref.internalDocId);
        }
      }
    }

    const alreadyReadDocIds = new Set<string>(
      workspace.readDocuments.map((d) => d.docId).filter(Boolean)
    );
    const remainingDocIds = [...allDisplayedDocIds].filter((id) => !alreadyReadDocIds.has(id));

    const readDocIdSetForDisplayed = new Set<string>(
      [...alreadyReadDocIds].filter((id) => allDisplayedDocIds.has(id))
    );

    workspace.previousReferenceReadState = {
      totalCount: allDisplayedDocIds.size,
      selectedTurnIndexes,
      readDocIdSet: readDocIdSetForDisplayed,
      remainingDocIds,
      source: "displayed_footer_references",
    };

    console.info("[KB-AGENT | PREVIOUS_REFERENCE_READ_STATE_INITIALIZED_SAFE]", {
      totalCount: allDisplayedDocIds.size,
      alreadyReadCount: alreadyReadDocIds.size,
      remainingCount: remainingDocIds.length,
      selectedTurnIndexes,
    });
  }

  console.info("[KB-AGENT | CONVERSATION_USED_REFERENCES_LOADED_SAFE]", {
    totalTurnsAvailable: allTurns.length,
    selectedTurnIndexes: selectedTurns.map((t) => allTurns.indexOf(t)),
    footerRefCount: totalFooterRefCount,
    citedRefCount: totalCitedRefCount,
    dedupedReferenceCount: totalRefItems,
    handleWithDocIdCount,
  });

  const returnData: Record<string, unknown> = {
    conversationUsedReferences: result.map((turnRef) => ({
      ...turnRef,
      references: turnRef.references.map((ref) => {
        const { internalDocId: _internalDocId, ...safeRef } = ref as Record<string, unknown> & { internalDocId?: string };
        return safeRef;
      }),
    })),
    totalTurnsAvailable: allTurns.length,
    returnedTurnCount: result.length,
    returnedRefItemCount: totalRefItems,
    refCount: totalRefItems,
  };

  (returnData as any).internalConversationUsedReferences = result;

  if (totalRefItems === 0) {
    returnData.warning = "no historical displayed references found";
  }

  return {
    success: true,
    data: returnData,
  };
}

function formatObservation(result: AgentToolExecutionResult) {
  if (!result.success) {
    return { summary: "get_conversation_used_references 失败", error: result.error, warning: result.warning };
  }

  const data = result.data as Record<string, unknown> | undefined;
  const returnedTurnCount = (data?.returnedTurnCount as number) ?? 0;
  const totalTurnsAvailable = (data?.totalTurnsAvailable as number) ?? 0;
  const refCount = (data?.refCount as number) ?? 0;

  const conversationUsedRefs = data?.conversationUsedReferences as Array<{
    turnIndex: number;
    references: Array<{ referenceHandle: string; docTitle: string }>;
  }> | undefined;

  const refLines: string[] = [];
  if (conversationUsedRefs) {
    for (const turnRef of conversationUsedRefs) {
      for (const ref of turnRef.references ?? []) {
        const titleDisplay = ref.docTitle ? `《${ref.docTitle}》` : "（无标题）";
        refLines.push(`  - ${ref.referenceHandle} | ${titleDisplay}`);
      }
    }
  }

  const summaryLines = [`get_conversation_used_references 返回 ${returnedTurnCount} 轮、${refCount} 个引用（共 ${totalTurnsAvailable} 轮可用）`];
  if (refLines.length > 0) {
    summaryLines.push("历史已展示引用:");
    summaryLines.push(...refLines);
  }

  return {
    summary: summaryLines.join("\n"),
    counts: { returnedTurnCount, totalTurnsAvailable, refCount },
    warning: result.warning,
  };
}

export function createGetConversationUsedReferencesTool(): AgentToolDefinition {
  return {
    name: "get_conversation_used_references" as any,
    description: "用途：返回历史回答中显示过的参考资料 handle。输入：turnScope/turnIndexes/maxTurns/maxRefsPerTurn。输出：referenceHandle、docTitle、sourceTurnIndex、sourceTurnId、sourceKind。边界：不搜索，不读取正文，不返回隐藏 Evidence Pack，不返回读过但未展示的资料。",
    readOnly: true,
    inputSchema: GetConversationUsedReferencesArgsSchema,
    outputSchema: z.object({
      conversationUsedReferences: z.array(z.unknown()),
      totalTurnsAvailable: z.number(),
      returnedTurnCount: z.number(),
    }),
    availability: checkAvailability,
    budgetCost: calcBudgetCost,
    execute,
    observationFormatter: formatObservation,
  };
}
