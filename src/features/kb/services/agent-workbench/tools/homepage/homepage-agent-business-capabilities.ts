export interface HomepageBusinessCapability {
  businessTool: string | null;
  supported?: boolean;
  reusedExistingTool?: boolean;
  reason?: string;
}

const BUSINESS_TOOL_BY_TYPE: Readonly<Record<string, HomepageBusinessCapability>> = {
  "quick-notes": { businessTool: "homepage_quick_note", supported: true },
  TaskMan: { businessTool: "diary_task", supported: true, reusedExistingTool: true },
  TaskManPlus: { businessTool: "diary_task", supported: true, reusedExistingTool: true },
  accounting: { businessTool: "homepage_accounting", supported: true },
  countdown: { businessTool: "homepage_countdown", supported: true },
  fixedAssets: { businessTool: "homepage_fixed_assets", supported: true },
  favorites: { businessTool: "homepage_favorites", supported: true },
  reviewDocs: { businessTool: "homepage_review", supported: true },
  focus: { businessTool: "homepage_focus", supported: true },
  CYBMOK: { businessTool: null, supported: false, reason: "no_dedicated_business_tool" },
  musicPlayer: { businessTool: "homepage_music", supported: true },
  enhancedDiary: { businessTool: "diary_task", supported: true, reusedExistingTool: true },
  "latest-docs": { businessTool: "siyuan_kb", supported: true, reusedExistingTool: true },
  "recent-journals": { businessTool: "siyuan_kb", supported: true, reusedExistingTool: true },
  childDocs: { businessTool: "siyuan_kb", supported: true, reusedExistingTool: true },
  conditionDocs: { businessTool: "siyuan_kb", supported: true, reusedExistingTool: true },
  databaseChart: { businessTool: "siyuan_database", supported: true, reusedExistingTool: true },
  visualChart: { businessTool: "siyuan_database", supported: true, reusedExistingTool: true },
  sql: { businessTool: "siyuan_database", supported: true, reusedExistingTool: true },
};

export function getHomepageBusinessCapability(type: string): HomepageBusinessCapability | undefined {
  const capability = BUSINESS_TOOL_BY_TYPE[type];
  return capability ? { ...capability } : undefined;
}
