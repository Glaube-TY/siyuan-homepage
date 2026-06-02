/**
 * Agent Planner Prompt
 *
 * 构建 Planner prompt，让 LLM 基于当前状态输出下一步工具动作。
 *
 * 职责：
 * - 描述当前问题、scope、workspace、允许/禁止动作
 * - 每次只输出一个 PlannerAction JSON
 * - 不包含对话分类、上下文模式、流程导向
 * - 不暴露内部工程实现名
 *
 * 固定边界：
 * - 只读知识库，不能修改笔记
 * - 不能输出 docIds/blockIds
 * - 系统根据 safe handle 执行读取
 */

import type { AgentScopeSummary } from "../scope/types";
import type { PlannerWorkspaceSummary } from "../workspace/workspace-summary";
import type { PlannerContextPack } from "../harness/context/context-pack-types";
import { getPlannerToolPromptSections, getPlannerToolPromptSectionsForAllowed, getPlannerVisibleToolNames } from "../harness/contracts/tool-contract-registry";
import type { AgentActionName } from "../actions/action-types";

export interface AgentPlannerPromptParams {
  currentQuestion: string;
  scopeSummary?: AgentScopeSummary;
  workspaceSummary: PlannerWorkspaceSummary;
  availableTools?: string[];
  plannerContextPack?: PlannerContextPack;
  currentDate?: string;
  currentDateTime?: string;
  structureContextBrief?: {
    focusedRootTitle: string;
    focusedRootTitlePath?: string;
    relationRules: string[];
    focusedTreeItems: {
      title: string;
      titlePath?: string;
      relationToFocus: "root" | "descendant" | "sibling" | "ancestor" | "branch_root";
      structuralReason?: string;
      shouldRead: boolean;
    }[];
    summaryText: string;
  };
  lastActionValidationError?: {
    actionType?: string;
    reason?: string;
  };
  allowedEvidenceModes?: string[];
}

function formatWorkspaceSummaryForPlanner(ws: PlannerWorkspaceSummary): string {
  const lines: string[] = [];
  const inventoryItems: typeof ws.candidateDocPreviews = [];
  const readableItems: typeof ws.candidateDocPreviews = [];

  for (const p of ws.candidateDocPreviews) {
    if (p.inventoryOnly) {
      inventoryItems.push(p);
    } else {
      readableItems.push(p);
    }
  }

  if (inventoryItems.length > 0) {
    lines.push("目录/导航清单:");
    const maxCount = Math.min(inventoryItems.length, 15);
    for (let i = 0; i < maxCount; i++) {
      const p = inventoryItems[i];
      const displayName = p.titlePath || (p.parentTitles && p.parentTitles.length > 0 ? [...p.parentTitles, p.title].filter(Boolean).join(" / ") : p.title) || "无标题";
      lines.push(`  - ${displayName}`);
    }
    if (inventoryItems.length > maxCount) {
      lines.push(`  ... 共 ${inventoryItems.length} 项`);
    }
  }

  if (readableItems.length > 0) {
    lines.push("可读候选资料:");
    const maxCount = Math.min(readableItems.length, 8);
    for (let i = 0; i < maxCount; i++) {
      const p = readableItems[i];
      const displayName = p.titlePath || (p.parentTitles && p.parentTitles.length > 0 ? [...p.parentTitles, p.title].filter(Boolean).join(" / ") : p.title) || "无标题";
      const sourceDesc = p.provenance === "search" ? "来自检索" : p.provenance === "structural_focus" ? "来自聚焦" : p.provenance === "previous_reference" ? "来自上一轮引用" : p.provenance || "";
      const meta = sourceDesc ? `（${sourceDesc}）` : "";
      lines.push(`  - 可读候选 #${i + 1}: ${displayName}${meta}`);
    }
  }
  if (ws.readDocTitles.length > 0) {
    lines.push(`已读取资料: ${ws.readDocTitles.join("、")}`);
  }
  if (ws.knowledgeMapPreviews && ws.knowledgeMapPreviews.length > 0) {
    lines.push("资料目录节点:");
    for (const p of ws.knowledgeMapPreviews.slice(0, 80)) {
      const displayName = p.titlePath || p.title;
      const hasChildren = p.childCount !== undefined && p.childCount > 0 ? "（有子文档）" : "";
      lines.push(`  - ${p.handle} | ${displayName}${hasChildren}`);
    }
  }
  return lines.join("\n");
}

function formatPlannerContextPackForPrompt(pack?: PlannerContextPack): string {
  if (!pack) return "";
  const lines: string[] = [];
  const unreadCandidateDocCount = pack.candidatePack?.unreadCandidateDocCount ?? 0;
  const evidenceItemCount = pack.evidenceSummary.evidenceItemCount ?? 0;

  const hasPrevious = pack.previousEvidencePack?.hasPreviousReferences ?? false;
  const hasCandidate = unreadCandidateDocCount > 0;
  const hasEvidence = evidenceItemCount > 0;

  if (hasPrevious || hasCandidate || hasEvidence) {
    lines.push("已有可读取资料来源：");
    let idx = 1;
    if (hasPrevious) {
      const pep = pack.previousEvidencePack!;
      const uniqueDocCount = pep.uniqueDocCount;
      const unreadCount = pack.turnObservation?.previousEvidenceUnreadCount ?? 0;
      lines.push(`${idx}. 历史已展示参考资料：可读 ${pep.readableCount} 项 / 唯一资料 ${uniqueDocCount} 个 / 未读 ${unreadCount} 个`);
      const maxDisplay = 8;
      const displayItems = pep.items.slice(0, maxDisplay);
      for (const item of displayItems) {
        const titleDisplay = item.title ? `《${item.title}》` : "";
        const statusDisplay = item.alreadyRead ? "已读" : "未读";
        const turnDisplay = item.turnIndex !== undefined ? `轮次${item.turnIndex}` : "";
        const parts = [item.handle, titleDisplay, turnDisplay, statusDisplay].filter(Boolean);
        lines.push(`   - ${parts.join(" | ")}`);
      }
      if (pep.items.length > maxDisplay) {
        lines.push(`   - 其余 ${pep.items.length - maxDisplay} 项`);
      }
      idx++;
    }
    if (hasCandidate) {
      lines.push(`${idx}. 当前检索候选：未读可读候选 ${unreadCandidateDocCount} 个`);
      idx++;
    }
    if (hasEvidence) {
      lines.push(`${idx}. 已读证据：${evidenceItemCount} 条`);
      idx++;
    }
  }

  if (pack.structurePack?.loaded) {
    const nodeCount = pack.structurePack.items.length;
    lines.push(`已加载文档树结构: ${nodeCount} 个节点`);
  }

  if (pack.turnObservation) {
    const obs = pack.turnObservation;
    if (obs.lastActionType && obs.lastActionResultKind) {
      lines.push(`上一动作: ${obs.lastActionType} → ${obs.lastActionResultKind}`);
    }
    if (obs.consecutiveZeroHitSearchCount > 0) {
      lines.push(`最近检索：连续 0 命中 ${obs.consecutiveZeroHitSearchCount} 次；最近一次新增候选 ${obs.lastSearchAddedCandidateCount} 个。`);
    }
  }

  if (pack.budgets) {
    lines.push(`检索剩余: ${pack.budgets.searchRemaining}，读取剩余: ${pack.budgets.readRemaining}`);
  }

  return lines.join("\n");
}

export function buildAgentPlannerPrompt(params: AgentPlannerPromptParams): string {
  const {
    currentQuestion,
    scopeSummary,
    workspaceSummary,
    plannerContextPack,
    currentDate,
    currentDateTime,
    structureContextBrief,
    lastActionValidationError,
    allowedEvidenceModes,
  } = params;

  const sections: string[] = [];

  sections.push("## 角色");
  sections.push("- 你是思源笔记 AI 知识库助手。");
  sections.push("- 你不能修改笔记，只能通过工具读取知识库。");
  sections.push("- 你严禁输出真实 docIds/blockIds/path/box/sourceBlockIds。");
  sections.push("");

  sections.push("## 边界");
  sections.push("- 你只能读取知识库，不能修改、创建、删除、移动、重命名任何笔记或块。");
  sections.push("- 你绝对不能输出 docIds 或 blockIds。");
  sections.push("- 用户可能用任意表达，请按原文语义理解。");
  sections.push("");

  if (currentDate || currentDateTime) {
    sections.push("## 当前时间");
    if (currentDate) sections.push(`当前日期：${currentDate}`);
    if (currentDateTime) sections.push(`当前时间：${currentDateTime}`);
  }

  sections.push("## 用户问题");
  sections.push(currentQuestion);

  if (scopeSummary) {
    sections.push("## 当前范围");
    const scopeTypeMap: Record<string, string> = {
      "whole_kb": "全库范围",
      "current_notebook": "当前笔记本范围",
      "current_doc_with_children": "当前文档及子文档范围",
      "fixed_docs": "指定文档范围",
    };
    sections.push(`类型: ${scopeTypeMap[scopeSummary.type] ?? scopeSummary.type}`);
    sections.push(`范围: ${scopeSummary.title}`);
  }

  if (workspaceSummary) {
    const wsText = formatWorkspaceSummaryForPlanner(workspaceSummary);
    if (wsText) {
      sections.push("## 可见资料");
      sections.push(wsText);
    }
  }

  if (plannerContextPack) {
    sections.push("## 当前状态");
    sections.push(formatPlannerContextPackForPrompt(plannerContextPack));
  }

  if (lastActionValidationError) {
    sections.push("## 上一动作结构校验失败");
    if (lastActionValidationError.actionType) {
      sections.push(`- actionType: ${lastActionValidationError.actionType}`);
    }
    if (lastActionValidationError.reason) {
      sections.push(`- reasonCode: ${lastActionValidationError.reason}`);
    }
  }

  if (structureContextBrief) {
    sections.push("## 已聚焦的文档树结构上下文");
    sections.push(structureContextBrief.summaryText);
    sections.push("");
    sections.push("### 结构关系规则");
    for (const rule of structureContextBrief.relationRules) {
      sections.push(`- ${rule}`);
    }
    sections.push("");
    sections.push("### 已聚焦文档树节点");
    for (const item of structureContextBrief.focusedTreeItems.slice(0, 15)) {
      const relationLabel = item.relationToFocus === "root" ? "（聚焦根）" :
        item.relationToFocus === "descendant" ? "（子文档）" :
        item.relationToFocus === "sibling" ? "（兄弟文档）" :
        item.relationToFocus === "ancestor" ? "（父文档）" : "";
      const reasonLabel = item.structuralReason ? ` - ${item.structuralReason}` : "";
      sections.push(`- ${item.title}${relationLabel}${reasonLabel}`);
    }
  }

  const plannerVisibleTools = getPlannerVisibleToolNames();
  const effectiveAllowed = params.availableTools && params.availableTools.length > 0
    ? params.availableTools.filter((a): a is AgentActionName => plannerVisibleTools.includes(a as AgentActionName))
    : plannerContextPack?.state.allowedActions
      ? plannerContextPack.state.allowedActions.filter((a): a is AgentActionName => plannerVisibleTools.includes(a as AgentActionName))
      : plannerVisibleTools;

  if (effectiveAllowed.length > 0) {
    sections.push("## 可用工具");
    sections.push(effectiveAllowed.join("、"));
  }

  sections.push("## 工具说明");
  if (effectiveAllowed.length > 0) {
    sections.push(getPlannerToolPromptSectionsForAllowed(effectiveAllowed));
  } else {
    sections.push(getPlannerToolPromptSections());
  }

  sections.push("资料目录/文档树是可见结构信息，包含 safe handle、titlePath 和层级关系，可作为路线图理解笔记空间结构；是否使用由你基于当前问题决定。");

  sections.push("## 工具结果关系");
  sections.push("- search_scope 返回内容检索候选，不读取正文。");
  sections.push("- list_scope_docs 返回目录/导航清单和 safe handles；无 query 时主要是 inventory/navigation。");
  sections.push("- focus_doc_scope 使用 safe handles 展开文档树，并可能产生 readable candidates。");
  sections.push("- read_candidate_docs 读取可读候选资料正文，返回证据。");
  sections.push("- get_conversation_used_references 列出历史引用的 safe handle，不读取正文。");
  sections.push("- read_previous_evidence 读取已展示引用的正文，返回证据。");
  sections.push("- answer 提交最终回答意图。");

  sections.push("## 参数格式");
  if (effectiveAllowed.includes("search_scope")) {
    sections.push("- search_scope: { \"queries\": [{ \"text\": \"...\", \"keywordQuery\"?: \"...\", \"fuzzyQuery\"?: \"...\", \"mode\"?: \"...\" }] }");
  }
  if (effectiveAllowed.includes("focus_doc_scope")) {
    sections.push("- focus_doc_scope: { \"handles\": [\"...\"] }");
  }
  if (effectiveAllowed.includes("read_candidate_docs")) {
    sections.push("- read_candidate_docs: {} 或 { \"selection\": \"unread_top_k\", \"k\": 4 }");
  }
  if (effectiveAllowed.includes("list_knowledge_map")) {
    sections.push("- list_knowledge_map: {} 或 { \"maxDepth\"?: number, \"maxNodes\"?: number }");
  }
  if (effectiveAllowed.includes("list_scope_docs")) {
    sections.push("- list_scope_docs: {} 或 { \"query\"?: \"...\" }");
  }
  if (effectiveAllowed.includes("answer")) {
    const evidenceModeEnum = allowedEvidenceModes && allowedEvidenceModes.length > 0
      ? allowedEvidenceModes.map((m) => `"${m}"`).join(" | ")
      : "\"with_evidence\" | \"insufficient_evidence\" | \"without_kb_evidence\"";
    sections.push(`- answer: { "evidenceMode": ${evidenceModeEnum} }（evidenceMode 必填）`);
  }
  if (effectiveAllowed.includes("read_previous_evidence")) {
    sections.push("- read_previous_evidence: {} 或 { \"k\": 3 } 或 { \"evidenceHandles\": [\"<历史引用列表中的 safe handle>\"] }");
  }
  if (effectiveAllowed.includes("get_conversation_used_references")) {
    sections.push("- get_conversation_used_references: {} 或 { \"turnScope\": \"last\" }");
  }

  sections.push("## 当前可选动作");
  sections.push(effectiveAllowed.join("、"));

  sections.push("## 输出格式");
  sections.push("只输出一个 JSON 对象，符合以下 schema：");
  const typeEnum = effectiveAllowed.length > 0
    ? effectiveAllowed.map((t) => `"${t}"`).join(" | ")
    : `"list_knowledge_map" | "focus_doc_scope" | "list_scope_docs" | "search_scope" | "read_candidate_docs" | "read_previous_evidence" | "read_block_context" | "get_conversation_used_references" | "get_doc_tree_context" | "answer"`;
  sections.push(`{
  "type": ${typeEnum},
  "reason": "string",
  "args": { ... },
  "evidenceGoal": {
    "minimumReadDocs": number (可选),
    "preferredReadDocs": number (可选),
    "coverage": "single" | "several" | "representative" | "broad" | "unknown",
    "needsFullDocument": boolean
  } (可选),
  "constraints": {
    "requireUnreadFromPreviousTurn": boolean (可选)
  } (可选),
  "confidence": number (0-1)
}`);
  sections.push("");
  sections.push("不要输出任何其他内容，只输出 JSON。");

  return sections.join("\n");
}
