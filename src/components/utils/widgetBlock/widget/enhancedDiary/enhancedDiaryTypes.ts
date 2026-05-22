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

export interface EnhancedDiaryConfig {
    weekReviewDay: EnhancedDiaryWeekday;
    monthReviewRule: EnhancedDiaryMonthRule;
    yearReviewRule: EnhancedDiaryYearRule;
    templates: EnhancedDiaryTemplateMap;
    dailyNotebookId?: string;
    taskMigrationReminderDays: number;
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

## 今日概览

- 今日重点：
- 今日状态：
- 今日一句话：

## 新建任务

> 今天新建的任务放在这里。任务格式兼容 Tasks Plus。

- [ ] 示例任务 ❗❗ ⌛{{date}} 📅{{date}} #示例#

## 迁移任务

> 从旧日记迁移到今天继续处理的任务放在这里。任务第一行保持原样，迁移来源写在任务下方。

## 快速记录

### 未分类

#### 13:01 记录

这里写具体记录内容。

### 想法

#### 13:05 记录

这里写想法内容。

### 问题

#### 13:10 记录

这里写问题内容。

### 决策

#### 13:15 记录

这里写决策内容。

### 日志

#### 13:20 记录

这里写过程日志。

## 项目推进

### 示例项目

- 今日进展：
- 遇到问题：
- 下一步：

## 任务动态

- 示例：新增任务 / 完成任务 / 删除任务 / 迁移任务。

## 今日复盘

### 发生了什么

### 我的感受

### 今日收获

### 遇到的问题

### 下一步`;

const DEFAULT_WEEK_TEMPLATE = `# 本周复盘 {{week}}

周期：{{周期范围}}

{{完成标记}}

## 本周概览

- 本周重点：
- 本周状态：
- 一句话总结：

## 本周完成

## 本周未完成

## 本周项目推进

## 本周重要记录

## 本周复盘

### 发生了什么

### 我的感受

### 本周收获

### 遇到的问题

### 下周下一步`;

const DEFAULT_MONTH_TEMPLATE = `# 本月总结 {{month}}

周期：{{周期范围}}

{{完成标记}}

## 本月概览

## 本月完成

## 本月未完成

## 本月项目推进

## 本月重要记录

## 本月总结

### 发生了什么

### 我的感受

### 本月收获

### 遇到的问题

### 下月下一步`;

const DEFAULT_YEAR_TEMPLATE = `# 年度总结 {{year}}

周期：{{周期范围}}

{{完成标记}}

## 年度概览

## 年度完成

## 年度未完成

## 年度项目推进

## 年度重要记录

## 年度总结

### 发生了什么

### 我的感受

### 年度收获

### 遇到的问题

### 明年下一步`;

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
};
