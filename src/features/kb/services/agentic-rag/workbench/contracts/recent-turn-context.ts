/**
 * RecentTurnContext
 *
 * 通用最近对话上下文（脱敏，不含 path/internalMapping）。
 *
 * 用途：
 * - 作为中性事实提供给 Planner，帮助理解"里面/上面/刚才/这些文档"等指代。
 * - 不触发任何工具选择，不自动 focus / 自动 read。
 * - 通用结构，未来可复用于网页、MCP、文件等来源。
 * - docId/blockId 只保留来自工具结果或 final_answer.references 中明确存在的资源 ID，
 *   不从自然语言回答里猜测。
 * - blockId 始终 optional：整篇文档引用只传 docId，具体片段引用才传 blockId。
 * - 最近一轮 assistant 的引用排在最前，更早历史引用带 turnAge 等来源信息。
 */

export interface RecentTurnContext {
  role: "user" | "assistant";
  textPreview: string;
  displayReferences?: Array<{
    docId?: string;
    /** 块 ID（具体片段引用时可选，须与 docId 同时出现） */
    blockId?: string;
    title: string;
    sourceType?: string;
    snippet?: string;
    /** 来源标记：final_answer_reference / tool_observation */
    source?: string;
    /** 距当前轮的间隔轮数（0=最近一轮 assistant，1=上一轮，以此类推） */
    turnAge?: number;
    /** 来源轮次 ID（如 assistantMessageId） */
    sourceTurnId?: string;
  }>;
  visibleArtifacts?: Array<{
    type: string;
    title?: string;
    count?: number;
    summary?: string;
  }>;
  createdAt?: number;
  /** 该轮在上下文中的序号（0=最近一轮） */
  turnIndex?: number;
}
