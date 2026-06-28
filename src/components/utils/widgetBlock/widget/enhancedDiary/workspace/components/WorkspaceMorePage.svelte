<script lang="ts">
    import WorkspaceIcon from "./WorkspaceIcon.svelte";
    import {
        getPrimaryFieldTitle,
        isTaskReviewField,
    } from "../../enhancedDiaryTemplateFieldMapping";
    import { normalizeHeadingTitle } from "../../enhancedDiaryMarkdownSections";
    import type {
        EnhancedDiaryDayWorkspaceSectionFieldKey,
        EnhancedDiaryPeriod,
        EnhancedDiaryTemplateFieldMapping,
    } from "../../enhancedDiaryTypes";

    interface Props {
        onGoCalendar: () => void;
        onGoNotifications: () => void;
        onOpenToday: () => void | Promise<void>;
        onAppendTemplate: () => void | Promise<void>;
        notificationCount?: number;
        todayDiaryExists?: boolean;
        templateValid?: boolean;
        missingSections?: string[];
        taskManagementEnabled?: boolean;
        templateFieldMapping?: EnhancedDiaryTemplateFieldMapping;
    }

    let {
        onGoCalendar,
        onGoNotifications,
        onOpenToday,
        onAppendTemplate,
        notificationCount = 0,
        todayDiaryExists = false,
        templateValid = false,
        missingSections = [],
        taskManagementEnabled = true,
        templateFieldMapping,
    }: Props = $props();

    const dayRootTitle = $derived(
        getPrimaryFieldTitle(templateFieldMapping, "rootHeadings", "day")
    );

    interface DayStructureItem {
        key?: EnhancedDiaryDayWorkspaceSectionFieldKey;
        title: string;
        isSub?: boolean;
    }

    // 核心结构：与 validateDayWorkspaceStructure 实际检测的 day 区块保持一致
    const coreDayStructure = $derived.by((): DayStructureItem[] => {
        const items: DayStructureItem[] = [{ title: dayRootTitle }];
        if (taskManagementEnabled) {
            items.push(
                { key: "taskManagement", title: getPrimaryFieldTitle(templateFieldMapping, "dayWorkspaceSections", "taskManagement") },
                { key: "newTasks", title: getPrimaryFieldTitle(templateFieldMapping, "dayWorkspaceSections", "newTasks"), isSub: true },
                { key: "migratedTasks", title: getPrimaryFieldTitle(templateFieldMapping, "dayWorkspaceSections", "migratedTasks"), isSub: true },
                { key: "taskLog", title: getPrimaryFieldTitle(templateFieldMapping, "dayWorkspaceSections", "taskLog"), isSub: true },
            );
        }
        items.push(
            { key: "quickRecords", title: getPrimaryFieldTitle(templateFieldMapping, "dayWorkspaceSections", "quickRecords") },
            { key: "dailyReview", title: getPrimaryFieldTitle(templateFieldMapping, "dayWorkspaceSections", "dailyReview") },
        );
        return items;
    });

    // 建议区块：不纳入核心缺失计数，仅作展示参考
    const suggestedDayStructure = $derived.by((): DayStructureItem[] => {
        if (!taskManagementEnabled) return [];
        return [{ key: "projectProgress", title: getPrimaryFieldTitle(templateFieldMapping, "dayWorkspaceSections", "projectProgress") }];
    });

    const reviewPeriods: EnhancedDiaryPeriod[] = ["day", "week", "month", "year"];

    function getReviewFieldsForDisplay(period: EnhancedDiaryPeriod): string[] {
        const fields: string[] = [];
        const rootTitle = getPrimaryFieldTitle(templateFieldMapping, "reviewSections", period, "reviewRoot");
        fields.push(rootTitle);
        // Fallback to default hardcoded list when mapping unavailable.
        const defaultReviewFields: Record<EnhancedDiaryPeriod, string[]> = {
            day: ["今日总结", "情绪状态", "收获与问题", "明日关注"],
            week: ["本周总结", "任务回顾", "记录沉淀", "问题与风险", "下周计划"],
            month: ["本月总结", "关键进展", "任务回顾", "问题与风险", "下月计划"],
            year: ["年度总结", "关键成果", "重要变化", "经验教训", "明年方向"],
        };
        const mappingFields = templateFieldMapping?.reviewSections?.[period]?.fields;
        const periodFields = mappingFields?.length ? mappingFields : defaultReviewFields[period];
        for (const field of periodFields) {
            if (!taskManagementEnabled && isTaskReviewField(period, field)) continue;
            fields.push(field);
        }
        return fields;
    }

    function parseMissingSectionTitle(label: string): string {
        return normalizeHeadingTitle(label.replace(/^#+\s+/, ""));
    }

    function sectionStatus(section: string): "missing" | "ok" {
        if (!todayDiaryExists) return "missing";
        const normalizedSection = normalizeHeadingTitle(section);
        return missingSections.some((s) => parseMissingSectionTitle(s) === normalizedSection) ? "missing" : "ok";
    }

    const missingCount = $derived.by(() => {
        if (!todayDiaryExists) return coreDayStructure.length;
        return coreDayStructure.filter((item) => sectionStatus(item.title) === "missing").length;
    });
</script>

<section class="more-page">
    <div class="more-header">
        <h2>更多工具</h2>
        <p class="more-subtitle">完整日历视图和通知中心。</p>
    </div>

    <div class="more-cards">
        <button type="button" class="more-card" onclick={onGoCalendar}>
            <span class="more-card-icon"><WorkspaceIcon name="calendar" size={28} /></span>
            <div class="more-card-content">
                <strong class="more-card-title">日历详情</strong>
                <span class="more-card-desc">{taskManagementEnabled ? "查看完整月历、日期详情、日记状态和任务记录分布。" : "查看完整月历、日期详情、日记状态和记录分布。"}</span>
            </div>
            <span class="more-card-arrow">→</span>
        </button>

        <button type="button" class="more-card" onclick={onGoNotifications}>
            <span class="more-card-icon"><WorkspaceIcon name="notifications" size={28} /></span>
            <div class="more-card-content">
                <strong class="more-card-title">通知中心</strong>
                <span class="more-card-desc">{taskManagementEnabled ? "集中处理逾期任务、迁移建议、模板缺失和复盘提醒。" : "集中处理模板缺失和复盘提醒。"}</span>
                {#if notificationCount > 0}
                    <em class="more-card-badge" title="未处理通知数">{notificationCount > 99 ? "99+" : notificationCount}</em>
                {/if}
            </div>
            <span class="more-card-arrow">→</span>
        </button>
    </div>

    <section class="diagnostic-card">
        <div class="diagnostic-head">
            <div>
                <h3>模板结构检测</h3>
                <p>检查今日日记是否具备强化日记工作台需要的标题区块。按标题文字识别，推荐层级以设置页为准。</p>
            </div>
            <span class="diagnostic-status" class:ok={todayDiaryExists && templateValid} class:warn={!todayDiaryExists || !templateValid}>
                {!todayDiaryExists ? "未创建日记" : templateValid ? "结构完整" : "结构缺失"}
            </span>
        </div>

        {#if !todayDiaryExists}
            <div class="diagnostic-empty">
                今日还没有日记，创建后才能检测模板结构。
            </div>
        {:else if templateValid}
            <div class="diagnostic-empty ok">
                {taskManagementEnabled ? "今日日记模板结构完整，可以正常执行任务和记录写入。" : "今日日记模板结构完整，可以正常执行记录写入。"}
            </div>
        {:else}
            <div class="diagnostic-summary">
                检测到 {missingCount} 个缺失项，补充模板会追加缺失结构，不覆盖已有内容。
            </div>
        {/if}

        <div class="diagnostic-grid">
            <div class="diagnostic-group">
                <div class="diagnostic-group-title">核心区块</div>
                <div class="check-list">
                    {#each coreDayStructure as item}
                        {@const status = sectionStatus(item.title)}
                        <div class="check-item status-{status}">
                            <span class="check-mark">{status === "ok" ? "通过" : "缺失"}</span>
                            <span class="check-label">{item.title}</span>
                        </div>
                    {/each}
                </div>
                {#if suggestedDayStructure.length > 0}
                    <div class="diagnostic-group-title diagnostic-group-title-suggest">建议区块</div>
                    <div class="check-list">
                        {#each suggestedDayStructure as item}
                            <div class="check-item status-ok">
                                <span class="check-mark">建议</span>
                                <span class="check-label">{item.title}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>

        <div class="diagnostic-actions">
            <button type="button" class="diagnostic-btn" onclick={onOpenToday}>打开今日日记</button>
            <button type="button" class="diagnostic-btn primary" onclick={onAppendTemplate}>补充今日模板</button>
        </div>
    </section>

    <section class="template-structure-card">
        <h3>推荐模板结构</h3>
        <p class="template-structure-note">按标题文字识别，实际层级可自定义（设置页可调整起始层级）。</p>
        <div class="template-structure-grid">
            <div class="template-structure-item">
                <div class="template-structure-title">日记</div>
                <div class="template-structure-lines">
                    {#each coreDayStructure as item}
                        <span class={item.isSub ? "indent" : ""}>{item.title}</span>
                    {/each}
                    {#if suggestedDayStructure.length > 0}
                        <span class="template-structure-suggest-label">建议区块</span>
                        {#each suggestedDayStructure as item}
                            <span class={item.isSub ? "indent" : ""}>{item.title}</span>
                        {/each}
                    {/if}
                </div>
            </div>
            {#each reviewPeriods as period}
                <div class="template-structure-item">
                    <div class="template-structure-title">{getPrimaryFieldTitle(templateFieldMapping, "rootHeadings", period)}</div>
                    <div class="template-structure-lines">
                        {#each getReviewFieldsForDisplay(period) as field, i}
                            <span class={i > 0 ? "indent" : ""}>{field}</span>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    </section>
</section>

<style>
    .more-page {
        display: flex;
        flex-direction: column;
        gap: var(--wk-gap-lg);
    }

    .more-header h2 {
        margin: 0;
        font-size: var(--wk-text-lg);
        font-weight: 700;
        color: var(--wk-ink);
    }

    .more-subtitle {
        margin: 4px 0 0;
        font-size: var(--wk-text-base);
        color: var(--wk-ink-muted);
    }

    .more-cards {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--wk-gap-md);
    }

    .more-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 18px;
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-lg);
        background: var(--wk-surface);
        color: var(--wk-ink);
        cursor: pointer;
        text-align: left;
        transition: border-color var(--wk-transition-fast), box-shadow var(--wk-transition-fast);
    }

    .more-card:hover {
        border-color: var(--wk-primary);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }

    .more-card-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: var(--wk-radius-md);
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        color: var(--wk-primary);
        flex-shrink: 0;
    }

    .more-card-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .more-card-title {
        font-size: var(--wk-text-md);
        font-weight: 600;
        color: var(--wk-ink);
    }

    .more-card-desc {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .more-card-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: var(--wk-radius-pill);
        background: var(--wk-error);
        color: var(--wk-primary-contrast);
        font-size: var(--wk-text-xs);
        font-weight: 600;
        font-style: normal;
    }

    .more-card-arrow {
        font-size: var(--wk-text-lg);
        color: var(--wk-ink-faint);
    }

    .diagnostic-card {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-lg);
        background: var(--wk-surface);
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .diagnostic-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--wk-gap-sm);
    }

    .diagnostic-head h3 {
        margin: 0 0 4px;
        font-size: var(--wk-text-md);
        font-weight: 700;
        color: var(--wk-ink-secondary);
    }

    .diagnostic-head p {
        margin: 0;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .diagnostic-status {
        border-radius: var(--wk-radius-pill);
        padding: 3px 9px;
        font-size: var(--wk-text-xs);
        font-weight: 600;
        white-space: nowrap;
    }

    .diagnostic-status.ok {
        background: var(--wk-success-bg);
        color: var(--wk-success);
        border: 1px solid var(--wk-success-border);
    }

    .diagnostic-status.warn {
        background: var(--wk-warning-bg);
        color: var(--wk-warning);
        border: 1px solid var(--wk-warning-border);
    }

    .diagnostic-empty {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
        padding: 12px;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .diagnostic-empty.ok {
        border-color: var(--wk-success-border);
        background: var(--wk-success-bg);
    }

    .diagnostic-summary {
        border: 1px solid var(--wk-warning-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-warning-bg);
        color: var(--wk-warning);
        padding: 10px 12px;
        font-size: var(--wk-text-sm);
        line-height: 1.5;
    }

    .diagnostic-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }

    .diagnostic-group {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
        padding: 12px;
    }

    .diagnostic-group-title {
        margin-bottom: 9px;
        font-size: var(--wk-text-sm);
        font-weight: 700;
        color: var(--wk-ink);
    }

    .check-list {
        display: flex;
        flex-direction: column;
        gap: 7px;
    }

    .check-item {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        min-width: 0;
    }

    .check-mark {
        border-radius: var(--wk-radius-pill);
        padding: 2px 6px;
        text-align: center;
        font-size: var(--wk-text-xs);
        font-weight: 600;
    }

    .check-item.status-ok .check-mark {
        border: 1px solid var(--wk-success-border);
        background: var(--wk-success-bg);
        color: var(--wk-success);
    }

    .check-item.status-missing .check-mark {
        border: 1px solid var(--wk-warning-border);
        background: var(--wk-warning-bg);
        color: var(--wk-warning);
    }

    .check-label {
        min-width: 0;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .diagnostic-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }

    .diagnostic-btn {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        padding: 8px 14px;
        font-size: var(--wk-text-sm);
        cursor: pointer;
        transition: border-color var(--wk-transition-fast), color var(--wk-transition-fast);
    }

    .diagnostic-btn:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .diagnostic-btn.primary {
        border-color: var(--wk-primary);
        background: var(--wk-primary);
        color: var(--wk-primary-contrast);
    }

    .diagnostic-btn.primary:hover {
        opacity: 0.88;
    }

    .template-structure-card {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-lg);
        background: var(--wk-surface);
        padding: 18px 20px;
    }

    .template-structure-card h3 {
        margin: 0 0 4px;
        font-size: var(--wk-text-md);
        font-weight: 700;
        color: var(--wk-ink);
    }

    .template-structure-note {
        margin: 0 0 14px;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .template-structure-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }

    .template-structure-item {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-background);
        padding: 12px;
    }

    .template-structure-title {
        font-size: var(--wk-text-sm);
        font-weight: 700;
        color: var(--wk-ink);
        margin-bottom: 8px;
    }

    .template-structure-lines {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .template-structure-lines span {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-secondary);
    }

    .template-structure-lines span.indent {
        padding-left: 16px;
        color: var(--wk-ink-muted);
    }
</style>
