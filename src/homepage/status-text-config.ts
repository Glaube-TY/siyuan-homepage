export type HomepageStatusTextMode = "custom" | "ai";
export type HomepageStatusStatGroup = "time_notes" | "structure" | "tasks";
export type HomepageStatusStatSource = "local" | "start_cache" | "official_api" | "stat_index" | "task_index";
export type HomepageStatusStatKey =
    | "nowDate" | "startDate" | "notebooksCount" | "docsCount" | "blocksCount"
    | "wordsCount" | "dailynotesCount" | "tagsCount" | "citationCount"
    | "codeBlocksCount" | "mathBlocksCount" | "headingBlocksCount" | "paragraphBlocksCount"
    | "tasksCount" | "doneTasksCount" | "undoneTasksCount" | "dueTodayTasksCount"
    | "overdueTasksCount" | "highPriorityTasksCount" | "unscheduledTasksCount";

export interface HomepageStatusStatDefinition {
    key: HomepageStatusStatKey;
    label: string;
    promptName: string;
    group: HomepageStatusStatGroup;
    legacyAiDefault: boolean;
    description: string;
    example: string;
    source: HomepageStatusStatSource;
}

export const HOMEPAGE_STATUS_STAT_DEFINITIONS: HomepageStatusStatDefinition[] = [
    { key: "nowDate", label: "当前日期时间", promptName: "今天是", group: "time_notes", legacyAiDefault: true, description: "当前设备的本地日期和时间。", example: "2026年07月14日 14:30:25", source: "local" },
    { key: "startDate", label: "笔记空间开始时间", promptName: "第一条笔记日期", group: "time_notes", legacyAiDefault: true, description: "首次检测到的最早块创建日期，检测后保存在本地统计索引。", example: "2024年01月01日", source: "start_cache" },
    { key: "notebooksCount", label: "笔记本数量", promptName: "当前笔记本数量", group: "time_notes", legacyAiDefault: true, description: "当前可用笔记本的数量。", example: "5", source: "official_api" },
    { key: "docsCount", label: "文档数量", promptName: "当前文档数量", group: "time_notes", legacyAiDefault: true, description: "统计索引记录的文档总数。", example: "328", source: "stat_index" },
    { key: "blocksCount", label: "内容块总数量", promptName: "当前内容块数量", group: "time_notes", legacyAiDefault: true, description: "统计索引聚合的内容块总数量。", example: "6520", source: "stat_index" },
    { key: "wordsCount", label: "内容字数", promptName: "字数", group: "time_notes", legacyAiDefault: false, description: "按照统计索引中的内容字符聚合，并非精确中文分词字数。", example: "128640", source: "stat_index" },
    { key: "dailynotesCount", label: "日记数量", promptName: "日记数量", group: "time_notes", legacyAiDefault: true, description: "统计索引识别到的日记文档数量。", example: "180", source: "stat_index" },
    { key: "tagsCount", label: "标签数量", promptName: "标签数量", group: "time_notes", legacyAiDefault: true, description: "当前工作空间的标签数量。", example: "42", source: "official_api" },
    { key: "citationCount", label: "引用块数量", promptName: "引用块数量", group: "structure", legacyAiDefault: false, description: "包含块引用的内容块数量，不是引用出现总次数。", example: "96", source: "stat_index" },
    { key: "codeBlocksCount", label: "代码块数量", promptName: "代码块数量", group: "structure", legacyAiDefault: false, description: "统计索引中的代码块数量。", example: "64", source: "stat_index" },
    { key: "mathBlocksCount", label: "数学公式块数量", promptName: "数学公式数量", group: "structure", legacyAiDefault: false, description: "统计索引中的数学公式块数量。", example: "21", source: "stat_index" },
    { key: "headingBlocksCount", label: "标题块数量", promptName: "标题块数量", group: "structure", legacyAiDefault: false, description: "统计索引中的标题块数量。", example: "410", source: "stat_index" },
    { key: "paragraphBlocksCount", label: "段落块数量", promptName: "段落块数量", group: "structure", legacyAiDefault: false, description: "统计索引中的段落块数量。", example: "3890", source: "stat_index" },
    { key: "tasksCount", label: "任务总数", promptName: "当前任务数量", group: "tasks", legacyAiDefault: true, description: "任务索引中的全部任务数量。", example: "56", source: "task_index" },
    { key: "doneTasksCount", label: "已完成任务数量", promptName: "已完成任务数量", group: "tasks", legacyAiDefault: true, description: "任务索引中已完成的任务数量。", example: "38", source: "task_index" },
    { key: "undoneTasksCount", label: "未完成任务数量", promptName: "未完成任务数量", group: "tasks", legacyAiDefault: true, description: "任务索引中未完成的任务数量。", example: "18", source: "task_index" },
    { key: "dueTodayTasksCount", label: "今日截止任务数量", promptName: "今日截止任务数量", group: "tasks", legacyAiDefault: false, description: "未完成，并且有效截止日期等于今天。", example: "3", source: "task_index" },
    { key: "overdueTasksCount", label: "已逾期任务数量", promptName: "已逾期任务数量", group: "tasks", legacyAiDefault: false, description: "未完成，并且有效截止日期早于今天。", example: "2", source: "task_index" },
    { key: "highPriorityTasksCount", label: "高优先级任务数量", promptName: "高优先级任务数量", group: "tasks", legacyAiDefault: false, description: "未完成，并且优先级为高或紧急。", example: "4", source: "task_index" },
    { key: "unscheduledTasksCount", label: "未排期任务数量", promptName: "未排期任务数量", group: "tasks", legacyAiDefault: false, description: "未完成，并且没有开始日期和截止日期。", example: "7", source: "task_index" },
];

export const DEFAULT_STATUS_AI_STAT_KEYS: HomepageStatusStatKey[] = HOMEPAGE_STATUS_STAT_DEFINITIONS
    .filter((item) => item.legacyAiDefault)
    .map((item) => item.key);

export function normalizeStatusAiStatKeys(value: unknown): HomepageStatusStatKey[] {
    if (!Array.isArray(value)) return [...DEFAULT_STATUS_AI_STAT_KEYS];
    const selected = new Set(value.filter((key): key is HomepageStatusStatKey => typeof key === "string"));
    return HOMEPAGE_STATUS_STAT_DEFINITIONS.map((item) => item.key).filter((key) => selected.has(key));
}

export const DEFAULT_STATS_INFO_TEXT =
    "从 {{startDate}} 开始，你已积累 {{docsCount}} 篇文档、{{blocksCount}} 个内容块。\n这些内容分布在 {{notebooksCount}} 个笔记本中，感谢自己的坚持。❤";

export const LEGACY_DEFAULT_STATS_INFO_TEXTS = [
    "自{{startDate}} 写下第一条笔记以来，你已累计记录笔记 {{blocksCount}} 条。\n当前共有 {{notebooksCount}} 个笔记本和 {{docsCount}} 篇笔记。\n感谢自己的坚持！❤",
];

export function normalizeStatsInfoText(value: unknown): string {
    if (typeof value !== "string" || value.length === 0) return DEFAULT_STATS_INFO_TEXT;
    return LEGACY_DEFAULT_STATS_INFO_TEXTS.includes(value) ? DEFAULT_STATS_INFO_TEXT : value;
}

export const DEFAULT_STATUS_AI_PROMPT =
    "请生成一句简短、自然、有鼓励感的主页状态语。语气风趣幽默，尽量包含所有已知数据。使用表情符号增加趣味性。";

export const DEFAULT_STATUS_AI_MAX_CHARS = 200;
export const MIN_STATUS_AI_MAX_CHARS = 20;
export const MAX_STATUS_AI_MAX_CHARS = 500;

export function normalizeHomepageStatusTextMode(value: unknown): HomepageStatusTextMode {
    return value === "ai" ? "ai" : "custom";
}

export function normalizeStatusAiPrompt(value: unknown): string {
    if (typeof value !== "string") return DEFAULT_STATUS_AI_PROMPT;
    const trimmed = value.trim();
    return trimmed || DEFAULT_STATUS_AI_PROMPT;
}

export function normalizeStatusAiMaxChars(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_STATUS_AI_MAX_CHARS;
    return Math.min(
        Math.max(Math.round(num), MIN_STATUS_AI_MAX_CHARS),
        MAX_STATUS_AI_MAX_CHARS,
    );
}

export function normalizeStatusAiModelId(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export function normalizeStatusAiThinkingEnabled(value: unknown): boolean {
    return typeof value === "boolean" ? value : false;
}
