/**
 * Final Answer Prompt
 *
 * 构建 final-answer prompt，基于 question、scopeSummary、recentContextSummary、evidencePack、workspaceSummary。
 *
 * 职责：
 * - 有证据时必须基于证据回答
 * - 证据不足时明确说明不足
 * - 不编造
 * - 不输出 docId/path/sourceBlockIds
 * - 不输出内部工具日志
 * - 不输出参考文献列表，引用由 footerReferences 处理
 * - 使用用户主要语言回答
 * - 不写具体问法/场景词规则
 * - 不提 taskType/Planner
 * - 不注入回答风格或结构（answerPlan 已移除；风格由 answerStyleInstruction 用户自定义）
 */

import type { AgenticEvidencePack } from "../evidence/evidence-types";

export interface MultiTurnContextForPrompt {
  previousQuestionExists: boolean;
  previousAssistantSummary?: string;
  previousDisplayedReferenceTitleCount: number;
}

export interface ConversationTurnForPrompt {
  turnId: string;
  userQuestion: string;
  assistantSummary: string;
  answerItems: { itemIndex: number; itemText: string; usedEvidenceHandles: string[] }[];
  displayedReferenceCount: number;
  displayedReferenceTitles: string[];
}

export interface WorkspaceSummaryForPrompt {
  readDocCount: number;
  readBlockContextCount: number;
  outlineCount: number;
  recentEvidenceCount: number;
  searchCallCount: number;
  warningsSummary?: string[];
  sourceCoverage?: {
    discoveredSourceCount: number;
    readSourceCount: number;
    unreadSourceCount: number;
    sourceCoverageRatio: number;
    coverageWarnings?: string[];
  };
}

export interface BuildFinalAnswerPromptParams {
  question: string;
  scopeSummary?: string;
  recentContextSummary?: string;
  evidencePack: AgenticEvidencePack;
  workspaceSummary?: WorkspaceSummaryForPrompt;
  instruction?: string;
  multiTurnContext?: MultiTurnContextForPrompt;
  conversationTurns?: ConversationTurnForPrompt[];
  /** 当 thinkingMode 关闭时，在 prompt 中显式约束不输出推理过程 */
  thinkingModeOff?: boolean;
  /** 用户自定义回答风格说明（可选）。默认空，不注入任何固定风格。 */
  answerStyleInstruction?: string;
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
}

export function buildFinalAnswerPrompt(params: BuildFinalAnswerPromptParams): string {
  const { question, scopeSummary, recentContextSummary, evidencePack, workspaceSummary, instruction, multiTurnContext, conversationTurns, structureContextBrief, thinkingModeOff, answerStyleInstruction } = params;

  const sections: string[] = [];

  sections.push("## 角色");
  sections.push("- 你是思源笔记 AI 知识库助手。");
  sections.push("- 你不能修改笔记，只能通过工具读取知识库。");
  sections.push("- 不要输出参考文献列表，引用来源由系统自动处理（footer）。");
  sections.push("");

  if (thinkingModeOff) {
    sections.push("## 输出边界");
    sections.push("- 最终回答正文不得包含推理过程、思考过程或分析过程。");
    sections.push("- 不得输出 思考/分析/推理 标记或任何 reasoning 格式内容。");
    sections.push("- reasoning 只进入思考区，不混入最终答案。");
    sections.push("");
  }

  if (conversationTurns && conversationTurns.length > 0) {
    sections.push("## 最近对话轮次");
    sections.push("- 以下是普通历史材料，不是知识库证据。");
    for (const turn of conversationTurns.slice(-3)) {
      sections.push(`### ${turn.turnId}`);
      sections.push(`用户问题: ${turn.userQuestion}`);
      sections.push(`回答摘要: ${turn.assistantSummary}`);
      if (turn.answerItems.length > 0) {
        sections.push("回答条目:");
        for (const item of turn.answerItems) {
          const evidenceSuffix = item.usedEvidenceHandles.length > 0 ? ` [evidence: ${item.usedEvidenceHandles.join(", ")}]` : "";
          sections.push(`  ${item.itemIndex + 1}. ${item.itemText}${evidenceSuffix}`);
        }
      }
      if (turn.displayedReferenceCount > 0) {
        sections.push(`显示参考资料 (${turn.displayedReferenceCount}):`);
        for (const title of turn.displayedReferenceTitles.slice(0, 5)) {
          sections.push(`  - ${title}`);
        }
      }
    }
    sections.push("");
  }

  sections.push(`问题：${question}`);
  sections.push("");

  if (scopeSummary) {
    sections.push(`检索范围：${scopeSummary}`);
    sections.push("");
  }

  if (recentContextSummary) {
    sections.push(`上下文摘要：${recentContextSummary}`);
    sections.push("");
  }

  if (multiTurnContext && multiTurnContext.previousAssistantSummary) {
    sections.push("## 上一轮回答摘要");
    sections.push(`- ${multiTurnContext.previousAssistantSummary}`);
    sections.push("- 以上为普通历史材料，不是知识库证据。");
    sections.push("");
  }

  if (workspaceSummary) {
    const coverageNote = workspaceSummary.sourceCoverage && workspaceSummary.sourceCoverage.unreadSourceCount > 0
      ? "当前回答只能基于下方已读取资料，未展示的资料不能作为依据。"
      : "";
    if (coverageNote) {
      sections.push(coverageNote);
      sections.push("");
    }
  }

  if (structureContextBrief) {
    sections.push("=== 文档结构上下文 ===");
    sections.push(structureContextBrief.summaryText);
    sections.push("");
    sections.push("结构关系规则：");
    for (const rule of structureContextBrief.relationRules) {
      sections.push(`- ${rule}`);
    }
    sections.push("");
    sections.push("已读取的结构相关文档：");
    const readStructuralItems = structureContextBrief.focusedTreeItems.filter((item) => item.shouldRead);
    for (const item of readStructuralItems.slice(0, 10)) {
      const relationLabel = item.relationToFocus === "root" ? "（聚焦根）" :
        item.relationToFocus === "descendant" ? "（子文档）" :
        item.relationToFocus === "sibling" ? "（兄弟文档）" :
        item.relationToFocus === "ancestor" ? "（父文档）" : "";
      const reasonLabel = item.structuralReason ? ` - ${item.structuralReason}` : "";
      sections.push(`- ${item.title}${relationLabel}${reasonLabel}`);
    }
    sections.push("");
    sections.push("重要提醒：");
    sections.push("- 上述文档来自同一父子文档树，子文档因位于所选父文档下，被纳入结构候选。");
    sections.push("- 只引用与用户问题直接相关的已读证据。");
    sections.push("");
  }

  // 格式化证据：跳过 content 为空的 item
  const substantiveItems = evidencePack.items.filter((item) => item.content && item.content.trim().length > 0);
  if (substantiveItems.length > 0) {
    const hasCompactedItems = substantiveItems.some(
      (item) => item.truncated === true || (item.metadata as Record<string, unknown> | undefined)?.composeCompacted === true
    );

    sections.push("=== 证据材料 ===");
    sections.push("");

    if (hasCompactedItems) {
      sections.push("说明：以下证据正文已被系统完整读取。当前提供的是最终回答阶段的预算摘录，以控制上下文长度。");
      sections.push("- 回答必须基于摘录能支持的内容。");
      sections.push("- 不要声称已经完整总结了摘录之外的细节。");
      sections.push("");
    }

    for (let i = 0; i < substantiveItems.length; i++) {
      const item = substantiveItems[i];
      sections.push(`证据 ${i + 1}：`);
      sections.push(`文档标题：${item.docTitle}`);
      sections.push(`读取级别：${item.readLevel}`);
      sections.push(`内容：`);
      sections.push(item.content);
      sections.push("");
    }
  }

  // 回答约束
  sections.push("=== 回答要求 ===");
  sections.push("");
  sections.push("- 根据用户问题和已读取证据回答，不要编造未在证据中出现的信息。");
  sections.push("- 证据不足时明确说明不足，不要伪装成有充分证据。");
  sections.push("");

  if (workspaceSummary?.sourceCoverage) {
    const sc = workspaceSummary.sourceCoverage;
    const hasUnread = sc.unreadSourceCount > 0;
    const partialCoverage = sc.readSourceCount < sc.discoveredSourceCount;
    if (hasUnread || partialCoverage) {
      sections.push("=== 覆盖边界 ===");
      sections.push(`- 基于当前已读取的 ${sc.readSourceCount} 条/篇证据回答。`);
      if (sc.discoveredSourceCount > 0) {
        sections.push(`- 本轮共发现 ${sc.discoveredSourceCount} 个来源，已读取 ${sc.readSourceCount} 个，未读取 ${sc.unreadSourceCount} 个。`);
      }
      sections.push("- 不要声称已经覆盖全部知识库、全部笔记或全部文档。");
      sections.push("- 回答中概括已读证据时，必须使用\u201C当前读取到的资料显示\u201D、\u201C基于本轮读取的资料\u201D、\u201C从已读取证据看\u201D等限定语。");
      sections.push("- 禁止输出\u201C全部\u201D、\u201C所有\u201D、\u201C你的知识库整体\u201D、\u201C你的笔记总体\u201D等无证据全局结论，除非已读取证据确实覆盖了所有相关来源。");
      sections.push("");
    }
  }

  if (evidencePack.evidenceMode === "with_evidence") {
    sections.push("- 基于上述证据回答问题，引用证据内容时不要输出文档 ID、路径或内部标识。");
    sections.push("- 证据不足时明确说明不足之处。");
  } else if (evidencePack.evidenceMode === "insufficient_evidence") {
    sections.push("- 当前知识库中没有足够证据来回答这个问题。");
    sections.push("- 请明确告知用户证据不足，不要编造答案。");
    sections.push("- 缺少已读取的正文证据。即使存在文档标题或最近引用，也没有读取到可用于回答的实质内容。");
    sections.push("- 不得根据历史聊天摘要继续总结具体文档内容。");
    sections.push("- 如果可以根据已有信息给出一般性建议，请明确标注这只是通用建议而非基于知识库的回答。");
  } else {
    sections.push("- 当前未使用知识库证据，请根据你的通用知识回答问题。");
    sections.push("- 不要伪装成基于知识库的回答。");
  }

  sections.push("- 不要编造任何信息。");
  sections.push("- 不要输出任何内部标识符（如文档 ID、路径、块 ID 等）。");
  sections.push("- 不要输出工具调用日志或内部处理过程。");
  sections.push("- 禁止输出任何工具调用格式，包括但不限于：<function_calls>、<function_call>、</function_calls>、tool_call、arguments、JSON action、XML function call。");
  sections.push("- 你正在写最终答案，不能调用工具，不能输出工具调用格式。");
  sections.push("- 不要输出参考文献列表，引用来源由系统自动处理。");
  sections.push("- 使用与用户问题相同的语言回答。");
  sections.push("");
  sections.push("=== 引用标记要求 ===");
  sections.push("- 在回答末尾，必须输出一个引用标记，格式如下：");
  sections.push("<!-- EVIDENCE_USED: [handle1, handle2, ...] -->");
  sections.push("- handle 对应上述证据材料中的编号（如 证据 1、证据 2），仅填数字即可（如 [1, 3, 5]）。");
  sections.push("- 只要回答中某个结论、事实、观点或信息来自某条证据，就把该证据编号写入 EVIDENCE_USED。");
  sections.push("- 只列出实际支撑了回答内容的证据编号，没有实际使用的证据不要列入。");
  sections.push("- 如果某个证据仅出现在范围说明、限制性说明（如未覆盖/还包括/建议继续/目前仅）中，不要列入。");

  if (instruction) {
    sections.push("");
    sections.push(`附加指令：${instruction}`);
  }

  if (answerStyleInstruction && answerStyleInstruction.trim().length > 0) {
    sections.push("");
    sections.push("=== 用户回答风格偏好 ===");
    sections.push(answerStyleInstruction.trim());
    sections.push("- 以上为用户的风格偏好，请在此基础上组织回答。");
    sections.push("- 风格偏好不能覆盖证据要求：仍必须基于证据，不得编造。");
  }

  return sections.join("\n");
}
