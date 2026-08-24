export type AiKnowledgeBaseSubTab = "models" | "entries" | "status" | "selection" | "webSearch" | "workbenches" | "memory" | "automation";

export const AI_KNOWLEDGE_BASE_SUB_TABS: ReadonlyArray<{
    id: AiKnowledgeBaseSubTab;
    label: string;
}> = [
    { id: "models", label: "模型与服务" },
    { id: "entries", label: "知识库入口" },
    { id: "status", label: "状态语 AI" },
    { id: "selection", label: "选区工具栏" },
    { id: "webSearch", label: "联网搜索" },
    { id: "workbenches", label: "临时工作台" },
    { id: "memory", label: "记忆中枢" },
    { id: "automation", label: "自动化中心" },
];
