/**
 * SkillContract
 *
 * Skill 是给 AI Planner �?能力手册"：只产出 prompt 段落与能力说明�? * 不替 Planner �?/ 调工具，不返回流程建议字段�?
 */

import type { ToolManifest, PlannerVisibleObservationContent } from "./tool-contract";

/**
 * Planner 调用 Skill 时可见的运行时上下文�?
 * Skill 只能读取这里列出的事实数据，**不得** �?/ 改业务状态机�?
 */
export interface SkillRuntimeContext {
  /** 当前 turn 的原始用户问题�?*/
  question: string;
  /**
   * 用户�?UI 上选择�?scopeMode（中性的事实字段�?*�?*含任何工具选择建议语义）�?
   * - Planner 可看到此事实，但**�?*据此自动选择工具 / answer�?
   * - 任何"是否需要知识库" / "需要调用什么工�? / "是否必须 KB" 的判�?
   *   �?*必须**�?Planner 自主做出；代码不得替 Planner 推断�?
   */
  activeScopeMode: import("../../scope/types").AgentScopeMode;
  /** 当前 Workbench 提供的工具清单（只读 manifest，不�?execute）�?*/
  toolManifest: readonly ToolManifest[];
  /** 当前用户偏好激活的 Skill name 集合（包含默认与用户显式开启）�?*/
  enabledSkillNames: readonly string[];
  /** 当前 turn 累计 observation（仅事实数据，零命中 / 候�?/ 证据 / 错误�?/ 预算耗尽）�?*/
  observations: SkillObservation[];
  /** 预算快照：search / read 剩余量�?*/
  budgets: {
    searchRemaining: number;
    readRemaining: number;
  };
  /** 候选池 / 证据包的轻量计数（不暴露内容）�?*/
  candidateSummary?: {
    candidateDocCount: number;
    strongCandidateDocCount: number;
    unreadReadableCandidateCount: number;
  };
  contentSummary?: {
    readDocCount: number;
    contentItemCount: number;
    hasReadContent: boolean;
  };
  /**
   * 用户在本次会话显式开启的 Skill name 集合�?
   * SkillRegistry 在判�?enabled 时读取这里，**�?*通过全局单例 setUserEnabled 改写�?
   * 不传 = 视为未显式开启（只尊�?enabledByDefault）�?
   */
  userEnabledSkillNames?: readonly string[];
  /**
   * 用户在本次会话显式关闭的 Skill name 集合�?
   * 优先级最高：只要在这里出现的 Skill，无�?enabledByDefault / userEnabled 如何都不启用�?
   */
  userDisabledSkillNames?: readonly string[];
}

/**
 * Skill 使用的轻�?observation 描述。Skill 只能看到这些**事实**�?
 * 不得看到 "建议下一�?/ 建议工具 / 强制下一动作"�?
 */
export interface SkillObservation {
  kind:
    | "tool_executed"
    | "tool_failed"
    | "tool_zero_hits"
    | "tool_observation"
    | "turn_started"
    | "turn_finished"
    | "skill_observation"
    | "budget_exhausted"
    | "planner_returned_no_action";
  toolName?: string;
  /** 仅事实数据：候选数 / 证据�?/ 错误�?/ 0 命中 / 预算快照 / Planner 循环 stepIndex�?
   *  - **�?*�?docId / blockId / path / realPath / notebookId 等内部标识�?
   *  - **�?*�?业务类别字段"（如"书籍"等具体问题类别）�?
   *  - **�?*含流程建议字段�?*/
  facts?: {
    candidateDocCount?: number;
    returnedCandidateCount?: number;
    focusedDocCount?: number;
    strongCandidateDocCount?: number;
    unreadReadableCandidateCount?: number;
    contentItemCount?: number;
    /** 工具命中数；�?ToolObservation.facts.hits 对齐�?*/
    hits?: number;
    /** read_candidate_docs 累计读取�?doc 计数�?*/
    readDocCount?: number;
    totalNodeCount?: number;
    returnedNodeCount?: number;
    notebookCount?: number;
    notebookApiLoaded?: boolean;
    sourceNotebookCount?: number;
    missingNotebookNameCount?: number;
    hasMore?: boolean;
    linkedDocsErrorCount?: number;
    linkedDocsRequested?: boolean;
    matchedNodeCount?: number;
    referenceCount?: number;
    errorCode?: string;
    isZeroHits?: boolean;
    searchRemaining?: number;
    readRemaining?: number;
    /** Planner loop �?stepIndex；仅在循环级 observation 出现�?*/
    stepIndex?: number;
  };
  /** 0 命中 / 失败 / 错误时附带的 reasonCode（事实，不含建议）�?*/
  reasonCode?: string;
  /** 事实摘要，仅描述发生了什么。不得含流程控制含义�?*/
  summary?: string;
  /** Planner 可见安全内容（如知识图谱树）�?*/
  content?: PlannerVisibleObservationContent;
}

/**
 * Skill 渲染出的 prompt 段落。最终拼装到 Planner �?system prompt 中�?
 * 只描�?能力 / 边界 / 工具说明"，不含流程规训�?
 */
export interface SkillPromptSection {
  /** 段落标题，写�?Planner prompt 时的 heading�?*/
  title: string;
  /** 段落正文，多行字符串�?*/
  body: string;
  /** 该段落对 Planner 的优先级，priority 越高展示越靠前�?*/
  priority: number;
  /** 仅供 debug / 渲染统计使用�?*/
  meta?: {
    skillName: string;
    bytesEstimate: number;
  };
}

/**
 * Skill 契约。Skill 只产�?prompt 段落与能力说明，详见 flow-control-guard 的禁止字段清单�? */
export interface SkillContract {
  /** 唯一名；例如 builtin_knowledge_base_qa�?*/
  name: string;
  /** �?UI 展示用的标题�?*/
  title: string;
  /** 一句话简介，写入 Planner prompt�?*/
  description: string;
  /**
   * 角色指令：明�?AI 在启用本 Skill 后的身份与默认目标�?   * 例如 "可使用相关资料辅助回�?�?   */
  roleInstruction: string;
  /**
   * 适合场景：仅作为 prompt 说明出现�?*不得**被代码用来自动启�?/ 自动路由�?
   */
  whenUseful: string;
  /**
   * 边界 / 禁止事项，例�?只读知识库，不写入、不删除、不修改"�?
   */
  boundary: string;
  /**
   * �?Skill 说明中提到的全局工具名；不代表绑定、拥有、自动调用或优先顺序�?   */
  toolNames: readonly string[];
  /**
   * 能力说明：写�?prompt�?*不得**�?"必须�?/ 必须�?/ 证据够必须答"�?   */
  guidance: string;
  /**
   * 展示优先级。只影响 prompt 展示顺序�?*不允�?*触发自动执行�?
   */
  priority: number;
  /**
   * 是否默认启用�?*�?*决定默认是否进入 enabledSkillNames 列表�?
   */
  enabledByDefault: boolean;

  /**
   * 渲染 Skill �?prompt 段落�?
   * Skill 只能读取 ctx 中的事实�?*不得**修改 ctx 或触发工具执行�?
   * 只输�?title/description/roleInstruction/whenUseful/boundary/guidance/toolNames 文本�?
   */
  buildPromptSection(ctx: SkillRuntimeContext): SkillPromptSection;
}

/**
 * 类型守护：仅检�?*存在�?*，不验证字段语义。禁止字段清单见 flow-control-guard�?
 */
export function isSkillContractLike(value: unknown): value is SkillContract {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.title === "string" &&
    typeof v.description === "string" &&
    typeof v.roleInstruction === "string" &&
    typeof v.whenUseful === "string" &&
    typeof v.boundary === "string" &&
    Array.isArray(v.toolNames) &&
    typeof v.guidance === "string" &&
    typeof v.priority === "number" &&
    typeof v.enabledByDefault === "boolean" &&
    typeof v.buildPromptSection === "function"
  );
}
