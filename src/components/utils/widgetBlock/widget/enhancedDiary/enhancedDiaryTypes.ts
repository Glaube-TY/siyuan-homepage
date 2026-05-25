export type EnhancedDiaryPeriod = "day" | "week" | "month" | "year";

export type EnhancedDiaryStatus =
    | "not_due"
    | "not_created"
    | "missing_template"
    | "pending"
    | "completed"
    | "overdue"
    | "skipped";

export type EnhancedDiaryWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type EnhancedDiaryMonthRule = "monthEnd" | "nextMonthFirst";

export type EnhancedDiaryYearRule = "dec31" | "nextJan1";

export type EnhancedDiaryTemplateMap = Record<EnhancedDiaryPeriod, string>;

export interface EnhancedDiaryWorkspaceCalendarSettings {
    showLunar: boolean;
    showSolarTerm: boolean;
    showFestival: boolean;
    showLegalHoliday: boolean;
    showBriefCounts: boolean;
}

export interface EnhancedDiaryWorkspaceSettings {
    calendar: EnhancedDiaryWorkspaceCalendarSettings;
}

export interface EnhancedDiaryReviewReminderWindow {
    beforeDays: number;
    afterDays: number;
}

export interface EnhancedDiaryReviewReminderWindows {
    week: EnhancedDiaryReviewReminderWindow;
    month: EnhancedDiaryReviewReminderWindow;
    year: EnhancedDiaryReviewReminderWindow;
}

export interface EnhancedDiaryConfig {
    weekReviewDay: EnhancedDiaryWeekday;
    monthReviewRule: EnhancedDiaryMonthRule;
    yearReviewRule: EnhancedDiaryYearRule;
    templates: EnhancedDiaryTemplateMap;
    dailyNotebookId?: string;
    taskMigrationReminderDays: number;
    workspaceSettings: EnhancedDiaryWorkspaceSettings;
    recordCategorySuggestions: string[];
    reviewReminderWindows: EnhancedDiaryReviewReminderWindows;
}

export interface EnhancedDiaryTemplateContext {
    period: EnhancedDiaryPeriod;
    date: string;
    week?: string;
    month?: string;
    year?: string;
    周期范围?: string;
    完成标记?: string;
    开始日期?: string;
    结束日期?: string;
}

export interface EnhancedDiaryPeriodRange {
    start: string;
    end: string;
}

export interface EnhancedDiaryPeriodContext {
    period: EnhancedDiaryPeriod;
    range: EnhancedDiaryPeriodRange;
    targetDate: Date;
    templateContext?: EnhancedDiaryTemplateContext;
}

export interface EnhancedDiaryScanResult {
    hasCompletionMarker: boolean;
    completed: boolean;
    skipped: boolean;
    hasSkipMarker: boolean;
    markerText?: string;
}

export const ENHANCED_DIARY_CONFIG_FILE = "enhancedDiaryConfig.json";

export const ENHANCED_DIARY_PERIODS: readonly EnhancedDiaryPeriod[] = ["day", "week", "month", "year"];

export const ENHANCED_DIARY_COMPLETION_MARKERS: Record<EnhancedDiaryPeriod, string> = {
    day: "- [ ] 已完成今日记录🌞",
    week: "- [ ] 已完成本周复盘📅",
    month: "- [ ] 已完成本月总结🌙",
    year: "- [ ] 已完成年度总结🎇",
};

export const ENHANCED_DIARY_SKIP_MARKERS: Record<EnhancedDiaryPeriod, string> = {
    day: "- [x] 已跳过今日记录⏭️",
    week: "- [x] 已跳过本周复盘⏭️",
    month: "- [x] 已跳过本月总结⏭️",
    year: "- [x] 已跳过年度总结⏭️",
};

const DEFAULT_DAY_TEMPLATE = `# 今日日记 {{date}}

{{完成标记}}

## 任务管理

### 新建任务

### 迁移任务

### 任务动态

## 快速记录

## 今日复盘

### 今日总结

### 情绪状态

### 收获与问题

### 明日关注`;

const DEFAULT_WEEK_TEMPLATE = `# 本周复盘 {{week}}

周期：{{周期范围}}

{{完成标记}}

## 周复盘

### 本周总结

### 任务回顾

### 记录沉淀

### 问题与风险

### 下周计划`;

const DEFAULT_MONTH_TEMPLATE = `# 本月总结 {{month}}

周期：{{周期范围}}

{{完成标记}}

## 月度复盘

### 本月总结

### 关键进展

### 任务回顾

### 问题与风险

### 下月计划`;

const DEFAULT_YEAR_TEMPLATE = `# 年度总结 {{year}}

周期：{{周期范围}}

{{完成标记}}

## 年度复盘

### 年度总结

### 关键成果

### 重要变化

### 经验教训

### 明年方向`;

export const DEFAULT_ENHANCED_DIARY_TEMPLATES: EnhancedDiaryTemplateMap = {
    day: DEFAULT_DAY_TEMPLATE,
    week: DEFAULT_WEEK_TEMPLATE,
    month: DEFAULT_MONTH_TEMPLATE,
    year: DEFAULT_YEAR_TEMPLATE,
};

export const DEFAULT_ENHANCED_DIARY_CONFIG: EnhancedDiaryConfig = {
    weekReviewDay: 0,
    monthReviewRule: "monthEnd",
    yearReviewRule: "dec31",
    templates: { ...DEFAULT_ENHANCED_DIARY_TEMPLATES },
    dailyNotebookId: "",
    taskMigrationReminderDays: 30,
    workspaceSettings: {
        calendar: {
            showLunar: true,
            showSolarTerm: true,
            showFestival: true,
            showLegalHoliday: true,
            showBriefCounts: true,
        },
    },
    recordCategorySuggestions: ["未分类", "想法", "问题", "决策", "日志"],
    reviewReminderWindows: {
        week: { beforeDays: 1, afterDays: 2 },
        month: { beforeDays: 2, afterDays: 2 },
        year: { beforeDays: 7, afterDays: 7 },
    },
};
