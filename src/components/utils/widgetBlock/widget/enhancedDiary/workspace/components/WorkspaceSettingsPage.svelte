<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { lsNotebooks } from "@/api";
    import {
        DEFAULT_ENHANCED_DIARY_CONFIG,
        ENHANCED_DIARY_PERIODS,
        type EnhancedDiaryConfig,
        type EnhancedDiaryDayWorkspaceBaseHeadingLevel,
        type EnhancedDiaryMonthRule,
        type EnhancedDiaryPeriod,
        type EnhancedDiaryYearRule,
    } from "../../enhancedDiaryTypes";
    import { getEnhancedDiaryHeadingPlan, parseMarkdownHeadingTree, findSectionByTitlePath, matchesRootHeading, normalizeHeadingTitle } from "../../enhancedDiaryMarkdownSections";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        config: EnhancedDiaryConfig;
        saving?: boolean;
        onSave: (config: EnhancedDiaryConfig) => void | Promise<void>;
        onAppendTemplate: () => void | Promise<void>;
        onOpenToday: () => void | Promise<void>;
    }

    type SettingsTab = "basic" | "calendar" | "record" | "review" | "templates";
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
        onAppendTemplate,
        onOpenToday,
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

    const VARIABLE_HINTS = "可用变量：{{完成标记}}（必需）、{{date}}、{{week}}、{{month}}、{{year}}、{{周期范围}}、{{开始日期}}、{{结束日期}}";

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
            },
            recordCategorySuggestions: [...value.recordCategorySuggestions],
            reviewReminderWindows: {
                week: { ...value.reviewReminderWindows.week },
                month: { ...value.reviewReminderWindows.month },
                year: { ...value.reviewReminderWindows.year },
            },
            headingStructure: { ...value.headingStructure },
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

    /**
     * Check if a template markdown contains a section at the given title path.
     * Uses heading tree parsing for text-based matching.
     */
    function templateHasSection(template: string, path: string[], period: EnhancedDiaryPeriod): boolean {
        const roots = parseMarkdownHeadingTree(template);
        // Find the period root heading first
        const periodRoot = roots.find((node) => node.level === 1 && matchesRootHeading(normalizeHeadingTitle(node.title), period));
        if (!periodRoot) return false;
        const result = findSectionByTitlePath(periodRoot, path);
        return result.found;
    }

    /**
     * Check if template has a root heading matching the period (level 1, with alias support).
     */
    function templateHasRootHeading(template: string, period: EnhancedDiaryPeriod): boolean {
        const roots = parseMarkdownHeadingTree(template);
        for (const node of roots) {
            if (node.level === 1 && matchesRootHeading(normalizeHeadingTitle(node.title), period)) {
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

    const templateHealthChecks = $derived.by((): TemplateHealthCheck[] => {
        const template = draft.templates[activeTemplatePeriod] || "";
        const hs = draft.headingStructure;
        const plan = getEnhancedDiaryHeadingPlan(hs, activeTemplatePeriod);
        const baseHash = "#".repeat(plan.baseLevel);
        const subHash = "#".repeat(plan.subLevel);

        const checks: TemplateHealthCheck[] = [
            makeCheck(
                "completion-marker",
                "完成标记变量",
                "用于判断复盘是否完成，建议保留 {{完成标记}}。",
                hasText(template, "{{完成标记}}")
            ),
        ];

        if (activeTemplatePeriod === "day") {
            checks.push(
                makeCheck("day-root", "今日日记标题", `用于定位日记根结构。建议层级 ${baseHash === "##" ? "#" : "#"} 今日日记。文档名承担日期，正文根标题只区分周期类型。`, templateHasRootHeading(template, "day"))
            );
            checks.push(
                makeCheck("task-mgmt", "任务管理区", `任务相关区块的父级容器。建议层级 ${baseHash} 任务管理（层级不固定，按标题文字识别）。`, templateHasSection(template, ["任务管理"], activeTemplatePeriod)),
                makeCheck("new-tasks", "新建任务区", `新建任务会写入这里。建议层级 ${subHash} 新建任务（层级不固定，按标题文字识别）。`, templateHasSection(template, ["任务管理", "新建任务"], activeTemplatePeriod)),
                makeCheck("migrated-tasks", "迁移任务区", `历史任务迁移到今天时会写入这里。建议层级 ${subHash} 迁移任务（层级不固定，按标题文字识别）。`, templateHasSection(template, ["任务管理", "迁移任务"], activeTemplatePeriod)),
                makeCheck("quick-records", "快速记录区", `快速记录会按分类写入这里。建议层级 ${baseHash} 快速记录（层级不固定，按标题文字识别）。`, templateHasSection(template, ["快速记录"], activeTemplatePeriod)),
                makeCheck("task-log", "任务动态区", `任务新增、迁移、删除等日志可沉淀在这里。建议层级 ${subHash} 任务动态（层级不固定，按标题文字识别）。`, templateHasSection(template, ["任务管理", "任务动态"], activeTemplatePeriod), "suggest"),
                makeCheck("daily-review", "今日复盘区", `日复盘和历史复盘体验依赖这里。建议层级 ${baseHash} 今日复盘（层级不固定，按标题文字识别）。`, templateHasSection(template, ["今日复盘"], activeTemplatePeriod))
            );
        } else if (activeTemplatePeriod === "week") {
            checks.push(
                makeCheck("week-title", "周复盘标题", `用于定位周复盘根结构。建议层级 # 周复盘。`, templateHasRootHeading(template, "week")),
                makeCheck("week-variable", "周次变量", "显示当前周次。", hasText(template, "{{week}}"), "suggest"),
                makeCheck("period-range", "周期范围变量", "建议显示本周起止范围。", hasText(template, "{{周期范围}}"), "suggest"),
                makeCheck("week-review", "周复盘区", `用于沉淀周复盘内容。建议层级 ${baseHash} 周复盘（层级不固定，按标题文字识别）。`, templateHasSection(template, ["周复盘"], activeTemplatePeriod)),
                makeCheck("week-summary", "本周总结区", `用于总结本周。建议层级 ${subHash} 本周总结（层级不固定，按标题文字识别）。`, templateHasSection(template, ["本周总结"], activeTemplatePeriod)),
                makeCheck("week-tasks", "任务回顾区", `用于回顾本周任务。建议层级 ${subHash} 任务回顾（层级不固定，按标题文字识别）。`, templateHasSection(template, ["任务回顾"], activeTemplatePeriod)),
                makeCheck("week-records", "记录沉淀区", `用于沉淀重要记录。建议层级 ${subHash} 记录沉淀（层级不固定，按标题文字识别）。`, templateHasSection(template, ["记录沉淀"], activeTemplatePeriod)),
                makeCheck("week-problems", "问题与风险区", `用于记录遇到的问题。建议层级 ${subHash} 问题与风险（层级不固定，按标题文字识别）。`, templateHasSection(template, ["问题与风险"], activeTemplatePeriod)),
                makeCheck("next", "下周计划区", `用于规划下周。建议层级 ${subHash} 下周计划（层级不固定，按标题文字识别）。`, templateHasSection(template, ["下周计划"], activeTemplatePeriod))
            );
        } else if (activeTemplatePeriod === "month") {
            checks.push(
                makeCheck("month-title", "月复盘标题", `用于定位月度复盘根结构。建议层级 # 月复盘。`, templateHasRootHeading(template, "month")),
                makeCheck("month-variable", "月份变量", "显示当前月份。", hasText(template, "{{month}}"), "suggest"),
                makeCheck("period-range", "周期范围变量", "建议显示本月起止范围。", hasText(template, "{{周期范围}}"), "suggest"),
                makeCheck("month-review", "月度复盘区", `用于沉淀月度复盘内容。建议层级 ${baseHash} 月度复盘（层级不固定，按标题文字识别）。`, templateHasSection(template, ["月度复盘"], activeTemplatePeriod)),
                makeCheck("month-summary", "本月总结区", `用于总结本月。建议层级 ${subHash} 本月总结（层级不固定，按标题文字识别）。`, templateHasSection(template, ["本月总结"], activeTemplatePeriod)),
                makeCheck("month-progress", "关键进展区", `用于记录关键进展。建议层级 ${subHash} 关键进展（层级不固定，按标题文字识别）。`, templateHasSection(template, ["关键进展"], activeTemplatePeriod)),
                makeCheck("month-tasks", "任务回顾区", `用于回顾本月任务。建议层级 ${subHash} 任务回顾（层级不固定，按标题文字识别）。`, templateHasSection(template, ["任务回顾"], activeTemplatePeriod)),
                makeCheck("month-problems", "问题与风险区", `用于记录遇到的问题。建议层级 ${subHash} 问题与风险（层级不固定，按标题文字识别）。`, templateHasSection(template, ["问题与风险"], activeTemplatePeriod)),
                makeCheck("next", "下月计划区", `用于规划下月。建议层级 ${subHash} 下月计划（层级不固定，按标题文字识别）。`, templateHasSection(template, ["下月计划"], activeTemplatePeriod))
            );
        } else {
            checks.push(
                makeCheck("year-title", "年复盘标题", `用于定位年度复盘根结构。建议层级 # 年复盘。`, templateHasRootHeading(template, "year")),
                makeCheck("year-variable", "年份变量", "显示当前年份。", hasText(template, "{{year}}"), "suggest"),
                makeCheck("period-range", "周期范围变量", "建议显示年度起止范围。", hasText(template, "{{周期范围}}"), "suggest"),
                makeCheck("year-review", "年度复盘区", `用于沉淀年度复盘内容。建议层级 ${baseHash} 年度复盘（层级不固定，按标题文字识别）。`, templateHasSection(template, ["年度复盘"], activeTemplatePeriod)),
                makeCheck("year-summary", "年度总结区", `用于总结年度。建议层级 ${subHash} 年度总结（层级不固定，按标题文字识别）。`, templateHasSection(template, ["年度总结"], activeTemplatePeriod)),
                makeCheck("year-results", "关键成果区", `用于记录关键成果。建议层级 ${subHash} 关键成果（层级不固定，按标题文字识别）。`, templateHasSection(template, ["关键成果"], activeTemplatePeriod)),
                makeCheck("year-changes", "重要变化区", `用于记录重要变化。建议层级 ${subHash} 重要变化（层级不固定，按标题文字识别）。`, templateHasSection(template, ["重要变化"], activeTemplatePeriod)),
                makeCheck("year-lessons", "经验教训区", `用于记录经验教训。建议层级 ${subHash} 经验教训（层级不固定，按标题文字识别）。`, templateHasSection(template, ["经验教训"], activeTemplatePeriod)),
                makeCheck("next", "明年方向区", `用于规划明年方向。建议层级 ${subHash} 明年方向（层级不固定，按标题文字识别）。`, templateHasSection(template, ["明年方向"], activeTemplatePeriod))
            );
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
        await onSave(draft);
        lastConfigSignature = JSON.stringify(draft);
    }

    function restoreTemplate(period: EnhancedDiaryPeriod): void {
        draft.templates[period] = DEFAULT_ENHANCED_DIARY_CONFIG.templates[period];
    }

    function buildPlanAwareTemplate(period: EnhancedDiaryPeriod): string {
        const hs = draft.headingStructure;
        const plan = getEnhancedDiaryHeadingPlan(hs, period);
        const baseHash = "#".repeat(plan.baseLevel);
        const subHash = "#".repeat(plan.subLevel);

        if (period === "day") {
            return `# 今日日记

{{完成标记}}

${baseHash} 任务管理

${subHash} 新建任务

${subHash} 迁移任务

${subHash} 任务动态

${baseHash} 快速记录

${baseHash} 今日复盘

${subHash} 今日总结

${subHash} 情绪状态

${subHash} 收获与问题

${subHash} 明日关注`;
        }

        if (period === "week") {
            return `# 周复盘

周期：{{周期范围}}

{{完成标记}}

${baseHash} 周复盘

${subHash} 本周总结

${subHash} 任务回顾

${subHash} 记录沉淀

${subHash} 问题与风险

${subHash} 下周计划`;
        }

        if (period === "month") {
            return `# 月复盘

周期：{{周期范围}}

{{完成标记}}

${baseHash} 月度复盘

${subHash} 本月总结

${subHash} 关键进展

${subHash} 任务回顾

${subHash} 问题与风险

${subHash} 下月计划`;
        }

        // year
        return `# 年复盘

周期：{{周期范围}}

{{完成标记}}

${baseHash} 年度复盘

${subHash} 年度总结

${subHash} 关键成果

${subHash} 重要变化

${subHash} 经验教训

${subHash} 明年方向`;
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

            <label class="input-row">
                <span>
                    <strong>任务迁移提醒天数</strong>
                    <small>未完成任务超过该天数后，在工作台提示迁移到今日日记。</small>
                </span>
                <input
                    type="number"
                    min="1"
                    max="3650"
                    step="1"
                    bind:value={draft.taskMigrationReminderDays}
                />
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
    {:else}
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
                <button type="button" onclick={onOpenToday}>打开今日日记</button>
                <button type="button" class="primary-btn" onclick={onAppendTemplate}>补充今日模板</button>
            </div>
            <p class="card-note">补充模板会追加缺失结构，不覆盖已有内容。插件按标题文字识别区块，不同层级的同名标题均可识别。</p>
        </section>
    {/if}
</section>

<style>
    .settings-page {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .settings-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
    }

    .settings-head h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: var(--b3-theme-on-background);
    }

    .settings-head p,
    .card-note {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
    }

    .setting-desc {
        margin: 2px 0 12px;
        font-size: 12px;
        line-height: 1.6;
        color: var(--b3-theme-on-surface);
        opacity: 0.66;
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
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        overflow: hidden;
        background: var(--b3-theme-surface);
    }

    .settings-tabs button,
    .template-tabs button {
        min-width: 72px;
        border: none;
        border-right: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        padding: 7px 13px;
        font-size: 12px;
        cursor: pointer;
    }

    .settings-tabs button:last-child,
    .template-tabs button:last-child {
        border-right: none;
    }

    .settings-tabs button.active,
    .template-tabs button.active {
        background: var(--b3-theme-primary);
        color: #fff;
    }

    .setting-card {
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        padding: 16px;
    }

    .setting-card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        color: var(--b3-theme-on-background);
        font-size: 14px;
        font-weight: 700;
    }

    .switch-row,
    .input-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-top: 1px solid var(--b3-border-color);
    }

    .switch-row span,
    .input-row span {
        min-width: 0;
    }

    .switch-row strong,
    .input-row strong {
        display: block;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        font-weight: 600;
    }

    .switch-row small,
    .input-row small,
    .template-toolbar {
        display: block;
        margin-top: 3px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        font-size: 11px;
        line-height: 1.45;
    }

    input[type="number"],
    select {
        width: 160px;
        height: 32px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 0 8px;
        font-size: 13px;
    }

    .window-inputs {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .window-inputs input[type="number"] {
        width: 72px;
    }

    .window-separator {
        color: var(--b3-theme-on-surface);
        opacity: 0.4;
        font-size: 13px;
    }

    .template-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin: 12px 0 8px;
        opacity: 1;
    }

    .template-toolbar span {
        min-width: 0;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
    }

    .template-toolbar-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }

    .template-health-card {
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-background);
        padding: 12px;
        margin-bottom: 10px;
    }

    .template-health-summary {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
    }

    .template-health-summary strong {
        display: block;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }

    .template-health-summary span {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.58;
    }

    .health-score {
        min-width: 56px;
        text-align: right;
    }

    .health-score strong {
        font-size: 22px;
        line-height: 1;
        color: var(--b3-theme-primary);
        font-variant-numeric: tabular-nums;
    }

    .template-health-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 10px;
    }

    .template-health-stats span {
        border: 1px solid var(--b3-border-color);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        background: var(--b3-theme-surface);
    }

    .template-health-stats span.bad {
        color: var(--b3-theme-error, #d32f2f);
        border-color: rgba(211, 47, 47, 0.25);
        background: rgba(211, 47, 47, 0.06);
    }

    .template-health-stats span.warn {
        color: #b87300;
        border-color: rgba(230, 168, 23, 0.28);
        background: rgba(230, 168, 23, 0.08);
    }

    .template-health-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 8px;
    }

    .template-health-item {
        min-width: 0;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
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
        background: #22863a;
    }

    .template-health-item.status-missing .health-dot {
        background: var(--b3-theme-error, #d32f2f);
    }

    .template-health-item.status-suggest .health-dot {
        background: #e6a817;
    }

    .template-health-item strong {
        display: block;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .template-health-item small {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.58;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .template-health-item em {
        font-style: normal;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.62;
        white-space: nowrap;
    }

    .template-textarea {
        width: 100%;
        min-height: 320px;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 10px 12px;
        font-family: var(--b3-font-family-code, monospace);
        font-size: 12px;
        line-height: 1.55;
        resize: vertical;
    }

    .template-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        border-top: 1px solid var(--b3-border-color);
        padding-top: 12px;
    }

    button {
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 7px 12px;
        font-size: 12px;
        cursor: pointer;
    }

    button:hover:not(:disabled) {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .primary-btn {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: #fff;
    }

    .primary-btn:hover:not(:disabled) {
        color: #fff;
        opacity: 0.88;
    }

    button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }

    .inline-error {
        border-top: 1px solid var(--b3-border-color);
        padding: 8px 0 2px;
        color: var(--b3-theme-error, #d32f2f);
        font-size: 12px;
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
        input[type="number"],
        select {
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
</style>
