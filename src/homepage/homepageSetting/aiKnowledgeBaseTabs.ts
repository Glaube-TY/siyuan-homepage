export type AiKnowledgeBaseSubTab = "entries" | "status" | "selection" | "workbenches";

export const AI_KNOWLEDGE_BASE_SUB_TABS: ReadonlyArray<{
    id: AiKnowledgeBaseSubTab;
    label: string;
}> = [
    { id: "entries", label: "知识库入口" },
    { id: "status", label: "状态语 AI" },
    { id: "selection", label: "选区工具栏" },
    { id: "workbenches", label: "临时工作台" },
];
