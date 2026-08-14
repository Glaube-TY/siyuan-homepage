export interface HomepageBusinessCapability {
  businessTool: string | null;
  allowedActions?: readonly string[];
  supported?: boolean;
  reusedExistingTool?: boolean;
  reason?: string;
}

const BUSINESS_TOOL_BY_TYPE: Readonly<Record<string, HomepageBusinessCapability>> = {
  "quick-notes": { businessTool: "homepage_quick_note", supported: true },
  TaskMan: { businessTool: null, supported: false, reason: "document_backed_no_dedicated_agent_tool" },
  TaskManPlus: { businessTool: null, supported: false, reason: "document_backed_no_dedicated_agent_tool" },
  accounting: { businessTool: "homepage_accounting", supported: true },
  countdown: { businessTool: "homepage_anniversary", supported: true },
  fixedAssets: { businessTool: "homepage_fixed_assets", supported: true },
  favorites: { businessTool: "homepage_favorites", supported: true },
  reviewDocs: { businessTool: "homepage_review", supported: true },
  focus: { businessTool: "homepage_focus", supported: true },
  CYBMOK: { businessTool: null, supported: false, reason: "no_dedicated_business_tool" },
  musicPlayer: { businessTool: "homepage_music", supported: true },
  enhancedDiary: { businessTool: "diary_task", allowedActions: ["overview", "query_tasks", "query_records", "find_docs"], supported: true, reusedExistingTool: true },
  "latest-docs": { businessTool: "siyuan_kb", allowedActions: ["list_by_time", "get_doc_info", "read_docs"], supported: true, reusedExistingTool: true },
  "recent-journals": { businessTool: "siyuan_kb", allowedActions: ["list_by_time", "get_doc_info", "read_docs"], supported: true, reusedExistingTool: true },
  childDocs: { businessTool: "siyuan_kb", allowedActions: ["search", "get_doc_info", "read_docs", "outline"], supported: true, reusedExistingTool: true },
  conditionDocs: { businessTool: "siyuan_kb", allowedActions: ["search", "get_doc_info", "read_docs"], supported: true, reusedExistingTool: true },
  visualChart: { businessTool: "siyuan_database", allowedActions: ["list", "read", "find_rows", "extra_read"], supported: true, reusedExistingTool: true },
  sql: { businessTool: "siyuan_database", allowedActions: ["list", "read", "find_rows", "extra_read"], supported: true, reusedExistingTool: true },
};

export function getHomepageBusinessCapability(type: string): HomepageBusinessCapability | undefined {
  const capability = BUSINESS_TOOL_BY_TYPE[type];
  return capability ? { ...capability } : undefined;
}
