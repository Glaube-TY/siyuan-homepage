<script lang="ts">
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        onGoCalendar: () => void;
        onGoNotifications: () => void;
        onOpenToday: () => void | Promise<void>;
        onAppendTemplate: () => void | Promise<void>;
        notificationCount?: number;
        todayDiaryExists?: boolean;
        templateValid?: boolean;
        missingSections?: string[];
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
    }: Props = $props();

    const workspaceSections = [
        "# 今日日记",
        "## 任务管理",
        "### 新建任务",
        "### 迁移任务",
        "### 任务动态",
        "## 快速记录",
        "## 今日复盘",
    ];

    const missingSectionSet = $derived(new Set(missingSections));

    function sectionStatus(section: string): "missing" | "ok" {
        if (!todayDiaryExists) return "missing";
        return missingSectionSet.has(section) ? "missing" : "ok";
    }

    const missingCount = $derived(todayDiaryExists ? missingSections.length : workspaceSections.length);
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
                <span class="more-card-desc">查看完整月历、日期详情、日记状态和任务记录分布。</span>
            </div>
            <span class="more-card-arrow">→</span>
        </button>

        <button type="button" class="more-card" onclick={onGoNotifications}>
            <span class="more-card-icon"><WorkspaceIcon name="notifications" size={28} /></span>
            <div class="more-card-content">
                <strong class="more-card-title">通知中心</strong>
                <span class="more-card-desc">集中处理逾期任务、迁移建议、模板缺失和复盘提醒。</span>
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
                <p>检查今日日记是否具备强化日记工作台需要的标题区块。</p>
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
                今日日记模板结构完整，可以正常执行任务和记录写入。
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
                    {#each workspaceSections as section}
                        {@const status = sectionStatus(section)}
                        <div class="check-item status-{status}">
                            <span class="check-mark">{status === "ok" ? "通过" : "缺失"}</span>
                            <span class="check-label">{section}</span>
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <div class="diagnostic-actions">
            <button type="button" class="diagnostic-btn" onclick={onOpenToday}>打开今日日记</button>
            <button type="button" class="diagnostic-btn primary" onclick={onAppendTemplate}>补充今日模板</button>
        </div>
    </section>

    <section class="template-structure-card">
        <h3>推荐模板结构</h3>
        <div class="template-structure-grid">
            <div class="template-structure-item">
                <div class="template-structure-title">日记</div>
                <div class="template-structure-lines">
                    <span># 今日日记</span>
                    <span>## 任务管理</span>
                    <span class="indent">### 新建任务 / 迁移任务 / 任务动态</span>
                    <span>## 快速记录</span>
                    <span>## 今日复盘</span>
                </div>
            </div>
            <div class="template-structure-item">
                <div class="template-structure-title">周复盘</div>
                <div class="template-structure-lines">
                    <span># 本周复盘</span>
                    <span>## 周复盘</span>
                    <span class="indent">### 本周总结 / 任务回顾 / 记录沉淀</span>
                    <span class="indent">### 问题与风险 / 下周计划</span>
                </div>
            </div>
            <div class="template-structure-item">
                <div class="template-structure-title">月总结</div>
                <div class="template-structure-lines">
                    <span># 本月总结</span>
                    <span>## 月度复盘</span>
                    <span class="indent">### 本月总结 / 关键进展 / 任务回顾</span>
                    <span class="indent">### 问题与风险 / 下月计划</span>
                </div>
            </div>
            <div class="template-structure-item">
                <div class="template-structure-title">年总结</div>
                <div class="template-structure-lines">
                    <span># 年度总结</span>
                    <span>## 年度复盘</span>
                    <span class="indent">### 年度总结 / 关键成果 / 重要变化</span>
                    <span class="indent">### 经验教训 / 明年方向</span>
                </div>
            </div>
        </div>
    </section>
</section>

<style>
    .more-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .more-header h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: var(--b3-theme-on-background);
    }

    .more-subtitle {
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
    }

    .more-cards {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
    }

    .diagnostic-card {
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-surface);
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .diagnostic-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
    }

    .diagnostic-head h3 {
        margin: 0 0 4px;
        font-size: 15px;
        font-weight: 700;
        color: var(--b3-theme-on-surface);
    }

    .diagnostic-head p {
        margin: 0;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
    }

    .diagnostic-status {
        border-radius: 999px;
        padding: 3px 9px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
    }

    .diagnostic-status.ok {
        background: rgba(40, 167, 69, 0.1);
        color: #22863a;
        border: 1px solid rgba(40, 167, 69, 0.25);
    }

    .diagnostic-status.warn {
        background: rgba(230, 144, 10, 0.1);
        color: #b87300;
        border: 1px solid rgba(230, 144, 10, 0.28);
    }

    .diagnostic-empty {
        border: 1px solid var(--b3-border-color);
        border-radius: 9px;
        background: var(--b3-theme-background);
        padding: 12px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.72;
    }

    .diagnostic-empty.ok {
        border-color: rgba(40, 167, 69, 0.25);
        background: rgba(40, 167, 69, 0.06);
    }

    .diagnostic-summary {
        border: 1px solid rgba(230, 144, 10, 0.28);
        border-radius: 9px;
        background: rgba(230, 144, 10, 0.07);
        color: #9a6200;
        padding: 10px 12px;
        font-size: 12px;
        line-height: 1.5;
    }

    .diagnostic-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }

    .diagnostic-group {
        border: 1px solid var(--b3-border-color);
        border-radius: 9px;
        background: var(--b3-theme-background);
        padding: 12px;
    }

    .diagnostic-group-title {
        margin-bottom: 9px;
        font-size: 12px;
        font-weight: 700;
        color: var(--b3-theme-on-background);
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
        border-radius: 999px;
        padding: 2px 6px;
        text-align: center;
        font-size: 10px;
        font-weight: 600;
    }

    .check-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
    }

    .check-item.status-ok .check-mark {
        border: 1px solid rgba(40, 167, 69, 0.25);
        background: rgba(40, 167, 69, 0.08);
        color: #22863a;
    }

    .check-item.status-missing .check-mark {
        border: 1px solid rgba(230, 144, 10, 0.28);
        background: rgba(230, 144, 10, 0.08);
        color: #b87300;
    }

    .diagnostic-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .diagnostic-btn {
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 7px 12px;
        font-size: 12px;
        cursor: pointer;
    }

    .diagnostic-btn:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .diagnostic-btn.primary {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: #fff;
    }

    .diagnostic-btn.primary:hover {
        opacity: 0.88;
        color: #fff;
    }

    .more-card {
        display: flex;
        align-items: center;
        gap: 14px;
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-surface);
        padding: 18px 20px;
        cursor: pointer;
        text-align: left;
        transition: all 0.15s;
        position: relative;
    }

    .more-card:hover {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
        transform: translateY(-1px);
    }

    .more-card-icon {
        font-size: 28px;
        flex-shrink: 0;
    }

    .more-card-content {
        flex: 1;
        min-width: 0;
    }

    .more-card-title {
        display: block;
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        margin-bottom: 4px;
    }

    .more-card-desc {
        display: block;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        line-height: 1.4;
    }

    .more-card-badge {
        position: absolute;
        top: 10px;
        right: 36px;
        min-width: 18px;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--b3-theme-error, #d32f2f);
        color: #fff;
        font-style: normal;
        font-size: 10px;
        text-align: center;
    }

    .more-card-arrow {
        font-size: 16px;
        color: var(--b3-theme-on-surface);
        opacity: 0.3;
        flex-shrink: 0;
        transition: all 0.15s;
    }

    .more-card:hover .more-card-arrow {
        opacity: 0.7;
        transform: translateX(2px);
    }

    @media (max-width: 700px) {
        .more-cards,
        .diagnostic-grid,
        .template-structure-grid {
            grid-template-columns: 1fr;
        }
    }

    .template-structure-card {
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-surface);
        padding: 18px 20px;
    }

    .template-structure-card h3 {
        margin: 0 0 14px;
        font-size: 15px;
        font-weight: 700;
        color: var(--b3-theme-on-surface);
    }

    .template-structure-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
    }

    .template-structure-item {
        border: 1px solid var(--b3-border-color);
        border-radius: 9px;
        background: var(--b3-theme-background);
        padding: 12px;
    }

    .template-structure-title {
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 700;
        color: var(--b3-theme-on-background);
    }

    .template-structure-lines {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .template-structure-lines span {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.72;
        line-height: 1.4;
    }

    .template-structure-lines span.indent {
        padding-left: 12px;
        opacity: 0.55;
    }
</style>
