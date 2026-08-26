export type AiKnowledgeBaseSubTab = "models" | "entries" | "status" | "selection" | "webSearch" | "workbenches" | "memory" | "automation";

export const AI_KNOWLEDGE_BASE_SUB_TABS: ReadonlyArray<{
    id: AiKnowledgeBaseSubTab;
    label: string;
    requiresAdvanced?: boolean;
}> = [
    { id: "models", label: "模型与服务", requiresAdvanced: true },
    { id: "entries", label: "知识库入口", requiresAdvanced: true },
    { id: "status", label: "状态语 AI", requiresAdvanced: true },
    { id: "selection", label: "选区工具栏", requiresAdvanced: true },
    { id: "webSearch", label: "联网搜索", requiresAdvanced: true },
    { id: "workbenches", label: "临时工作台", requiresAdvanced: true },
    { id: "memory", label: "记忆中枢", requiresAdvanced: true },
    { id: "automation", label: "自动化中心", requiresAdvanced: true },
];
