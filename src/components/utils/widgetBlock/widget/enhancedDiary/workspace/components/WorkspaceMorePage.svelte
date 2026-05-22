<script lang="ts">
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
</script>

<section class="more-page">
    <div class="more-header">
        <h2>更多工具</h2>
        <p class="more-subtitle">完整日历视图和通知中心。</p>
    </div>

    <div class="more-cards">
        <button type="button" class="more-card" onclick={onGoCalendar}>
            <span class="more-card-icon">📅</span>
            <div class="more-card-content">
                <strong class="more-card-title">日历详情</strong>
                <span class="more-card-desc">查看完整月历、日期详情、日记状态和任务记录分布。</span>
            </div>
            <span class="more-card-arrow">→</span>
        </button>

        <button type="button" class="more-card" onclick={onGoNotifications}>
            <span class="more-card-icon">🔔</span>
            <div class="more-card-content">
                <strong class="more-card-title">通知中心</strong>
                <span class="more-card-desc">集中处理逾期任务、迁移建议、模板缺失和复盘提醒。</span>
                {#if notificationCount > 0}
                    <em class="more-card-badge">{notificationCount > 99 ? "99+" : notificationCount}</em>
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
            <div class="missing-section-list">
                {#each missingSections as section}
                    <span>{section}</span>
                {/each}
            </div>
        {/if}

        <div class="diagnostic-actions">
            <button type="button" class="diagnostic-btn" onclick={onOpenToday}>打开今日日记</button>
            <button type="button" class="diagnostic-btn primary" onclick={onAppendTemplate}>补充今日模板</button>
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

    .missing-section-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .missing-section-list span {
        border: 1px solid rgba(230, 144, 10, 0.28);
        border-radius: 999px;
        background: rgba(230, 144, 10, 0.08);
        color: #b87300;
        padding: 4px 9px;
        font-size: 12px;
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
        .more-cards {
            grid-template-columns: 1fr;
        }
    }
</style>
