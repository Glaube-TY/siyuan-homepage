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

export interface EnhancedDiaryWorkspaceModules {
    taskManagementEnabled: boolean;
}

export interface EnhancedDiaryWorkspaceSettings {
    calendar: EnhancedDiaryWorkspaceCalendarSettings;
    modules: EnhancedDiaryWorkspaceModules;
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

export type EnhancedDiaryDayWorkspaceBaseHeadingLevel = 2 | 3 | 4;

export interface EnhancedDiaryHeadingStructureConfig {
    dayWorkspaceBaseHeadingLevel: EnhancedDiaryDayWorkspaceBaseHeadingLevel;
}

export interface EnhancedDiaryDayWorkspaceSectionMapping {
    overview: string[];
    taskManagement: string[];
    newTasks: string[];
    migratedTasks: string[];
    taskLog: string[];
    quickRecords: string[];
    dailyReview: string[];
    projectProgress: string[];
}

export interface EnhancedDiaryReviewSectionMapping {
    reviewRoot: string[];
    fields: string[];
    /** 承接字段别名：上一周期写下的“下一步”会被读取到当前周期。默认可包含多个别名以兼容改名。 */
    carryoverField: string[];
}

export interface EnhancedDiaryTemplateFieldMapping {
    rootHeadings: Record<EnhancedDiaryPeriod, string[]>;
    dayWorkspaceSections: EnhancedDiaryDayWorkspaceSectionMapping;
    reviewSections: Record<EnhancedDiaryPeriod, EnhancedDiaryReviewSectionMapping>;
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
    headingStructure: EnhancedDiaryHeadingStructureConfig;
    templateFieldMapping: EnhancedDiaryTemplateFieldMapping;
}

export type EnhancedDiaryTemplateFieldMappingGroup =
    | "rootHeadings"
    | "dayWorkspaceSections"
    | "reviewSections";

export type EnhancedDiaryDayWorkspaceSectionFieldKey = keyof EnhancedDiaryDayWorkspaceSectionMapping;

export const DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING: EnhancedDiaryTemplateFieldMapping = {
    rootHeadings: {
        day: ["今日日记"],
        week: ["周复盘", "本周复盘"],
        month: ["月复盘", "月度复盘", "本月总结"],
        year: ["年复盘", "年度复盘", "年度总结"],
    },
    dayWorkspaceSections: {
        overview: ["今日概览"],
        taskManagement: ["任务管理"],
        newTasks: ["新建任务"],
        migratedTasks: ["迁移任务"],
        taskLog: ["任务动态"],
        quickRecords: ["快速记录"],
        dailyReview: ["今日复盘"],
        projectProgress: ["项目推进"],
    },
    reviewSections: {
        day: {
            reviewRoot: ["今日复盘"],
            fields: ["今日总结", "情绪状态", "收获与问题", "明日关注"],
            carryoverField: ["明日关注"],
        },
        week: {
            reviewRoot: ["周复盘"],
            fields: ["本周总结", "任务回顾", "记录沉淀", "问题与风险", "下周计划"],
            carryoverField: ["下周计划"],
        },
        month: {
            reviewRoot: ["月度复盘"],
            fields: ["本月总结", "关键进展", "任务回顾", "问题与风险", "下月计划"],
            carryoverField: ["下月计划"],
        },
        year: {
            reviewRoot: ["年度复盘"],
            fields: ["年度总结", "关键成果", "重要变化", "经验教训", "明年方向"],
            carryoverField: ["明年方向"],
        },
    },
};

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

// 旧版任务列表式完成标记，保留兼容识别，不删除历史块。
export const ENHANCED_DIARY_COMPLETION_MARKERS_LEGACY: Record<EnhancedDiaryPeriod, string> = {
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

const DEFAULT_DAY_TEMPLATE = `# 今日日记

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

const DEFAULT_WEEK_TEMPLATE = `# 周复盘

周期：{{周期范围}}

## 周复盘

### 本周总结

### 任务回顾

### 记录沉淀

### 问题与风险

### 下周计划`;

const DEFAULT_MONTH_TEMPLATE = `# 月复盘

周期：{{周期范围}}

## 月度复盘

### 本月总结

### 关键进展

### 任务回顾

### 问题与风险

### 下月计划`;

const DEFAULT_YEAR_TEMPLATE = `# 年复盘

周期：{{周期范围}}

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
        modules: {
            taskManagementEnabled: true,
        },
    },
    recordCategorySuggestions: ["未分类", "想法", "问题", "决策", "日志"],
    reviewReminderWindows: {
        week: { beforeDays: 1, afterDays: 2 },
        month: { beforeDays: 2, afterDays: 2 },
        year: { beforeDays: 7, afterDays: 7 },
    },
    headingStructure: {
        dayWorkspaceBaseHeadingLevel: 2,
    },
    templateFieldMapping: structuredClone(DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING),
};
