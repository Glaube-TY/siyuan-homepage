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

/** 来自 caller 的输入。Harness 在生成 prompt 时把已有事实填进来。 */
export interface PlannerContextInput {
  question: string;
  needsKnowledgeBase: boolean;
  /** 预算快照。 */
  budgets: {
    searchRemaining: number;
    readRemaining: number;
    blockRemaining: number;
  };
  /** 候选池 / 证据包的事实摘要（不暴露内容）。 */
  candidateSummary?: SkillRuntimeContext["candidateSummary"];
  evidenceSummary?: SkillRuntimeContext["evidenceSummary"];
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
  /** 原始问题 + needsKnowledgeBase（Planner 用来决定是否启用 KB Skill）。 */
  question: string;
  needsKnowledgeBase: boolean;
}

const GLOBAL_IDENTITY_BODY =
  "你是思源笔记 AI 知识库助手。" +
  "默认应基于知识库资料回答，但由你自行决定是否调用知识库 Skill 和哪些工具。" +
  "你可以阅读当前激活的 Skill 描述，自主决定使用哪些工具、何时回答。" +
  "你也可以不使用任何 Skill / 工具，直接基于你自己的理解回答。";

const GLOBAL_ROLE = "思源笔记 AI 知识库助手";
const DEFAULT_GOAL = "基于思源知识库资料回答用户问题";

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
    needsKnowledgeBase: input.needsKnowledgeBase,
    toolManifest,
    enabledSkillNames: options.skillRegistry
      .getEnabledSkills(makeSkillPrefsCtx(input, toolManifest, observations))
      .map((s) => s.name),
    observations,
    budgets: input.budgets,
    candidateSummary: input.candidateSummary,
    evidenceSummary: input.evidenceSummary,
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
    needsKnowledgeBase: input.needsKnowledgeBase,
  };
}

function toToolRuntimeContext(input: PlannerContextInput): ToolRuntimeContext {
  return {
    question: input.question,
    budgets: input.budgets,
    candidateSummary: input.candidateSummary,
    evidenceSummary: input.evidenceSummary,
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
    needsKnowledgeBase: input.needsKnowledgeBase,
    toolManifest,
    enabledSkillNames: input.userEnabledSkillNames,
    observations,
    budgets: input.budgets,
    candidateSummary: input.candidateSummary,
    evidenceSummary: input.evidenceSummary,
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
  blocks.push("# Global Identity");
  blocks.push(ctx.globalIdentity.body);
  blocks.push("");

  blocks.push("# Enabled Skills");
  if (ctx.skillSections.length === 0) {
    blocks.push("(no skill enabled)");
  } else {
    for (const section of ctx.skillSections) {
      blocks.push(`## ${section.title} (priority=${section.priority})`);
      blocks.push(section.body);
      blocks.push("");
    }
  }

  blocks.push("# Tool Manifest");
  if (ctx.toolManifest.length === 0) {
    blocks.push("(no tool available)");
  } else {
    for (const tool of ctx.toolManifest) {
      const availability = tool.availability.available
        ? "available"
        : `unavailable:${tool.availability.reasonCode ?? "unknown"}`;
      const safety = formatSafety(tool);
      blocks.push(
        `- ${tool.name} | capability=${tool.capability} | safety=${safety} | ${availability}`,
      );
      blocks.push(`    ${tool.description}`);
      blocks.push(`    boundary: ${tool.boundary}`);
    }
  }

  blocks.push("");
  blocks.push("# Observations (last 10)");
  const tail = ctx.observations.slice(-10);
  if (tail.length === 0) {
    blocks.push("(none)");
  } else {
    for (const o of tail) {
      const facts = o.facts
        ? Object.entries(o.facts)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${typeof v === "number" ? v : JSON.stringify(v)}`)
            .join(",")
        : "";
      const summaryPart = o.summary ? ` summary=${JSON.stringify(o.summary)}` : "";
      blocks.push(`- ${o.kind} tool=${o.toolName ?? "-"} ${facts} reason=${o.reasonCode ?? "-"}${summaryPart}`);
      if (o.content) {
        blocks.push(renderObservationContent(o.content));
      }
    }
  }

  blocks.push("");
  blocks.push("# Budgets");
  blocks.push(JSON.stringify(ctx.budgets));

  return blocks.join("\n");
}

function renderObservationContent(content: PlannerVisibleObservationContent): string {
  if (content.type === "knowledge_map") {
    return renderKnowledgeMapPreview(content);
  }
  if (content.type === "conversation_references") {
    return renderConversationReferencesPreview(content);
  }
  return "";
}

function renderConversationReferencesPreview(
  content: Extract<PlannerVisibleObservationContent, { type: "conversation_references" }>,
): string {
  const maxReferences = 20;
  const lines: string[] = [];
  lines.push("  Conversation References:");
  for (const ref of content.references.slice(0, maxReferences)) {
    const usedPart = ref.usedCount !== undefined ? ` used=${ref.usedCount}` : "";
    lines.push(`  - [${ref.handle}] ${ref.title}${usedPart}`);
  }
  if (content.truncated || content.references.length > maxReferences) {
    lines.push("  ... (references truncated)");
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
  lines.push("  Knowledge Map:");

  let totalNodes = 0;
  let clipped = false;
  const notebooks = content.notebooks.slice(0, maxNotebooks);

  for (const nb of notebooks) {
    if (totalNodes >= maxTotalNodes) break;
    lines.push(`  - [${nb.handle}] ${nb.title} (docs=${nb.docCount})`);

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
      lines.push("    ... (truncated)");
    }
  }

  if (content.truncated || content.notebooks.length > maxNotebooks || clipped) {
    lines.push("  ... (map truncated)");
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
  lines.push(`${indent}- [${node.handle}] ${node.title} (children=${node.childCount})${childIndicator}`);
  options.increment();

  if (node.children && node.children.length > 0 && options.depth < options.maxDepth) {
    for (const child of node.children) {
      if (options.totalNodesRef() >= options.maxTotalNodes) {
        lines.push(`${"    ".repeat(options.indentLevel + 1)}... (truncated)`);
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
    lines.push(`${"    ".repeat(options.indentLevel + 1)}... (truncated)`);
    options.markClipped();
  }
}

function formatSafety(tool: ToolManifest): string {
  const s = tool.safety;
  if (s.readOnly && !s.canWrite && !s.requiresConfirmation) return "readOnly";
  const tags: string[] = [];
  if (s.canWrite) tags.push("canWrite");
  if (s.requiresConfirmation) tags.push("confirmation");
  const scope = s.permissionScope ? `:${s.permissionScope}` : "";
  if (tags.length === 0) return `mutable${scope}`;
  return `${tags.join("+")}${scope}`;
}
