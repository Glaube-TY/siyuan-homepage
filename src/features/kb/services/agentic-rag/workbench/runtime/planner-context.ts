/**
 * PlannerContext
 *
 * 拼装 AI Planner 看到的提示上下文。
 * - 每轮从 ObservationStore 读最新 observations。
 * - 不含流程控制字段；只含事实（manifest / sections / observations / budget）。
 */

import type { SkillRegistry } from "../registries/skill-registry";
import type { ToolRegistry } from "../registries/tool-registry";
import type {
  SkillPromptSection,
  SkillRuntimeContext,
  SkillObservation,
} from "../contracts/skill-contract";
import type {
  ToolManifest,
  ToolRuntimeContext,
  PlannerVisibleObservationContent,
  PlannerVisibleKnowledgeMapNode,
} from "../contracts/tool-contract";
import type { ObservationStore } from "./observation-store";
import type { BudgetGuard } from "./budget-guard";
import type { RecentTurnContext } from "../contracts/recent-turn-context";

/** 来自 caller 的输入。Harness 在生成 prompt 时把已有事实填进来。 */
export interface PlannerContextInput {
  question: string;
  /**
   * 用户在 UI 上选择的 scopeMode（运行时事实）。
   * - prompt 渲染时必须转换成自然语言范围说明，不输出内部枚举值。
   * - 仅供 Planner 看到当前上下文事实；**不**参与工具 / answer 自动选择。
   * - 取代旧的 needsKnowledgeBase。
   */
  activeScopeMode: import("../../scope/types").AgentScopeMode;
  /** 预算快照。 */
  budgets: {
    searchRemaining: number;
    readRemaining: number;
  };
  /** 候选池 / 证据包的事实摘要（不暴露内容）。 */
  candidateSummary?: SkillRuntimeContext["candidateSummary"];
  contentSummary?: SkillRuntimeContext["contentSummary"];
  /**
   * 初始 observations（仅作为种子）。
   * 在 PlannerLoop 中，每一轮 buildPlannerContext 会**优先**从 observationStore 读最新，
   * 本字段**只**作为种子使用。
   */
  observations: SkillObservation[];
  /**
   * Observation store。PlannerLoop 中每轮 buildPlannerContext 必须传它，
   * 确保 tool 执行后的 observation 立即对下一轮 Planner 可见。
   */
  observationStore?: ObservationStore;
  /** 用户在 UI 上显式启用 / 关闭的 skill 名称集合（per-ctx，**不**污染 registry）。 */
  userEnabledSkillNames: readonly string[];
  userDisabledSkillNames?: readonly string[];
  /** 工具调用累计计数。 */
  callCounts?: Record<string, number>;
  /**
   * 最近对话上下文（通用，脱敏）。
   * - 包含最近 N 条用户/助手消息摘要。
   * - 包含上一轮展示的引用摘要（docId/blockId/url + title + sourceType + snippet）。
   * - 包含上一轮可见产物摘要（如文档树标题、候选列表数量等）。
   * - 内容只作为中性上下文事实，不触发任何工具选择。
   */
  recentConversationContext?: readonly RecentTurnContext[];
}

/**
 * v3 Planner context：拼装所有给 Planner 看的输入。
 * 注意：本对象只承载**事实**与 **prompt 段落**，不承载业务动作 / 业务路线。
 */
export interface PlannerContext {
  /** 全局身份 / 默认目标，写入 Planner system prompt 顶部。 */
  globalIdentity: {
    role: string;
    defaultGoal: string;
    body: string;
  };
  /** 按 priority 倒序排好的 Skill 段落。 */
  skillSections: SkillPromptSection[];
  /** Planner 可见的 Tool manifest 列表（已过滤 execution-only）。 */
  toolManifest: ToolManifest[];
  /** 累计 observation（仅事实）。 */
  observations: SkillObservation[];
  /** 预算快照（直接透传）。 */
  budgets: PlannerContextInput["budgets"];
  /** 原始问题 + 用户选择的 scopeMode（仅运行时事实；prompt 中转为自然语言）。 */
  question: string;
  activeScopeMode: PlannerContextInput["activeScopeMode"];
  /** 最近对话上下文（通用，脱敏）。 */
  recentConversationContext?: readonly RecentTurnContext[];
}

const GLOBAL_IDENTITY_BODY =
  "你是运行在思源笔记中的 AI 助手，帮助用户处理知识管理相关问题和任务。";

const GLOBAL_ROLE = "思源笔记 AI 助手";
const DEFAULT_GOAL = "帮助用户完成知识管理相关任务";

/**
 * 构造 PlannerContext。
 *
 * - observations 从 observationStore 读最新，**不**直接用 input.observations。
 * - userEnabled / userDisabled **只**从 input 传入，**不**改写 registry 状态。
 *
 * 流程：
 * 1. 构造 SkillRuntimeContext（只读）。
 * 2. 调用 SkillRegistry.buildSkillPromptSections 拿到所有 enabled skill 的段落。
 * 3. 构造 ToolRuntimeContext，调用 ToolRegistry.getPlannerToolManifest 拿到 manifest。
 * 4. 从 observationStore.getPlannerObservations() 拿到最新 observations。
 * 5. 拼装 PlannerContext 返回。
 */
export function buildPlannerContext(
  input: PlannerContextInput,
  options: {
    skillRegistry: SkillRegistry;
    toolRegistry: ToolRegistry;
    budgetGuard?: BudgetGuard;
  },
): PlannerContext {
  const observations = input.observationStore
    ? input.observationStore.getPlannerObservations()
    : input.observations;

  const toolCtx = toToolRuntimeContext(input);
  const toolManifest = options.toolRegistry.getPlannerToolManifest(
    toolCtx,
    options.budgetGuard,
  );

  const skillCtx: SkillRuntimeContext = {
    question: input.question,
    activeScopeMode: input.activeScopeMode,
    toolManifest,
    enabledSkillNames: options.skillRegistry
      .getEnabledSkills(makeSkillPrefsCtx(input, toolManifest, observations))
      .map((s) => s.name),
    observations,
    budgets: input.budgets,
    candidateSummary: input.candidateSummary,
    contentSummary: input.contentSummary,
    userEnabledSkillNames: input.userEnabledSkillNames,
    userDisabledSkillNames: input.userDisabledSkillNames,
  };

  const skillSections = options.skillRegistry.buildSkillPromptSections(skillCtx);

  return {
    globalIdentity: {
      role: GLOBAL_ROLE,
      defaultGoal: DEFAULT_GOAL,
      body: GLOBAL_IDENTITY_BODY,
    },
    skillSections,
    toolManifest,
    observations,
    budgets: input.budgets,
    question: input.question,
    activeScopeMode: input.activeScopeMode,
    recentConversationContext: input.recentConversationContext,
  };
}

function toToolRuntimeContext(input: PlannerContextInput): ToolRuntimeContext {
  return {
    question: input.question,
    budgets: input.budgets,
    candidateSummary: input.candidateSummary,
    contentSummary: input.contentSummary,
    callCounts: input.callCounts ?? {},
  };
}

function makeSkillPrefsCtx(
  input: PlannerContextInput,
  toolManifest: readonly ToolManifest[],
  observations: SkillObservation[],
): SkillRuntimeContext {
  return {
    question: input.question,
    activeScopeMode: input.activeScopeMode,
    toolManifest,
    enabledSkillNames: input.userEnabledSkillNames,
    observations,
    budgets: input.budgets,
    candidateSummary: input.candidateSummary,
    contentSummary: input.contentSummary,
    userEnabledSkillNames: input.userEnabledSkillNames,
    userDisabledSkillNames: input.userDisabledSkillNames,
  };
}

/**
 * 把 PlannerContext 渲染成一段可调试 / 可写入 system prompt 的多行文本。
 * 顺序：
 * 1. global identity
 * 2. enabled skill sections（按 priority 倒序）
 * 3. tool manifest 列表
 * 4. observations（压缩成 N 行计数）
 */
export function renderPlannerContextPreview(ctx: PlannerContext): string {
  const blocks: string[] = [];
  blocks.push("# 助手定位");
  blocks.push(ctx.globalIdentity.body);
  blocks.push("");

  blocks.push("# 本轮用户请求");
  blocks.push(`当前检索范围：${formatScopeModeForPrompt(ctx.activeScopeMode)}`);
  blocks.push("请围绕下面这条用户请求决定是否需要查找或读取资料，并在回答中直接回应用户：");
  blocks.push(ctx.question);
  blocks.push("");

  // 最近对话上下文（帮助理解指代，不触发工具选择）
  if (ctx.recentConversationContext && ctx.recentConversationContext.length > 0) {
    blocks.push("# 最近对话上下文");
    blocks.push("最近对话上下文仅用于理解用户指代和延续任务，不代表必须调用某个工具。");
    blocks.push("如果用户使用'里面、上面、刚才、这些文档'等指代，可以结合最近上下文理解。");
    for (const turn of ctx.recentConversationContext) {
      const roleLabel = turn.role === "user" ? "用户" : "助手";
      blocks.push(`- ${roleLabel}：${turn.textPreview}`);
      if (turn.displayReferences && turn.displayReferences.length > 0) {
        for (const ref of turn.displayReferences) {
          const snippetPart = ref.snippet ? `；${ref.snippet.slice(0, 80)}` : "";
          const idPart = ref.docId ? `（docId: ${ref.docId}）` : "";
          blocks.push(`  - ${ref.title}${idPart}${snippetPart}`);
        }
      }
      if (turn.visibleArtifacts && turn.visibleArtifacts.length > 0) {
        for (const artifact of turn.visibleArtifacts) {
          const countPart = artifact.count !== undefined ? `（${artifact.count}）` : "";
          const titlePart = artifact.title ? `：${artifact.title}` : "";
          const summaryPart = artifact.summary ? `；${artifact.summary}` : "";
          blocks.push(`  - ${artifact.type}${countPart}${titlePart}${summaryPart}`);
        }
      }
    }
    blocks.push("");
  }

  blocks.push("# 可参考能力说明");
  if (ctx.skillSections.length === 0) {
    blocks.push("（无额外能力说明）");
  } else {
    for (const section of ctx.skillSections) {
      blocks.push(`## ${section.title}`);
      blocks.push(section.body);
      blocks.push("");
    }
  }

  blocks.push("# 可用工具");
  if (ctx.toolManifest.length === 0) {
    blocks.push("（当前无可用工具）");
  } else {
    for (const tool of ctx.toolManifest) {
      const availability = tool.availability.available
        ? "可用"
        : `不可用：${formatReasonCodeForPrompt(tool.availability.reasonCode)}`;
      const safety = formatSafety(tool);
      blocks.push(
        `- ${tool.name}：${tool.capability}；安全性：${safety}；状态：${availability}`,
      );
      blocks.push(`    ${tool.description}`);
      if (tool.inputHint) {
        blocks.push(`    参数说明：${tool.inputHint}`);
      }
      blocks.push(`    边界：${tool.boundary}`);
    }
  }

  blocks.push("");
  blocks.push("# 已获得的信息（最近 10 条）");
  const tail = ctx.observations.slice(-10);
  if (tail.length === 0) {
    blocks.push("（暂无）");
  } else {
    for (const o of tail) {
      const source = o.toolName ? `工具 ${o.toolName}` : formatObservationKindForPrompt(o.kind);
      const facts = formatObservationFactsForPrompt(o.facts);
      const summaryPart = o.summary ? `；说明：${o.summary}` : "";
      const reasonPart = o.reasonCode ? `；状态：${formatReasonCodeForPrompt(o.reasonCode)}` : "";
      blocks.push(`- ${source}${facts}${reasonPart}${summaryPart}`);
      if (o.content) {
        blocks.push(renderObservationContent(o.content));
      }
    }
  }

  blocks.push("");
  blocks.push("# 剩余读取预算");
  blocks.push(
    `搜索 ${ctx.budgets.searchRemaining} 次；读取内容 ${ctx.budgets.readRemaining} 次。`,
  );

  return blocks.join("\n");
}

function formatScopeModeForPrompt(mode: PlannerContext["activeScopeMode"]): string {
  switch (mode) {
    case "whole_kb":
      return "整个知识库";
    case "current_doc":
      return "当前文档";
    case "custom_docs":
      return "用户指定的文档范围";
    default:
      return "当前可用知识范围";
  }
}

function formatReasonCodeForPrompt(reasonCode: string | undefined): string {
  if (!reasonCode) return "原因未说明";
  const labels: Record<string, string> = {
    prerequisite_missing: "前置条件不足",
    budget_exhausted: "预算已用尽",
    unavailable: "暂不可用",
    invalid_input: "输入不符合要求",
    validation_failed: "参数校验失败",
    execution_error: "执行失败",
    planner_decision_invalid: "决策格式无效",
    planner_decision_missing: "缺少有效决策",
  };
  return labels[reasonCode] ?? reasonCode;
}

function formatObservationKindForPrompt(kind: SkillObservation["kind"]): string {
  const labels: Record<SkillObservation["kind"], string> = {
    tool_executed: "工具执行结果",
    tool_failed: "工具执行失败",
    tool_zero_hits: "工具未找到结果",
    tool_observation: "工具返回信息",
    turn_started: "本轮开始",
    turn_finished: "本轮结束",
    skill_observation: "能力说明相关信息",
    budget_exhausted: "读取预算已用尽",
    planner_returned_no_action: "未获得有效决策",
  };
  return labels[kind] ?? "已获得信息";
}

function formatObservationFactsForPrompt(facts: SkillObservation["facts"]): string {
  if (!facts) return "";
  const parts: string[] = [];
  if (facts.hits !== undefined) parts.push(`命中 ${facts.hits} 条`);
  if (facts.candidateDocCount !== undefined) parts.push(`候选文档 ${facts.candidateDocCount} 篇`);
  if (facts.returnedCandidateCount !== undefined) parts.push(`返回候选 ${facts.returnedCandidateCount} 条`);
  if (facts.focusedDocCount !== undefined) parts.push(`聚焦文档 ${facts.focusedDocCount} 篇`);
  if (facts.strongCandidateDocCount !== undefined) parts.push(`强相关候选 ${facts.strongCandidateDocCount} 篇`);
  if (facts.unreadReadableCandidateCount !== undefined) parts.push(`未读可读候选 ${facts.unreadReadableCandidateCount} 篇`);
  if (facts.contentItemCount !== undefined) parts.push(`已读内容 ${facts.contentItemCount} 条`);
  if (facts.readDocCount !== undefined) parts.push(`已读文档 ${facts.readDocCount} 篇`);
  if (facts.totalNodeCount !== undefined) parts.push(`结构节点 ${facts.totalNodeCount} 个`);
  if (facts.returnedNodeCount !== undefined) parts.push(`返回节点 ${facts.returnedNodeCount} 个`);
  if (facts.notebookCount !== undefined) parts.push(`笔记本 ${facts.notebookCount} 个`);
  if (facts.matchedNodeCount !== undefined) parts.push(`匹配节点 ${facts.matchedNodeCount} 个`);
  if (facts.referenceCount !== undefined) parts.push(`历史引用 ${facts.referenceCount} 条`);
  if (facts.isZeroHits === true) parts.push("未找到结果");
  if (facts.searchRemaining !== undefined) parts.push(`剩余搜索 ${facts.searchRemaining} 次`);
  if (facts.readRemaining !== undefined) parts.push(`剩余读文档 ${facts.readRemaining} 次`);
  if (facts.errorCode) parts.push(`错误：${formatReasonCodeForPrompt(facts.errorCode)}`);
  return parts.length > 0 ? `：${parts.join("；")}` : "";
}

function renderObservationContent(content: PlannerVisibleObservationContent): string {
  if (content.type === "knowledge_map") {
    return renderKnowledgeMapPreview(content);
  }
  if (content.type === "conversation_references") {
    return renderConversationReferencesPreview(content);
  }
  if (content.type === "search_results") {
    return renderSearchResultsPreview(content);
  }
  if (content.type === "scope_docs") {
    return renderScopeDocsPreview(content);
  }
  if (content.type === "content_items" || content.type === "read_items") {
    return renderContentItemsPreview(content);
  }

  return "";
}

function renderContentItemsPreview(
  content: Extract<PlannerVisibleObservationContent, { type: "content_items" | "read_items" }>,
): string {
  const maxItems = 5;
  const maxTotalContentChars = 40000;
  const maxPerItemChars = 15000;
  const lines: string[] = [];
  lines.push("  已读内容片段：");

  let totalChars = 0;
  let itemsShown = 0;

  for (const item of content.items.slice(0, maxItems)) {
    const idPart = item.docId ? `docId: ${item.docId}` : "";
    const charsInfo = item.truncated
      ? `工具返回 ${item.returnedContentChars ?? 0} / 原文 ${item.originalContentChars ?? "?"} 字符（工具层截断）`
      : `工具返回 ${item.returnedContentChars ?? 0} 字符`;
    const cursorInfo = item.nextCursor ? `，nextCursor: ${item.nextCursor}` : "";
    lines.push(`  - #${item.referenceIndex}「${item.title}」（${idPart}；${charsInfo}${cursorInfo}）`);

    const body = item.content || item.snippet || "";
    if (body.trim()) {
      const remaining = maxTotalContentChars - totalChars;
      if (remaining <= 0) {
        lines.push("  （渲染上限已达，剩余已读内容未展示）");
        break;
      }
      const itemLimit = Math.min(maxPerItemChars, remaining);
      const renderTruncated = body.length > itemLimit;
      const rendered = body.slice(0, itemLimit);
      totalChars += rendered.length;
      itemsShown++;

      if (renderTruncated) {
        lines.push(`\n${rendered}\n...（渲染层截断：以上是正文前 ${rendered.length} 字符；工具仍有${item.nextCursor ? " nextCursor 可" : " "}继续读取）\n`);
      } else {
        lines.push(`\n${rendered}\n`);
      }
    }
  }

  if (content.errors && content.errors.length > 0) {
    lines.push("  读取错误：");
    for (const err of content.errors.slice(0, 3)) {
      const idInfo = err.docId ? `docId: ${err.docId}` : err.blockId ? `blockId: ${err.blockId}` : "";
      lines.push(`  - ${idInfo} ${err.code}: ${err.message}（${err.hint ?? "无额外提示"}）`);
    }
  }

  if (content.items.length > maxItems) {
    lines.push(`  ...（还有 ${content.items.length - maxItems} 条已读内容未展示）`);
  }
  if (content.truncated || totalChars >= maxTotalContentChars) {
    lines.push("  部分文档还有剩余内容，可由 Planner 显式使用 nextCursor 继续读取。");
  }

  return lines.join("\n");
}

function renderScopeDocsPreview(
  content: Extract<PlannerVisibleObservationContent, { type: "scope_docs" }>,
): string {
  const maxDocs = 30;
  const lines: string[] = [];
  lines.push("  当前范围内的文档：");
  for (const doc of content.docs.slice(0, maxDocs)) {
    const depthPart = doc.depth !== undefined ? `；层级 ${doc.depth}` : "";
    const childPart = doc.childCount !== undefined ? `；子文档 ${doc.childCount} 篇` : "";
    const idPart = doc.docId ? `（docId: ${doc.docId}）` : "";
    lines.push(`  - ${doc.title}${idPart}${depthPart}${childPart}`);
  }
  if (content.truncated || content.docs.length > maxDocs) {
    lines.push("  ...（文档列表已截断）");
  }
  return lines.join("\n");
}

function renderSearchResultsPreview(
  content: Extract<PlannerVisibleObservationContent, { type: "search_results" }>,
): string {
  const maxCandidates = 20;
  const lines: string[] = [];
  lines.push("  搜索候选：");
  for (const candidate of content.candidates.slice(0, maxCandidates)) {
    const scorePart = candidate.score !== undefined ? `；相关度 ${candidate.score}` : "";
    const previewPart = candidate.preview ? `；预览：${candidate.preview}` : "";
    const idPart = candidate.docId ? `（docId: ${candidate.docId}）` : "";
    lines.push(`  - #${candidate.rank} ${candidate.title}${idPart}${scorePart}${previewPart}`);
  }
  if (content.truncated || content.candidates.length > maxCandidates) {
    lines.push("  ...（搜索候选已截断）");
  }
  return lines.join("\n");
}

function renderConversationReferencesPreview(
  content: Extract<PlannerVisibleObservationContent, { type: "conversation_references" }>,
): string {
  const maxReferences = 20;
  const lines: string[] = [];
  lines.push("  本会话已展示的引用：");
  for (const ref of content.references.slice(0, maxReferences)) {
    const usedPart = ref.usedCount !== undefined ? `；使用次数 ${ref.usedCount}` : "";
    const idPart = ref.docId ? `（docId: ${ref.docId}）` : "";
    lines.push(`  - ${ref.title}${idPart}${usedPart}`);
  }
  if (content.truncated || content.references.length > maxReferences) {
    lines.push("  ...（引用列表已截断）");
  }
  return lines.join("\n");
}

function renderKnowledgeMapPreview(
  content: Extract<PlannerVisibleObservationContent, { type: "knowledge_map" }>,
): string {
  const maxNotebooks = 3;
  const maxRootsPerNotebook = 20;
  const maxTotalNodes = 60;
  const maxDepth = 3;

  const lines: string[] = [];
  lines.push("  知识库结构：");

  let totalNodes = 0;
  let clipped = false;
  const notebooks = content.notebooks.slice(0, maxNotebooks);

  for (const nb of notebooks) {
    if (totalNodes >= maxTotalNodes) break;
    lines.push(`  - ${nb.title} (docs=${nb.docCount})`);

    const roots = nb.roots.slice(0, maxRootsPerNotebook);
    for (const node of roots) {
      if (totalNodes >= maxTotalNodes) {
        clipped = true;
        break;
      }
      appendKnowledgeMapNode(lines, node, {
        indentLevel: 2,
        depth: 1,
        maxDepth,
        maxTotalNodes,
        totalNodesRef: () => totalNodes,
        increment: () => {
          totalNodes += 1;
        },
        markClipped: () => {
          clipped = true;
        },
      });
    }

    if (nb.roots.length > maxRootsPerNotebook) {
      clipped = true;
    }

    if (nb.truncated) {
      lines.push("    ...（已截断）");
    }
  }

  if (content.truncated || content.notebooks.length > maxNotebooks || clipped) {
    lines.push("  ...（知识库结构已截断）");
  }

  return lines.join("\n");
}

function appendKnowledgeMapNode(
  lines: string[],
  node: PlannerVisibleKnowledgeMapNode,
  options: {
    indentLevel: number;
    depth: number;
    maxDepth: number;
    maxTotalNodes: number;
    totalNodesRef: () => number;
    increment: () => void;
    markClipped: () => void;
  },
): void {
  if (options.totalNodesRef() >= options.maxTotalNodes) {
    options.markClipped();
    return;
  }
  const indent = "    ".repeat(options.indentLevel);
  const childIndicator = node.truncatedChildren ? "..." : "";
  const idPart = node.docId ? `（docId: ${node.docId}）` : "";
  lines.push(`${indent}- ${node.title}${idPart}（子文档 ${node.childCount} 篇）${childIndicator}`);
  options.increment();

  if (node.children && node.children.length > 0 && options.depth < options.maxDepth) {
    for (const child of node.children) {
      if (options.totalNodesRef() >= options.maxTotalNodes) {
        lines.push(`${"    ".repeat(options.indentLevel + 1)}...（已截断）`);
        options.markClipped();
        break;
      }
      appendKnowledgeMapNode(lines, child, {
        ...options,
        indentLevel: options.indentLevel + 1,
        depth: options.depth + 1,
      });
    }
  } else if (node.children && node.children.length > 0) {
    lines.push(`${"    ".repeat(options.indentLevel + 1)}...（已截断）`);
    options.markClipped();
  }
}

function formatSafety(tool: ToolManifest): string {
  const s = tool.safety;
  if (s.readOnly && !s.canWrite && !s.requiresConfirmation) return "只读";
  const tags: string[] = [];
  if (s.canWrite) tags.push("可写");
  if (s.requiresConfirmation) tags.push("需要确认");
  const scope = s.permissionScope ? `:${s.permissionScope}` : "";
  if (tags.length === 0) return `可变更${scope}`;
  return `${tags.join("+")}${scope}`;
}
