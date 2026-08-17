/**
 * 主页组件子工具路由的唯一目录。
 * 运行时 binding、Agent capability、聚合 metadata、设置页标签和禁用白名单都从这里派生。
 */

export type HomepageComponentRouteKind = "business" | "reused" | "instance";
export type HomepageComponentAccessKey =
  | "quickNote"
  | "focus"
  | "accounting"
  | "fixedAssets"
  | "anniversary"
  | "favorites"
  | "review"
  | "music";

export interface HomepageComponentRouteDefinition {
  type: string;
  prefix: string;
  label: string;
  kind: HomepageComponentRouteKind;
  businessTool: string | null;
  operations: readonly string[];
  sourceActions?: readonly string[];
  accessKey?: HomepageComponentAccessKey;
  reason?: string;
}

export const HOMEPAGE_COMPONENT_INSTANCE_ACTIONS = ["get", "add", "update", "update_style", "move", "remove"] as const;

function instanceOperations(prefix: string): string[] {
  return HOMEPAGE_COMPONENT_INSTANCE_ACTIONS.map((action) => `${prefix}.instance.${action}`);
}

function instanceRoute(type: string, prefix: string, label: string): HomepageComponentRouteDefinition {
  return {
    type,
    prefix,
    label,
    kind: "instance",
    businessTool: null,
    operations: instanceOperations(prefix),
    reason: "instance_route",
  };
}

function businessRoute(
  type: string,
  prefix: string,
  label: string,
  businessTool: string,
  actions: readonly string[],
  accessKey: HomepageComponentAccessKey,
): HomepageComponentRouteDefinition {
  return {
    type,
    prefix,
    label,
    kind: "business",
    businessTool,
    operations: [...instanceOperations(prefix), ...actions.map((action) => `${prefix}.${action}`)],
    accessKey,
  };
}

function reusedRoute(
  type: string,
  prefix: string,
  label: string,
  sourceTool: string,
  actions: readonly string[],
): HomepageComponentRouteDefinition {
  return {
    type,
    prefix,
    label,
    kind: "reused",
    businessTool: sourceTool,
    operations: [...instanceOperations(prefix), ...actions.map((action) => `${prefix}.${action}`)],
    sourceActions: actions,
    reason: "reused_existing_tool",
  };
}

export const HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS: readonly HomepageComponentRouteDefinition[] = [
  instanceRoute("globalCalendar", "global_calendar", "全局日历"),
  instanceRoute("statisticalCard", "statistical_card", "统计卡片"),
  instanceRoute("TaskMan", "task_man", "任务管理"),
  reusedRoute("latest-docs", "latest_docs", "最近文档", "siyuan_kb", ["list_by_time", "get_doc_info", "read_docs"]),
  businessRoute("favorites", "favorites", "收藏文档", "homepage_favorites", ["list", "add", "remove", "move_to_group", "list_groups", "create_group", "rename_group", "delete_group", "reorder"], "favorites"),
  businessRoute("quick-notes", "quick_note", "快速笔记", "homepage_quick_note", ["status", "write"], "quickNote"),
  businessRoute("countdown", "anniversary", "纪念日", "homepage_anniversary", ["list", "get", "add", "update", "archive", "restore", "delete_permanently", "list_categories", "create_category", "update_category", "archive_category", "delete_category"], "anniversary"),
  instanceRoute("timedate", "timedate", "时间日期"),
  instanceRoute("dailyQuote", "daily_quote", "每日一句"),
  instanceRoute("TaskManPlus", "task_man_plus", "任务管理 Plus"),
  reusedRoute("recent-journals", "recent_journals", "最近日记", "siyuan_kb", ["list_by_time", "get_doc_info", "read_docs"]),
  reusedRoute("childDocs", "child_docs", "子文档", "siyuan_kb", ["search", "get_doc_info", "read_docs", "outline"]),
  reusedRoute("conditionDocs", "condition_docs", "条件文档", "siyuan_kb", ["search", "get_doc_info", "read_docs"]),
  instanceRoute("heatmap", "heatmap", "热力图"),
  reusedRoute("visualChart", "visual_chart", "可视化图表", "siyuan_database", ["list", "read", "find_rows", "extra_read"]),
  reusedRoute("sql", "sql", "SQL 查询", "siyuan_database", ["list", "read", "find_rows", "extra_read"]),
  instanceRoute("weather", "weather", "今日天气"),
  instanceRoute("HOT", "hot", "热搜"),
  instanceRoute("News", "news", "新闻资讯"),
  businessRoute("reviewDocs", "review", "复习文档", "homepage_review", ["list", "summary", "schedule", "update_plan", "complete", "postpone", "finish", "remove"], "review"),
  reusedRoute("enhancedDiary", "enhanced_diary", "增强日记", "diary_task", ["overview", "query_tasks", "query_records", "find_docs"]),
  businessRoute("focus", "focus", "高级番茄钟", "homepage_focus", ["stats", "record_session"], "focus"),
  instanceRoute("habitTracker", "habit_tracker", "习惯打卡"),
  businessRoute("musicPlayer", "music", "音乐播放器", "homepage_music", ["status", "search", "list_playlists", "create_playlist", "rename_playlist", "delete_playlist", "add_to_playlist", "remove_from_playlist", "favorite", "unfavorite", "play", "pause", "resume", "next", "previous", "seek", "set_volume"], "music"),
  instanceRoute("almanac", "almanac", "黄历"),
  instanceRoute("PicCaro", "pic_caro", "图片轮播"),
  instanceRoute("CYBMOK", "cybmok", "赛博木鱼"),
  businessRoute("fixedAssets", "fixed_assets", "固定资产", "homepage_fixed_assets", ["list", "get", "add", "update", "archive", "cost_summary"], "fixedAssets"),
  businessRoute("accounting", "accounting", "记账", "homepage_accounting", ["overview", "query_records", "summary", "add_record", "update_record", "archive_record", "list_accounts", "add_account", "update_account", "archive_account", "category_report"], "accounting"),
  instanceRoute("constellation", "constellation", "星座运势"),
  instanceRoute("historyDays", "history_days", "历史上的今天"),
  instanceRoute("custom-text", "custom_text", "文字内容"),
  instanceRoute("custom-web", "custom_web", "网页浏览器"),
  instanceRoute("custom-protyle", "custom_protyle", "文档编辑器"),
  instanceRoute("countdownTimer", "countdown_timer", "倒计时"),
  instanceRoute("notebrain", "notebrain", "AI 知识库"),
];

const ROUTE_BY_TYPE = new Map(HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.map((route) => [route.type, route]));
const ROUTE_BY_PREFIX = new Map(HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.map((route) => [route.prefix, route]));

export const HOMEPAGE_COMPONENT_SUBTOOL_LABELS: Readonly<Record<string, string>> = Object.fromEntries([
  ["catalog", "组件目录"],
  ["instance", "组件索引"],
  ...HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.map((route) => [route.prefix, route.label]),
]);

export const HOMEPAGE_COMPONENT_SUBTOOL_PREFIXES: readonly string[] = [
  "catalog",
  "instance",
  ...HOMEPAGE_COMPONENT_ROUTE_DEFINITIONS.map((route) => route.prefix),
];

export function getHomepageComponentRoute(type: string): HomepageComponentRouteDefinition | undefined {
  return ROUTE_BY_TYPE.get(type);
}

export function getHomepageComponentRouteByPrefix(prefix: string): HomepageComponentRouteDefinition | undefined {
  return ROUTE_BY_PREFIX.get(prefix);
}

export function isHomepageComponentSubtoolPrefix(prefix: string): boolean {
  return HOMEPAGE_COMPONENT_SUBTOOL_PREFIXES.includes(prefix);
}

/** Agent 可见的组件能力；display-only 仍然拥有组件实例子工具。 */
export interface HomepageBusinessCapability {
  businessTool: string | null;
  toolName?: string;
  subtool?: string;
  operations?: readonly string[];
  allowedActions?: readonly string[];
  supported?: boolean;
  reusedExistingTool?: boolean;
  reason?: string;
}

export function getHomepageBusinessCapability(type: string): HomepageBusinessCapability | undefined {
  const route = getHomepageComponentRoute(type);
  if (!route) return undefined;
  return {
    businessTool: route.businessTool,
    toolName: "homepage_components",
    subtool: route.prefix,
    operations: [...route.operations],
    ...(route.sourceActions ? { allowedActions: [...route.sourceActions] } : {}),
    supported: true,
    ...(route.kind === "reused" ? { reusedExistingTool: true } : {}),
    ...(route.reason ? { reason: route.reason } : {}),
  };
}
