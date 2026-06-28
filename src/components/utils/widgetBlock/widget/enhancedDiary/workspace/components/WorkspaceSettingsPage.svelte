<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { lsNotebooks } from "@/api";
    import {
        DEFAULT_ENHANCED_DIARY_CONFIG,
        ENHANCED_DIARY_PERIODS,
        type EnhancedDiaryConfig,
        type EnhancedDiaryMonthRule,
        type EnhancedDiaryPeriod,
        type EnhancedDiaryYearRule,
        type EnhancedDiaryDayWorkspaceSectionFieldKey,
    } from "../../enhancedDiaryTypes";
    import {
        getEnhancedDiaryHeadingPlan,
        parseMarkdownHeadingTree,
        matchesRootHeading,
        normalizeHeadingTitle,
        type EnhancedDiaryHeadingNode,
    } from "../../enhancedDiaryMarkdownSections";
    import {
        getFieldAliases,
        getPrimaryFieldTitle,
        getReviewFieldLookupAliases,
        getWorkspaceReviewFieldEntries,
        headingTitleMatchesAliases,
        isCarryoverField,
        isEnhancedDiaryTaskManagementEnabled,
        isTaskReviewField,
        parseAliasInput,
    } from "../../enhancedDiaryTemplateFieldMapping";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        config: EnhancedDiaryConfig;
        saving?: boolean;
        onSave: (config: EnhancedDiaryConfig) => void | Promise<void>;
        onOpenAndAppendTemplate: () => void | Promise<void>;
    }

    type SettingsTab = "basic" | "calendar" | "record" | "review" | "templates" | "fieldMapping";
    type TemplateHealthStatus = "ok" | "missing" | "suggest";

    interface TemplateHealthCheck {
        key: string;
        label: string;
        description: string;
        status: TemplateHealthStatus;
    }

    let {
        config,
        saving = false,
        onSave,
        onOpenAndAppendTemplate,
    }: Props = $props();

    const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
        { value: 0, label: "周日" },
        { value: 1, label: "周一" },
        { value: 2, label: "周二" },
        { value: 3, label: "周三" },
        { value: 4, label: "周四" },
        { value: 5, label: "周五" },
        { value: 6, label: "周六" },
    ];

    const MONTH_RULE_OPTIONS: { value: EnhancedDiaryMonthRule; label: string }[] = [
        { value: "monthEnd", label: "月末最后一天" },
        { value: "nextMonthFirst", label: "次月 1 日" },
    ];

    const YEAR_RULE_OPTIONS: { value: EnhancedDiaryYearRule; label: string }[] = [
        { value: "dec31", label: "12 月 31 日" },
        { value: "nextJan1", label: "次年 1 月 1 日" },
    ];

    const PERIOD_LABELS: Record<EnhancedDiaryPeriod, string> = {
        day: "日记",
        week: "周记",
        month: "月记",
        year: "年记",
    };

    const VARIABLE_HINTS = "可用变量：{{date}}、{{week}}、{{month}}、{{year}}、{{周期范围}}、{{开始日期}}、{{结束日期}}。完成状态由顶级标题后缀（已完成复盘）自动维护，无需在模板中写标记。";

    let activeSettingsTab: SettingsTab = $state("basic");
    let activeTemplatePeriod: EnhancedDiaryPeriod = $state("day");
    let notebooks = $state<{ id: string; name: string }[]>([]);
    let notebooksLoadFailed = $state(false);

    function cloneConfig(value: EnhancedDiaryConfig): EnhancedDiaryConfig {
        return {
            ...value,
            templates: { ...value.templates },
            workspaceSettings: {
                calendar: { ...value.workspaceSettings.calendar },
                modules: { ...value.workspaceSettings.modules },
            },
            recordCategorySuggestions: [...value.recordCategorySuggestions],
            reviewReminderWindows: {
                week: { ...value.reviewReminderWindows.week },
                month: { ...value.reviewReminderWindows.month },
                year: { ...value.reviewReminderWindows.year },
            },
            headingStructure: { ...value.headingStructure },
            templateFieldMapping: {
                rootHeadings: { ...value.templateFieldMapping.rootHeadings },
                dayWorkspaceSections: { ...value.templateFieldMapping.dayWorkspaceSections },
                reviewSections: {
                    day: {
                        ...value.templateFieldMapping.reviewSections.day,
                        fields: [...value.templateFieldMapping.reviewSections.day.fields],
                        carryoverField: [...value.templateFieldMapping.reviewSections.day.carryoverField],
                    },
                    week: {
                        ...value.templateFieldMapping.reviewSections.week,
                        fields: [...value.templateFieldMapping.reviewSections.week.fields],
                        carryoverField: [...value.templateFieldMapping.reviewSections.week.carryoverField],
                    },
                    month: {
                        ...value.templateFieldMapping.reviewSections.month,
                        fields: [...value.templateFieldMapping.reviewSections.month.fields],
                        carryoverField: [...value.templateFieldMapping.reviewSections.month.carryoverField],
                    },
                    year: {
                        ...value.templateFieldMapping.reviewSections.year,
                        fields: [...value.templateFieldMapping.reviewSections.year.fields],
                        carryoverField: [...value.templateFieldMapping.reviewSections.year.carryoverField],
                    },
                },
            },
        };
    }

    let draft = $state<EnhancedDiaryConfig>(cloneConfig(DEFAULT_ENHANCED_DIARY_CONFIG));
    let lastConfigSignature = $state("");
    let recordCategorySuggestionsText = $state(
        DEFAULT_ENHANCED_DIARY_CONFIG.recordCategorySuggestions.join("\n")
    );

    function syncRecordCategorySuggestionsText(): void {
        recordCategorySuggestionsText = draft.recordCategorySuggestions.join("\n");
    }

    function applyRecordCategorySuggestionsText(): void {
        draft.recordCategorySuggestions = Array.from(
            new Set(
                recordCategorySuggestionsText
                    .split("\n")
                    .map((line) => line.trim().replace(/\n/g, ""))
                    .filter((line) => line.length > 0 && line.length <= 30),
            ),
        );
    }

    function hasText(template: string, text: string): boolean {
        return template.includes(text);
    }

    function findChildByAliases(
        parent: EnhancedDiaryHeadingNode | null,
        aliases: string[]
    ): EnhancedDiaryHeadingNode | null {
        if (!parent) return null;
        const preferredLevel = parent.level + 1;
        for (const child of parent.children) {
            if (child.level === preferredLevel && headingTitleMatchesAliases(normalizeHeadingTitle(child.title), aliases)) {
                return child;
            }
        }
        for (const child of parent.children) {
            if (child.level > preferredLevel && headingTitleMatchesAliases(normalizeHeadingTitle(child.title), aliases)) {
                return child;
            }
        }
        for (const child of parent.children) {
            const result = findChildByAliases(child, aliases);
            if (result) return result;
        }
        return null;
    }

    /**
     * Check if a template markdown contains a section at the given alias path.
     * Uses heading tree parsing for text-based matching.
     */
    function templateHasSection(template: string, aliasesPath: string[][], period: EnhancedDiaryPeriod): boolean {
        const roots = parseMarkdownHeadingTree(template);
        const periodRoot = roots.find((node) => node.level === 1 && matchesRootHeading(normalizeHeadingTitle(node.title), period, draft.templateFieldMapping));
        if (!periodRoot) return false;
        let current: EnhancedDiaryHeadingNode | null = periodRoot;
        for (const aliases of aliasesPath) {
            current = findChildByAliases(current, aliases);
            if (!current) return false;
        }
        return true;
    }

    /**
     * Check if template has a root heading matching the period (level 1, with alias support).
     */
    function templateHasRootHeading(template: string, period: EnhancedDiaryPeriod): boolean {
        const roots = parseMarkdownHeadingTree(template);
        for (const node of roots) {
            if (node.level === 1 && matchesRootHeading(normalizeHeadingTitle(node.title), period, draft.templateFieldMapping)) {
                return true;
            }
        }
        return false;
    }

    function makeCheck(
        key: string,
        label: string,
        description: string,
        ok: boolean,
        statusWhenMissing: TemplateHealthStatus = "missing"
    ): TemplateHealthCheck {
        return {
            key,
            label,
            description,
            status: ok ? "ok" : statusWhenMissing,
        };
    }

    const taskManagementEnabled = $derived(isEnhancedDiaryTaskManagementEnabled(draft));

    const templateHealthChecks = $derived.by((): TemplateHealthCheck[] => {
        const template = draft.templates[activeTemplatePeriod] || "";
        const hs = draft.headingStructure;
        const plan = getEnhancedDiaryHeadingPlan(hs, activeTemplatePeriod);
        const baseHash = "#".repeat(plan.baseLevel);
        const subHash = "#".repeat(plan.subLevel);
        const m = draft.templateFieldMapping;

        const checks: TemplateHealthCheck[] = [];

        if (activeTemplatePeriod === "day") {
            checks.push(
                makeCheck("day-root", "日记根标题", `用于定位日记根结构。建议层级 # ${getPrimaryFieldTitle(m, "rootHeadings", "day")}。文档名承担日期，正文根标题只区分周期类型。`, templateHasRootHeading(template, "day"))
            );
            if (taskManagementEnabled) {
                checks.push(
                    makeCheck("task-mgmt", "任务管理区", `任务相关区块的父级容器。建议层级 ${baseHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "taskManagement")}（层级不固定，按标题文字识别）。`, templateHasSection(template, [getFieldAliases(m, "dayWorkspaceSections", "taskManagement")], activeTemplatePeriod)),
                    makeCheck("new-tasks", "新建任务区", `新建任务会写入这里。建议层级 ${subHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "newTasks")}（层级不固定，按标题文字识别）。`, templateHasSection(template, [getFieldAliases(m, "dayWorkspaceSections", "taskManagement"), getFieldAliases(m, "dayWorkspaceSections", "newTasks")], activeTemplatePeriod)),
                    makeCheck("migrated-tasks", "迁移任务区", `历史任务迁移到今天时会写入这里。建议层级 ${subHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "migratedTasks")}（层级不固定，按标题文字识别）。`, templateHasSection(template, [getFieldAliases(m, "dayWorkspaceSections", "taskManagement"), getFieldAliases(m, "dayWorkspaceSections", "migratedTasks")], activeTemplatePeriod)),
                    makeCheck("task-log", "任务动态区", `任务新增、迁移、删除等日志可沉淀在这里。建议层级 ${subHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "taskLog")}（层级不固定，按标题文字识别）。`, templateHasSection(template, [getFieldAliases(m, "dayWorkspaceSections", "taskManagement"), getFieldAliases(m, "dayWorkspaceSections", "taskLog")], activeTemplatePeriod), "suggest"),
                makeCheck("project-progress", "项目推进区", `项目推进作为独立区块与任务管理并列。建议层级 ${baseHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "projectProgress")}（层级不固定，按标题文字识别）。`, templateHasSection(template, [getFieldAliases(m, "dayWorkspaceSections", "projectProgress")], activeTemplatePeriod), "suggest")
                );
            }
            checks.push(
                makeCheck("quick-records", "快速记录区", `快速记录会按分类写入这里。建议层级 ${baseHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "quickRecords")}（层级不固定，按标题文字识别）。`, templateHasSection(template, [getFieldAliases(m, "dayWorkspaceSections", "quickRecords")], activeTemplatePeriod)),
                makeCheck("daily-review", "今日复盘区", `日复盘和历史复盘体验依赖这里。建议层级 ${baseHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "dailyReview")}（层级不固定，按标题文字识别）。`, templateHasSection(template, [getFieldAliases(m, "dayWorkspaceSections", "dailyReview")], activeTemplatePeriod))
            );
        } else {
            const period = activeTemplatePeriod;
            const periodLabel = PERIOD_LABELS[period];
            const variableKey = period === "week" ? "{{week}}" : period === "month" ? "{{month}}" : "{{year}}";
            const variableLabel = period === "week" ? "周次变量" : period === "month" ? "月份变量" : "年份变量";
            checks.push(
                makeCheck(`${period}-title`, `${periodLabel}标题`, `用于定位${periodLabel}根结构。建议层级 # ${getPrimaryFieldTitle(m, "rootHeadings", period)}。`, templateHasRootHeading(template, period)),
                makeCheck(`${period}-variable`, variableLabel, `显示当前${period === "week" ? "周次" : period === "month" ? "月份" : "年份"}。`, hasText(template, variableKey), "suggest"),
                makeCheck(`${period}-range`, "周期范围变量", `建议显示${period === "week" ? "本周" : period === "month" ? "本月" : "本年度"}起止范围。`, hasText(template, "{{周期范围}}"), "suggest"),
                makeCheck(`${period}-review`, `${periodLabel}复盘区`, `用于沉淀${periodLabel}复盘内容。建议层级 ${baseHash} ${getPrimaryFieldTitle(m, "reviewSections", period, "reviewRoot")}（层级不固定，按标题文字识别）。`, templateHasSection(template, [getFieldAliases(m, "reviewSections", period, "reviewRoot")], period))
            );
            const reviewFieldEntries = getWorkspaceReviewFieldEntries(m, period, taskManagementEnabled);
            for (let i = 0; i < reviewFieldEntries.length; i++) {
                const { label: fieldTitle, originalIndex } = reviewFieldEntries[i];
                const fieldLookupAliases = getReviewFieldLookupAliases(m, period, fieldTitle, originalIndex);
                checks.push(
                    makeCheck(
                        `${period}-field-${i}`,
                        `${fieldTitle}区`,
                        `建议层级 ${subHash} ${fieldTitle}（层级不固定，按标题文字识别）。`,
                        templateHasSection(template, [getFieldAliases(m, "reviewSections", period, "reviewRoot"), fieldLookupAliases], period)
                    )
                );
            }
        }

        return checks;
    });

    const templateMissingCount = $derived(templateHealthChecks.filter((item) => item.status === "missing").length);
    const templateSuggestCount = $derived(templateHealthChecks.filter((item) => item.status === "suggest").length);
    const templateHealthScore = $derived(
        templateHealthChecks.length === 0
            ? 100
            : Math.round((templateHealthChecks.filter((item) => item.status === "ok").length / templateHealthChecks.length) * 100)
    );

    $effect(() => {
        const signature = JSON.stringify(config);
        if (signature === lastConfigSignature) return;
        lastConfigSignature = signature;
        draft = cloneConfig(config);
        syncRecordCategorySuggestionsText();
    });

    onMount(() => {
        lsNotebooks()
            .then((res) => {
                notebooks = (res?.notebooks || []).map((nb: any) => ({
                    id: nb.id,
                    name: nb.name,
                }));
            })
            .catch((err) => {
                console.warn("[WorkspaceSettingsPage] load notebooks failed", err);
                notebooksLoadFailed = true;
            });
    });

    async function saveSettings(): Promise<void> {
        applyRecordCategorySuggestionsText();
        normalizeReviewFieldsBeforeSave();
        await onSave(draft);
        lastConfigSignature = JSON.stringify(draft);
    }

    function restoreTemplate(period: EnhancedDiaryPeriod): void {
        draft.templates[period] = DEFAULT_ENHANCED_DIARY_CONFIG.templates[period];
    }

    const ROOT_HEADING_LABELS: Record<EnhancedDiaryPeriod, string> = {
        day: "今日日记",
        week: "周复盘",
        month: "月复盘",
        year: "年复盘",
    };

    const DAY_WORKSPACE_SECTION_LABELS: Record<EnhancedDiaryDayWorkspaceSectionFieldKey, string> = {
        overview: "今日概览",
        taskManagement: "任务管理",
        newTasks: "新建任务",
        migratedTasks: "迁移任务",
        taskLog: "任务动态",
        quickRecords: "快速记录",
        dailyReview: "今日复盘",
        projectProgress: "项目推进",
    };

    const DEFAULT_CARRYOVER_FIELD_LABELS: Record<EnhancedDiaryPeriod, string> = {
        day: "明日关注",
        week: "下周计划",
        month: "下月计划",
        year: "明年方向",
    };

    function getFieldMappingText(
        group: "rootHeadings",
        key: EnhancedDiaryPeriod
    ): string;
    function getFieldMappingText(
        group: "dayWorkspaceSections",
        key: EnhancedDiaryDayWorkspaceSectionFieldKey
    ): string;
    function getFieldMappingText(
        group: "reviewSections",
        period: EnhancedDiaryPeriod,
        key: "reviewRoot" | "fields" | "carryoverField",
        fieldIndex?: number
    ): string;
    function getFieldMappingText(
        group: "rootHeadings" | "dayWorkspaceSections" | "reviewSections",
        keyOrPeriod: EnhancedDiaryPeriod | EnhancedDiaryDayWorkspaceSectionFieldKey,
        key?: "reviewRoot" | "fields" | "carryoverField",
        fieldIndex?: number
    ): string {
        if (group === "rootHeadings") {
            return (draft.templateFieldMapping.rootHeadings[keyOrPeriod as EnhancedDiaryPeriod] || []).join("\n");
        }
        if (group === "dayWorkspaceSections") {
            return (draft.templateFieldMapping.dayWorkspaceSections[keyOrPeriod as EnhancedDiaryDayWorkspaceSectionFieldKey] || []).join("\n");
        }
        const period = keyOrPeriod as EnhancedDiaryPeriod;
        const section = draft.templateFieldMapping.reviewSections[period];
        if (!section) return "";
        if (key === "reviewRoot") return section.reviewRoot.join("\n");
        if (key === "carryoverField") return section.carryoverField.join("\n");
        if (typeof fieldIndex === "number") return section.fields[fieldIndex] || "";
        return section.fields.join("\n");
    }

    function setFieldMappingText(
        group: "rootHeadings",
        key: EnhancedDiaryPeriod,
        value: string
    ): void;
    function setFieldMappingText(
        group: "dayWorkspaceSections",
        key: EnhancedDiaryDayWorkspaceSectionFieldKey,
        value: string
    ): void;
    function setFieldMappingText(
        group: "reviewSections",
        period: EnhancedDiaryPeriod,
        value: string,
        key: "reviewRoot" | "fields" | "carryoverField",
        fieldIndex?: number
    ): void;
    function setFieldMappingText(
        group: "rootHeadings" | "dayWorkspaceSections" | "reviewSections",
        keyOrPeriod: EnhancedDiaryPeriod | EnhancedDiaryDayWorkspaceSectionFieldKey,
        value: string,
        key?: "reviewRoot" | "fields" | "carryoverField",
        fieldIndex?: number
    ): void {
        const parsed = parseAliasInput(value);
        if (group === "rootHeadings") {
            draft.templateFieldMapping.rootHeadings[keyOrPeriod as EnhancedDiaryPeriod] = parsed;
            return;
        }
        if (group === "dayWorkspaceSections") {
            draft.templateFieldMapping.dayWorkspaceSections[keyOrPeriod as EnhancedDiaryDayWorkspaceSectionFieldKey] = parsed;
            return;
        }
        const period = keyOrPeriod as EnhancedDiaryPeriod;
        const section = draft.templateFieldMapping.reviewSections[period];
        if (key === "reviewRoot") {
            section.reviewRoot = parsed;
        } else if (key === "carryoverField") {
            section.carryoverField = parsed.length > 0 ? parsed : [DEFAULT_CARRYOVER_FIELD_LABELS[period]];
        } else if (typeof fieldIndex === "number") {
            const oldTitle = section.fields[fieldIndex];
            const newTitle = parsed[0] || "";
            section.fields[fieldIndex] = newTitle;
            // 如果用户修改的是当前承接字段，同步更新 carryoverField 别名，避免改名后失去承接关系
            if (oldTitle && newTitle && isCarryoverField(draft.templateFieldMapping, period, oldTitle)) {
                const normalizedOld = normalizeHeadingTitle(oldTitle);
                const existing = section.carryoverField.filter((a) => normalizeHeadingTitle(a) !== normalizedOld);
                section.carryoverField = [newTitle, ...existing];
            }
        } else {
            section.fields = parsed;
        }
    }

    function addReviewField(period: EnhancedDiaryPeriod): void {
        const section = draft.templateFieldMapping.reviewSections[period];
        const newIndex = section.fields.length + 1;
        section.fields.push(`字段 ${newIndex}`);
    }

    function removeReviewField(period: EnhancedDiaryPeriod, index: number): void {
        const section = draft.templateFieldMapping.reviewSections[period];
        const fieldTitle = section.fields[index];
        // 再次保护承接字段，防止误删导致计划承接断裂
        if (fieldTitle && isCarryoverField(draft.templateFieldMapping, period, fieldTitle)) {
            return;
        }
        section.fields = section.fields.filter((_, i) => i !== index);
    }

    function isCarryoverFieldForPeriod(period: EnhancedDiaryPeriod, fieldTitle: string): boolean {
        return isCarryoverField(draft.templateFieldMapping, period, fieldTitle);
    }

    function normalizeReviewFieldsBeforeSave(): void {
        for (const period of ENHANCED_DIARY_PERIODS) {
            const section = draft.templateFieldMapping.reviewSections[period];
            section.fields = Array.from(
                new Set(
                    section.fields
                        .map((f) => f.trim().replace(/\s+/g, " "))
                        .filter((f) => f.length > 0 && f.length <= 50)
                )
            );
            // 确保每个周期至少有一个承接字段存在；若用户误删，将 carryoverField 第一项追加回来
            const hasCarryover = section.fields.some((f) => isCarryoverField(draft.templateFieldMapping, period, f));
            if (!hasCarryover && section.carryoverField.length > 0) {
                const fallback = section.carryoverField[0].trim().replace(/\s+/g, " ");
                if (fallback && !section.fields.includes(fallback)) {
                    section.fields.push(fallback);
                }
            }
        }
    }

    function restoreDefaultFieldMapping(): void {
        draft.templateFieldMapping = cloneConfig(DEFAULT_ENHANCED_DIARY_CONFIG).templateFieldMapping;
    }

    function buildReviewFieldsTemplate(period: EnhancedDiaryPeriod, baseHash: string, subHash: string): string {
        const m = draft.templateFieldMapping;
        const reviewRoot = getPrimaryFieldTitle(m, "reviewSections", period, "reviewRoot");
        const reviewFields = m.reviewSections[period].fields.filter(
            (field) => taskManagementEnabled || !isTaskReviewField(period, field)
        );
        const fieldLines = reviewFields.map((field) => `${subHash} ${field}`).join("\n\n");
        return `${baseHash} ${reviewRoot}\n\n${fieldLines}`;
    }

    function buildPlanAwareTemplate(period: EnhancedDiaryPeriod): string {
        const hs = draft.headingStructure;
        const plan = getEnhancedDiaryHeadingPlan(hs, period, draft.templateFieldMapping);
        const baseHash = "#".repeat(plan.baseLevel);
        const subHash = "#".repeat(plan.subLevel);
        const m = draft.templateFieldMapping;

        if (period === "day") {
            const root = getPrimaryFieldTitle(m, "rootHeadings", "day");
            const quickRecords = getPrimaryFieldTitle(m, "dayWorkspaceSections", "quickRecords");
            const taskLines = taskManagementEnabled
                ? [
                    `${baseHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "taskManagement")}`,
                    `${subHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "newTasks")}`,
                    `${subHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "migratedTasks")}`,
                    `${subHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "taskLog")}`,
                    `${baseHash} ${getPrimaryFieldTitle(m, "dayWorkspaceSections", "projectProgress")}`,
                ].join("\n\n")
                : "";
            const reviewLines = buildReviewFieldsTemplate("day", baseHash, subHash);
            const body = [taskLines, `${baseHash} ${quickRecords}`, reviewLines].filter(Boolean).join("\n\n");
            return `# ${root}\n\n${body}`;
        }

        const root = getPrimaryFieldTitle(m, "rootHeadings", period);
        const reviewLines = buildReviewFieldsTemplate(period, baseHash, subHash);
        return `# ${root}\n\n周期：{{周期范围}}\n\n${reviewLines}`;
    }

    async function copyRecommendedTemplateSnippet(): Promise<void> {
        const current = draft.templates[activeTemplatePeriod] || "";
        const missingChecks = templateHealthChecks.filter((item) => item.status !== "ok");
        const recommendedTemplate = buildPlanAwareTemplate(activeTemplatePeriod);
        const content = [
            `<!-- ${PERIOD_LABELS[activeTemplatePeriod]} 推荐模板片段，仅供手动参考 -->`,
            missingChecks.length > 0
                ? `<!-- 当前缺失/建议检查项：${missingChecks.map((item) => item.label).join("、")} -->`
                : "<!-- 当前模板检查已通过，下面是基于当前配置的推荐模板。 -->",
            "",
            recommendedTemplate || current,
        ].join("\n");

        try {
            await navigator.clipboard.writeText(content);
            showMessage("已复制推荐模板片段", 2500);
        } catch (err) {
            console.warn("[WorkspaceSettingsPage] copy template snippet failed", err);
            showMessage("复制失败，请手动复制默认模板", 3000);
        }
    }
</script>

<section class="settings-page">
    <div class="settings-head">
        <div>
            <h2>工作台设置</h2>
            <p>这里是强化日记的完整配置中心。组件内容设置里只保留轻量入口，模板和工作台表现都在这里维护。</p>
        </div>
        <button type="button" class="primary-btn" disabled={saving} onclick={saveSettings}>
            {saving ? "保存中..." : "保存设置"}
        </button>
    </div>

    <div class="settings-tabs" aria-label="工作台设置分类">
        <button type="button" class:active={activeSettingsTab === "basic"} onclick={() => (activeSettingsTab = "basic")}>基础</button>
        <button type="button" class:active={activeSettingsTab === "calendar"} onclick={() => (activeSettingsTab = "calendar")}>日历</button>
        <button type="button" class:active={activeSettingsTab === "record"} onclick={() => (activeSettingsTab = "record")}>记录</button>
        <button type="button" class:active={activeSettingsTab === "review"} onclick={() => (activeSettingsTab = "review")}>复盘</button>
        <button type="button" class:active={activeSettingsTab === "templates"} onclick={() => (activeSettingsTab = "templates")}>模板</button>
        <button type="button" class:active={activeSettingsTab === "fieldMapping"} onclick={() => (activeSettingsTab = "fieldMapping")}>字段匹配</button>
    </div>

    {#if activeSettingsTab === "basic"}
        <section class="setting-card">
            <div class="setting-card-title">
                <WorkspaceIcon name="diary" size={18} />
                <span>日记与复盘</span>
            </div>

            <label class="input-row">
                <span>
                    <strong>日记笔记本</strong>
                    <small>用于创建今日日记。调用思源原生 createDailyNote，不自行计算日记路径。</small>
                </span>
                <select bind:value={draft.dailyNotebookId}>
                    <option value="">请选择日记笔记本</option>
                    {#each notebooks as nb}
                        <option value={nb.id}>{nb.name}</option>
                    {/each}
                </select>
            </label>
            {#if notebooksLoadFailed}
                <div class="inline-error">笔记本列表加载失败，请稍后刷新工作台重试。</div>
            {/if}

            <label class="input-row">
                <span>
                    <strong>周记复盘日期</strong>
                    <small>每周复盘的目标日期。</small>
                </span>
                <select bind:value={draft.weekReviewDay}>
                    {#each WEEKDAY_OPTIONS as opt}
                        <option value={opt.value}>{opt.label}</option>
                    {/each}
                </select>
            </label>

            <label class="input-row">
                <span>
                    <strong>月记复盘规则</strong>
                    <small>月总结的目标日期规则。</small>
                </span>
                <select bind:value={draft.monthReviewRule}>
                    {#each MONTH_RULE_OPTIONS as opt}
                        <option value={opt.value}>{opt.label}</option>
                    {/each}
                </select>
            </label>

            <label class="input-row">
                <span>
                    <strong>年记复盘规则</strong>
                    <small>年总结的目标日期规则。</small>
                </span>
                <select bind:value={draft.yearReviewRule}>
                    {#each YEAR_RULE_OPTIONS as opt}
                        <option value={opt.value}>{opt.label}</option>
                    {/each}
                </select>
            </label>

            <label class="input-row" class:disabled={!taskManagementEnabled}>
                <span>
                    <strong>任务迁移提醒天数</strong>
                    <small>
                        {taskManagementEnabled
                            ? "未完成任务超过该天数后，在工作台提示迁移到今日日记。"
                            : "任务管理已关闭，开启后继续使用该设置。"}
                    </small>
                </span>
                <input
                    type="number"
                    min="1"
                    max="3650"
                    step="1"
                    disabled={!taskManagementEnabled}
                    bind:value={draft.taskMigrationReminderDays}
                />
            </label>
        </section>

        <section class="setting-card">
            <div class="setting-card-title">
                <WorkspaceIcon name="tasks" size={18} />
                <span>工作台模块</span>
            </div>
            <p class="setting-desc">关闭后工作台不读取、不展示、不创建任务和项目；不会删除日记里的历史任务内容，也不影响思源或其他插件的任务。</p>
            <label class="switch-row">
                <span>
                    <strong>启用任务管理</strong>
                    <small>关闭后任务、项目相关导航、统计卡、命令、搜索结果和通知项都会隐藏。</small>
                </span>
                <input class="b3-switch fn__flex-center" type="checkbox" bind:checked={draft.workspaceSettings.modules.taskManagementEnabled} />
            </label>
        </section>

        <section class="setting-card">
            <div class="setting-card-title">
                <WorkspaceIcon name="template" size={18} />
                <span>标题结构</span>
            </div>
            <p class="setting-desc">控制工作台区块的标题层级。根标题（如 `# 今日日记`）始终保留，文档名承担日期。修改起始层级后需要同步更新模板内容。注意：此设置仅影响推荐模板生成和健康检查中的建议层级，不限制已有日记的识别——插件按标题文字自动识别区块，不依赖固定层级。</p>

            <label class="input-row">
                <span>
                    <strong>工作台标题起始层级</strong>
                    <small>任务管理、快速记录等一级区块的标题层级。默认 H2，适合大多数主题。H4 适合把 H2/H3 留给更高层结构的主题。</small>
                </span>
                <select bind:value={draft.headingStructure.dayWorkspaceBaseHeadingLevel}>
                    <option value={2}>H2（默认）</option>
                    <option value={3}>H3</option>
                    <option value={4}>H4</option>
                </select>
            </label>
        </section>
    {:else if activeSettingsTab === "calendar"}
        <section class="setting-card">
            <div class="setting-card-title">
                <WorkspaceIcon name="calendar" size={18} />
                <span>日历显示</span>
            </div>
            <label class="switch-row">
                <span>
                    <strong>农历日期</strong>
                    <small>在日期格右上角显示初一、十五等农历日名。</small>
                </span>
                <input class="b3-switch fn__flex-center" type="checkbox" bind:checked={draft.workspaceSettings.calendar.showLunar} />
            </label>
            <label class="switch-row">
                <span>
                    <strong>节气</strong>
                    <small>只在节气当天显示节气名称。</small>
                </span>
                <input class="b3-switch fn__flex-center" type="checkbox" bind:checked={draft.workspaceSettings.calendar.showSolarTerm} />
            </label>
            <label class="switch-row">
                <span>
                    <strong>传统/公历节日</strong>
                    <small>显示春节、中秋、劳动节等节日信息。</small>
                </span>
                <input class="b3-switch fn__flex-center" type="checkbox" bind:checked={draft.workspaceSettings.calendar.showFestival} />
            </label>
            <label class="switch-row">
                <span>
                    <strong>法定节假日</strong>
                    <small>优先显示 tyme4ts 提供的法定假日名称。</small>
                </span>
                <input class="b3-switch fn__flex-center" type="checkbox" bind:checked={draft.workspaceSettings.calendar.showLegalHoliday} />
            </label>
            <label class="switch-row">
                <span>
                    <strong>简略数量</strong>
                    <small>用“日记 / 任务 2 / 记录 1”替代小圆点。</small>
                </span>
                <input class="b3-switch fn__flex-center" type="checkbox" bind:checked={draft.workspaceSettings.calendar.showBriefCounts} />
            </label>
        </section>
    {:else if activeSettingsTab === "record"}
        <section class="setting-card">
            <div class="setting-card-title">
                <WorkspaceIcon name="records" size={18} />
                <span>快速记录分类候选</span>
            </div>
            <p class="setting-desc">每行一个分类，仅作为弹窗候选；真实分类仍以日记中"快速记录"下的子标题为准（按标题文字识别，不依赖固定层级）。</p>
            <textarea
                class="b3-text-field"
                bind:value={recordCategorySuggestionsText}
                onchange={applyRecordCategorySuggestionsText}
                rows={6}
                placeholder="每行一个分类"
            ></textarea>
        </section>
    {:else if activeSettingsTab === "review"}
        <section class="setting-card">
            <div class="setting-card-title">
                <WorkspaceIcon name="review" size={18} />
                <span>复盘提醒窗口</span>
            </div>
            <p class="setting-desc">周/月/年复盘只在配置的窗口内触发提醒。日记每天都可提醒，不受窗口限制。</p>

            <label class="input-row">
                <span>
                    <strong>周复盘</strong>
                    <small>提前提醒天数、到期后继续提醒天数。</small>
                </span>
                <div class="window-inputs">
                    <input
                        type="number"
                        min="0"
                        max="30"
                        step="1"
                        bind:value={draft.reviewReminderWindows.week.beforeDays}
                        placeholder="提前"
                    />
                    <span class="window-separator">/</span>
                    <input
                        type="number"
                        min="0"
                        max="30"
                        step="1"
                        bind:value={draft.reviewReminderWindows.week.afterDays}
                        placeholder="到期后"
                    />
                </div>
            </label>

            <label class="input-row">
                <span>
                    <strong>月总结</strong>
                    <small>提前提醒天数、到期后继续提醒天数。</small>
                </span>
                <div class="window-inputs">
                    <input
                        type="number"
                        min="0"
                        max="30"
                        step="1"
                        bind:value={draft.reviewReminderWindows.month.beforeDays}
                        placeholder="提前"
                    />
                    <span class="window-separator">/</span>
                    <input
                        type="number"
                        min="0"
                        max="30"
                        step="1"
                        bind:value={draft.reviewReminderWindows.month.afterDays}
                        placeholder="到期后"
                    />
                </div>
            </label>

            <label class="input-row">
                <span>
                    <strong>年度总结</strong>
                    <small>提前提醒天数、到期后继续提醒天数。</small>
                </span>
                <div class="window-inputs">
                    <input
                        type="number"
                        min="0"
                        max="30"
                        step="1"
                        bind:value={draft.reviewReminderWindows.year.beforeDays}
                        placeholder="提前"
                    />
                    <span class="window-separator">/</span>
                    <input
                        type="number"
                        min="0"
                        max="30"
                        step="1"
                        bind:value={draft.reviewReminderWindows.year.afterDays}
                        placeholder="到期后"
                    />
                </div>
            </label>
        </section>
    {:else if activeSettingsTab === "templates"}
        <section class="setting-card">
            <div class="setting-card-title">
                <WorkspaceIcon name="template" size={18} />
                <span>模板设置</span>
            </div>

            <div class="template-tabs" aria-label="模板类型">
                {#each ENHANCED_DIARY_PERIODS as period}
                    <button
                        type="button"
                        class:active={activeTemplatePeriod === period}
                        onclick={() => (activeTemplatePeriod = period)}
                    >
                        {PERIOD_LABELS[period]}
                    </button>
                {/each}
            </div>

            <div class="template-toolbar">
                <span>{VARIABLE_HINTS}</span>
                <div class="template-toolbar-actions">
                    <button type="button" onclick={copyRecommendedTemplateSnippet}>复制推荐片段</button>
                    <button type="button" onclick={() => restoreTemplate(activeTemplatePeriod)}>恢复默认模板</button>
                </div>
            </div>

            <div class="template-health-card">
                <div class="template-health-summary">
                    <div>
                        <strong>模板健康检查</strong>
                        <span>只读检查，不会自动修改模板。</span>
                    </div>
                    <div class="health-score">
                        <strong>{templateHealthScore}</strong>
                        <span>分</span>
                    </div>
                </div>
                <div class="template-health-stats">
                    <span class:bad={templateMissingCount > 0}>缺失 {templateMissingCount}</span>
                    <span class:warn={templateSuggestCount > 0}>建议 {templateSuggestCount}</span>
                    <span>检查 {templateHealthChecks.length}</span>
                </div>
                <div class="template-health-list">
                    {#each templateHealthChecks as item}
                        <div class="template-health-item status-{item.status}">
                            <span class="health-dot"></span>
                            <div>
                                <strong>{item.label}</strong>
                                <small>{item.description}</small>
                            </div>
                            <em>{item.status === "ok" ? "正常" : item.status === "missing" ? "缺失" : "建议配置"}</em>
                        </div>
                    {/each}
                </div>
            </div>

            <textarea
                bind:value={draft.templates[activeTemplatePeriod]}
                class="template-textarea"
                rows={18}
                placeholder={`输入 ${PERIOD_LABELS[activeTemplatePeriod]} Markdown 模板...`}
            ></textarea>
        </section>

        <section class="setting-card">
            <div class="setting-card-title">
                <WorkspaceIcon name="open" size={18} />
                <span>模板维护</span>
            </div>
            <div class="template-actions">
                <button type="button" class="primary-btn" onclick={onOpenAndAppendTemplate}>打开并补模板</button>
            </div>
            <p class="card-note">补充模板会追加缺失结构，不覆盖已有内容。插件按标题文字识别区块，不同层级的同名标题均可识别。</p>
        </section>
    {:else if activeSettingsTab === "fieldMapping"}
        <section class="setting-card">
            <div class="setting-card-title">
                <WorkspaceIcon name="diary" size={18} />
                <span>字段匹配</span>
            </div>
            <p class="card-note">自定义标题后，插件识别、推荐模板、补缺失区块都会按映射表工作。默认标题始终作为兜底别名参与匹配，旧文档不会失效。字段匹配只控制识别和推荐模板，不会自动重命名历史文档。</p>

            <div class="field-mapping-actions">
                <button type="button" class="settings-action-btn secondary" onclick={restoreDefaultFieldMapping}>恢复默认字段匹配</button>
            </div>

            <div class="field-mapping-group">
                <h3>根标题匹配</h3>
                <p class="field-mapping-hint">每项第一项用于生成推荐模板和自动补区块，其余用于匹配旧标题。</p>
                <div class="field-mapping-grid">
                    {#each ENHANCED_DIARY_PERIODS as period}
                        <label class="field-mapping-item">
                            <span>{ROOT_HEADING_LABELS[period]}</span>
                            <textarea
                                rows="3"
                                value={getFieldMappingText("rootHeadings", period)}
                                oninput={(e) => setFieldMappingText("rootHeadings", period, e.currentTarget.value)}
                                placeholder={`如：${ROOT_HEADING_LABELS[period]}`}
                            ></textarea>
                        </label>
                    {/each}
                </div>
            </div>

            <div class="field-mapping-group">
                <h3>日记与记录区块</h3>
                <p class="field-mapping-hint">用换行、逗号、顿号分隔多个别名；第一项用于新模板和自动补区块。今日概览是工作台界面卡片，不作为模板核心区块检测。</p>
                <div class="field-mapping-grid field-mapping-grid-2">
                    {#each (["quickRecords", "dailyReview"] as EnhancedDiaryDayWorkspaceSectionFieldKey[]) as sectionKey}
                        <label class="field-mapping-item">
                            <span>{DAY_WORKSPACE_SECTION_LABELS[sectionKey]}</span>
                            <textarea
                                rows="3"
                                value={getFieldMappingText("dayWorkspaceSections", sectionKey)}
                                oninput={(e) => setFieldMappingText("dayWorkspaceSections", sectionKey, e.currentTarget.value)}
                                placeholder={`如：${DAY_WORKSPACE_SECTION_LABELS[sectionKey]}`}
                            ></textarea>
                        </label>
                    {/each}
                </div>
            </div>

            <div class="field-mapping-group" class:disabled-group={!taskManagementEnabled}>
                <div class="field-mapping-group-head">
                    <h3>任务区块</h3>
                    {#if !taskManagementEnabled}
                        <span class="module-disabled-badge">任务管理已关闭</span>
                    {/if}
                </div>
                <p class="field-mapping-hint">关闭“任务管理”后，这些字段仍会作为别名参与识别，但推荐模板和健康检查不再要求它们。</p>
                <div class="field-mapping-grid field-mapping-grid-2">
                    {#each (["taskManagement", "newTasks", "migratedTasks", "taskLog"] as EnhancedDiaryDayWorkspaceSectionFieldKey[]) as sectionKey}
                        <label class="field-mapping-item">
                            <span>{DAY_WORKSPACE_SECTION_LABELS[sectionKey]}</span>
                            <textarea
                                rows="3"
                                value={getFieldMappingText("dayWorkspaceSections", sectionKey)}
                                oninput={(e) => setFieldMappingText("dayWorkspaceSections", sectionKey, e.currentTarget.value)}
                                placeholder={`如：${DAY_WORKSPACE_SECTION_LABELS[sectionKey]}`}
                                disabled={!taskManagementEnabled}
                            ></textarea>
                        </label>
                    {/each}
                </div>
            </div>

            <div class="field-mapping-group" class:disabled-group={!taskManagementEnabled}>
                <div class="field-mapping-group-head">
                    <h3>项目区块</h3>
                    {#if !taskManagementEnabled}
                        <span class="module-disabled-badge">任务管理已关闭</span>
                    {/if}
                </div>
                <p class="field-mapping-hint">项目推进属于任务体系，关闭任务管理后不再生成项目相关推荐模板。</p>
                <div class="field-mapping-grid field-mapping-grid-2">
                    {#each (["projectProgress"] as EnhancedDiaryDayWorkspaceSectionFieldKey[]) as sectionKey}
                        <label class="field-mapping-item">
                            <span>{DAY_WORKSPACE_SECTION_LABELS[sectionKey]}</span>
                            <textarea
                                rows="3"
                                value={getFieldMappingText("dayWorkspaceSections", sectionKey)}
                                oninput={(e) => setFieldMappingText("dayWorkspaceSections", sectionKey, e.currentTarget.value)}
                                placeholder={`如：${DAY_WORKSPACE_SECTION_LABELS[sectionKey]}`}
                                disabled={!taskManagementEnabled}
                            ></textarea>
                        </label>
                    {/each}
                </div>
            </div>

            <div class="field-mapping-group">
                <h3>复盘字段</h3>
                <p class="field-mapping-hint">日 / 周 / 月 / 年各自分组。复盘根标题支持多别名；子字段可添加、删除，但承接字段默认受保护。{taskManagementEnabled ? "" : "任务管理已关闭，任务回顾字段可删除，也不会出现在推荐模板中。"}仅改名时会兼容读取旧标题；删除或调整顺序后，插件按当前字段结构处理。</p>
                {#each ENHANCED_DIARY_PERIODS as period}
                    {@const carryoverLabel = DEFAULT_CARRYOVER_FIELD_LABELS[period]}
                    <div class="field-mapping-subgroup">
                        <h4>{ROOT_HEADING_LABELS[period]} / {PERIOD_LABELS[period]}</h4>
                        <div class="field-mapping-grid field-mapping-grid-2">
                            <label class="field-mapping-item">
                                <span>复盘根标题</span>
                                <textarea
                                    rows="2"
                                    value={getFieldMappingText("reviewSections", period, "reviewRoot")}
                                    oninput={(e) => setFieldMappingText("reviewSections", period, e.currentTarget.value, "reviewRoot")}
                                    placeholder="复盘区标题"
                                ></textarea>
                            </label>
                            {#each draft.templateFieldMapping.reviewSections[period].fields as fieldTitle, index}
                                {@const isCarryover = isCarryoverFieldForPeriod(period, fieldTitle)}
                                <label class="field-mapping-item">
                                    <span class="field-mapping-field-label">
                                        {isCarryover ? `字段 ${index + 1} · 承接字段` : `字段 ${index + 1}`}
                                        {#if isCarryover}
                                            <small class="carryover-hint">{carryoverLabel}会用于{period === "day" ? "明天" : period === "week" ? "下周" : period === "month" ? "下月" : "明年"}显示上一周期计划</small>
                                        {/if}
                                    </span>
                                    <div class="field-mapping-field-row">
                                        <input
                                            type="text"
                                            value={getFieldMappingText("reviewSections", period, "fields", index)}
                                            oninput={(e) => setFieldMappingText("reviewSections", period, e.currentTarget.value, "fields", index)}
                                            placeholder={`字段 ${index + 1}`}
                                        />
                                        <button
                                            type="button"
                                            class="settings-action-btn danger"
                                            title={isCarryover ? "承接字段默认不可删除" : "删除字段"}
                                            disabled={isCarryover}
                                            onclick={() => removeReviewField(period, index)}
                                        >删除</button>
                                    </div>
                                </label>
                            {/each}
                            <label class="field-mapping-item">
                                <span>承接字段别名</span>
                                <textarea
                                    rows="2"
                                    value={getFieldMappingText("reviewSections", period, "carryoverField")}
                                    oninput={(e) => setFieldMappingText("reviewSections", period, e.currentTarget.value, "carryoverField")}
                                    placeholder={`如：${carryoverLabel}`}
                                ></textarea>
                            </label>
                        </div>
                        <div class="field-mapping-subgroup-actions">
                            <button type="button" class="settings-action-btn secondary" onclick={() => addReviewField(period)}>添加字段</button>
                        </div>
                    </div>
                {/each}
            </div>
        </section>
    {/if}
</section>

<style>
    .settings-page {
        display: flex;
        flex-direction: column;
        gap: var(--wk-gap-md);
    }

    .settings-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--wk-gap-sm);
    }

    .settings-head h2 {
        margin: 0;
        font-size: var(--wk-text-lg);
        font-weight: 700;
        color: var(--wk-ink);
    }

    .settings-head p,
    .card-note {
        margin: 4px 0 0;
        font-size: var(--wk-text-sm);
        line-height: 1.5;
        color: var(--wk-ink-muted);
    }

    .setting-desc {
        margin: 2px 0 12px;
        font-size: var(--wk-text-sm);
        line-height: 1.6;
        color: var(--wk-ink-muted);
    }

    .setting-card textarea.b3-text-field {
        display: block;
        width: 100%;
        min-height: 132px;
        box-sizing: border-box;
        margin-top: 10px;
        padding: 10px 12px;
        line-height: 1.55;
        resize: vertical;
    }

    .settings-tabs,
    .template-tabs {
        display: inline-flex;
        width: fit-content;
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        overflow: hidden;
        background: var(--wk-surface);
    }

    .settings-tabs button,
    .template-tabs button {
        min-width: 72px;
        border: none;
        border-right: 1px solid var(--wk-border);
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        padding: 7px 13px;
        font-size: var(--wk-text-sm);
        cursor: pointer;
        transition: background var(--wk-transition-fast), color var(--wk-transition-fast);
    }

    .settings-tabs button:last-child,
    .template-tabs button:last-child {
        border-right: none;
    }

    .settings-tabs button.active,
    .template-tabs button.active {
        background: var(--wk-primary);
        color: var(--wk-primary-contrast);
    }

    .setting-card {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-md);
        background: var(--wk-surface);
        padding: var(--wk-gap-md);
    }

    .setting-card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        color: var(--wk-ink);
        font-size: var(--wk-text-md);
        font-weight: 700;
    }

    .switch-row,
    .input-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--wk-gap-sm);
        padding: 10px 0;
        border-top: 1px solid var(--wk-border);
    }

    .switch-row span,
    .input-row span {
        min-width: 0;
    }

    .switch-row strong,
    .input-row strong {
        display: block;
        color: var(--wk-ink-secondary);
        font-size: var(--wk-text-base);
        font-weight: 600;
    }

    .switch-row small,
    .input-row small,
    .template-toolbar {
        display: block;
        margin-top: 3px;
        color: var(--wk-ink-faint);
        font-size: var(--wk-text-xs);
        line-height: 1.45;
    }

    .input-row input[type="number"],
    .input-row select {
        width: 160px;
        height: 32px;
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 0 8px;
        font-size: var(--wk-text-base);
    }

    .window-inputs {
        display: flex;
        align-items: center;
        gap: var(--wk-gap-xs);
    }

    .window-inputs input[type="number"] {
        width: 72px;
    }

    .window-separator {
        color: var(--wk-ink-faint);
        font-size: var(--wk-text-base);
    }

    .template-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--wk-gap-sm);
        margin: 12px 0 8px;
        opacity: 1;
    }

    .template-toolbar span {
        min-width: 0;
        color: var(--wk-ink-muted);
    }

    .template-toolbar-actions {
        display: inline-flex;
        align-items: center;
        gap: var(--wk-gap-xs);
        flex-shrink: 0;
    }

    .template-health-card {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-md);
        background: var(--wk-background);
        padding: 12px;
        margin-bottom: 10px;
    }

    .template-health-summary {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--wk-gap-sm);
        margin-bottom: 8px;
    }

    .template-health-summary strong {
        display: block;
        font-size: var(--wk-text-base);
        color: var(--wk-ink-secondary);
    }

    .template-health-summary span {
        display: block;
        margin-top: 2px;
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-muted);
    }

    .health-score {
        min-width: 56px;
        text-align: right;
    }

    .health-score strong {
        font-size: var(--wk-text-xl);
        line-height: 1;
        color: var(--wk-primary);
        font-variant-numeric: tabular-nums;
    }

    .template-health-stats {
        display: flex;
        flex-wrap: wrap;
        gap: var(--wk-gap-xs);
        margin-bottom: 10px;
    }

    .template-health-stats span {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-pill);
        padding: 2px 8px;
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-secondary);
        background: var(--wk-surface);
    }

    .template-health-stats span.bad {
        color: var(--wk-error);
        border-color: var(--wk-error-border);
        background: var(--wk-error-bg);
    }

    .template-health-stats span.warn {
        color: var(--wk-warning);
        border-color: var(--wk-warning-border);
        background: var(--wk-warning-bg);
    }

    .template-health-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 8px;
    }

    .template-health-item {
        min-width: 0;
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-surface);
        padding: 9px 10px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
    }

    .health-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--wk-success);
    }

    .template-health-item.status-missing .health-dot {
        background: var(--wk-error);
    }

    .template-health-item.status-suggest .health-dot {
        background: var(--wk-warning);
    }

    .template-health-item strong {
        display: block;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .template-health-item small {
        display: block;
        margin-top: 2px;
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .template-health-item em {
        font-style: normal;
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-muted);
        white-space: nowrap;
    }

    .template-textarea {
        width: 100%;
        min-height: 320px;
        box-sizing: border-box;
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 10px 12px;
        font-family: var(--b3-font-family-code, monospace);
        font-size: var(--wk-text-sm);
        line-height: 1.55;
        resize: vertical;
    }

    .template-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--wk-gap-xs);
        border-top: 1px solid var(--wk-border);
        padding-top: 12px;
    }

    .template-actions button,
    .settings-tabs button,
    .template-tabs button,
    .template-toolbar-actions button,
    .settings-head button {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 7px 12px;
        font-size: var(--wk-text-sm);
        cursor: pointer;
        transition: border-color var(--wk-transition-fast), color var(--wk-transition-fast);
    }

    .template-actions button:hover:not(:disabled),
    .settings-tabs button:hover:not(:disabled),
    .template-tabs button:hover:not(:disabled),
    .template-toolbar-actions button:hover:not(:disabled),
    .settings-head button:hover:not(:disabled) {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .primary-btn {
        border-color: var(--wk-primary);
        background: var(--wk-primary);
        color: var(--wk-primary-contrast);
    }

    .primary-btn:hover:not(:disabled) {
        color: var(--wk-primary-contrast);
        opacity: 0.88;
    }

    .template-actions button:disabled,
    .settings-tabs button:disabled,
    .template-tabs button:disabled,
    .template-toolbar-actions button:disabled,
    .settings-head button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }

    .inline-error {
        border-top: 1px solid var(--wk-border);
        padding: 8px 0 2px;
        color: var(--wk-error);
        font-size: var(--wk-text-sm);
    }

    @media (max-width: 720px) {
        .settings-head,
        .switch-row,
        .input-row,
        .template-toolbar {
            flex-direction: column;
            align-items: stretch;
        }

        .settings-tabs,
        .template-tabs,
        .input-row input[type="number"],
        .input-row select {
            width: 100%;
        }

        .template-toolbar-actions {
            width: 100%;
            flex-direction: column;
            align-items: stretch;
        }

        .settings-tabs button,
        .template-tabs button {
            flex: 1;
            min-width: 0;
        }
    }

    .field-mapping-group {
        margin-top: var(--wk-gap-md);
    }

    .field-mapping-group h3 {
        margin: 0 0 6px;
        font-size: var(--wk-text-base);
        color: var(--wk-ink);
    }

    .field-mapping-subgroup {
        margin-top: 12px;
        padding: 12px;
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
    }

    .field-mapping-subgroup h4 {
        margin: 0 0 10px;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-secondary);
    }

    .field-mapping-hint {
        margin: 0 0 10px;
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-muted);
        line-height: 1.45;
    }

    .field-mapping-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
    }

    .field-mapping-grid-2 {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }

    .field-mapping-item {
        display: flex;
        flex-direction: column;
        gap: var(--wk-gap-xs);
    }

    .field-mapping-item span {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-secondary);
        font-weight: 600;
    }

    .field-mapping-item textarea,
    .field-mapping-item input[type="text"] {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 8px 10px;
        font-size: var(--wk-text-base);
        resize: vertical;
    }

    .field-mapping-group-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--wk-gap-sm);
        margin-bottom: 6px;
    }

    .field-mapping-group-head h3 {
        margin: 0;
    }

    .module-disabled-badge {
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-muted);
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-pill);
        padding: 2px 8px;
        white-space: nowrap;
    }

    .disabled-group textarea {
        opacity: 0.55;
        cursor: not-allowed;
        background: var(--wk-background);
    }

    .field-mapping-field-label {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .carryover-hint {
        font-weight: 400;
        font-size: var(--wk-text-xs);
        opacity: 0.7;
    }

    .field-mapping-field-row {
        display: flex;
        gap: var(--wk-gap-xs);
        align-items: center;
    }

    .field-mapping-field-row input[type="text"] {
        flex: 1;
    }

    .field-mapping-actions,
    .field-mapping-subgroup-actions {
        display: flex;
        gap: var(--wk-gap-xs);
        margin: 10px 0 14px;
    }

    .field-mapping-subgroup-actions {
        margin: 10px 0 0;
    }

    .settings-action-btn {
        flex-shrink: 0;
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        padding: 6px 12px;
        font-size: var(--wk-text-sm);
        cursor: pointer;
        transition: border-color var(--wk-transition-fast), color var(--wk-transition-fast);
    }

    .settings-action-btn:hover:not(:disabled) {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .settings-action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .settings-action-btn.danger:hover:not(:disabled) {
        border-color: var(--wk-error);
        color: var(--wk-error);
    }

    .field-mapping-item input[type="text"] {
        height: 34px;
    }
</style>
