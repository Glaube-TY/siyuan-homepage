<script lang="ts">
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";
    import {
        rebuildAllHomepageIndexes,
        refreshAllHomepageIndexes,
        type RebuildAllResult,
        type RefreshAllResult,
    } from "@/components/tools/homepageIndexManagement";
    import {
        migrateFavoritesIndexFromGlobalSql,
        rebuildTaskIndexFromGlobalSql,
        rebuildHeatmapDailyIndexFromGlobalSql,
        refreshFavoritesIndex,
        refreshReviewIndex,
        refreshTaskIndexFromRecentDocuments,
        refreshHeatmapIndexFromRecentDocuments,
    } from "@/components/tools/siyuanComponentDataApi";
    import { migrateReviewIndexFromGlobalSql } from "@/components/utils/widgetBlock/widget/reviewDocs/reviewDocs";
    import {
        rebuildStatIndexFromGlobalSql,
        refreshStatIndexFromRecentDocuments,
    } from "@/components/tools/statisticalAPI";
    import { loadEnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryConfig";
    import { rebuildEnhancedDiaryIndex, refreshEnhancedDiaryIndex } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryIndex";

    type StatusChangeHandler = (status: ComponentMigrationStatus) => void | Promise<void>;

    interface Props {
        plugin: any;
        favoritesMigrationStatus?: ComponentMigrationStatus;
        reviewDocsMigrationStatus?: ComponentMigrationStatus;
        taskIndexMigrationStatus?: ComponentMigrationStatus;
        heatmapIndexStatus?: ComponentMigrationStatus;
        statIndexStatus?: ComponentMigrationStatus;
        enhancedDiaryIndexStatus?: ComponentMigrationStatus;
        onFavoritesStatusChange?: StatusChangeHandler;
        onReviewDocsStatusChange?: StatusChangeHandler;
        onTaskIndexStatusChange?: StatusChangeHandler;
        onHeatmapIndexStatusChange?: StatusChangeHandler;
        onStatIndexStatusChange?: StatusChangeHandler;
        onEnhancedDiaryIndexStatusChange?: StatusChangeHandler;
    }

    let {
        plugin,
        favoritesMigrationStatus = $bindable<ComponentMigrationStatus>({ lastStatus: "idle" }),
        reviewDocsMigrationStatus = $bindable<ComponentMigrationStatus>({ lastStatus: "idle" }),
        taskIndexMigrationStatus = $bindable<ComponentMigrationStatus>({ lastStatus: "idle" }),
        heatmapIndexStatus = $bindable<ComponentMigrationStatus>({ lastStatus: "idle" }),
        statIndexStatus = $bindable<ComponentMigrationStatus>({ lastStatus: "idle" }),
        enhancedDiaryIndexStatus = $bindable<ComponentMigrationStatus>({ lastStatus: "idle" }),
        onFavoritesStatusChange = undefined,
        onReviewDocsStatusChange = undefined,
        onTaskIndexStatusChange = undefined,
        onHeatmapIndexStatusChange = undefined,
        onStatIndexStatusChange = undefined,
        onEnhancedDiaryIndexStatusChange = undefined,
    }: Props = $props();

    let isRebuildingAll = $state(false);
    let isRefreshingAll = $state(false);

    let isFavoritesMigrating = $state(false);
    let isReviewMigrating = $state(false);
    let isTaskRebuilding = $state(false);
    let isTaskRefreshing = $state(false);
    let isHeatmapRebuilding = $state(false);
    let isHeatmapRefreshing = $state(false);
    let isStatRebuilding = $state(false);
    let isStatRefreshing = $state(false);
    let isEnhancedDiaryRebuilding = $state(false);
    let isEnhancedDiaryRefreshing = $state(false);

    let heatmapRebuildMonths = $state(12);

    function clampHeatmapMonths(value: number): number {
        return Math.max(1, Math.min(60, Math.floor(Number(value) || 12)));
    }

    function formatStatus(status: ComponentMigrationStatus): string {
        if (!status.lastRunAt && (!status.lastStatus || status.lastStatus === "idle")) {
            return "尚未执行";
        }
        const time = status.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : "未知时间";
        const counts: string[] = [];
        if (typeof status.migratedCount === "number") counts.push(`写入 ${status.migratedCount}`);
        if (typeof status.refreshedCount === "number") counts.push(`刷新 ${status.refreshedCount}`);
        if (typeof status.removedCount === "number" && status.removedCount > 0) counts.push(`清理 ${status.removedCount}`);
        if (typeof status.skippedCount === "number" && status.skippedCount > 0) counts.push(`跳过 ${status.skippedCount}`);
        const countText = counts.length > 0 ? `（${counts.join("，")}）` : "";
        return `${status.lastStatus === "success" ? "成功" : status.lastStatus === "error" ? "失败" : "未执行"} · ${time}${countText}`;
    }

    async function handleRebuildAll() {
        if (!plugin || isRebuildingAll) return;
        isRebuildingAll = true;
        try {
            const results = await rebuildAllHomepageIndexes(plugin, { heatmapMonths: heatmapRebuildMonths });
            await applyResults(results);
        } finally {
            isRebuildingAll = false;
        }
    }

    async function handleRefreshAll() {
        if (!plugin || isRefreshingAll) return;
        isRefreshingAll = true;
        try {
            const results = await refreshAllHomepageIndexes(plugin);
            await applyRefreshResults(results);
        } finally {
            isRefreshingAll = false;
        }
    }

    async function applyResults(results: RebuildAllResult) {
        favoritesMigrationStatus = results.favorites;
        await onFavoritesStatusChange?.(results.favorites);
        reviewDocsMigrationStatus = results.review;
        await onReviewDocsStatusChange?.(results.review);
        taskIndexMigrationStatus = results.task;
        await onTaskIndexStatusChange?.(results.task);
        heatmapIndexStatus = results.heatmap;
        await onHeatmapIndexStatusChange?.(results.heatmap);
        statIndexStatus = results.stat;
        await onStatIndexStatusChange?.(results.stat);
        enhancedDiaryIndexStatus = results.enhancedDiary;
        await onEnhancedDiaryIndexStatusChange?.(results.enhancedDiary);
    }

    async function applyRefreshResults(results: RefreshAllResult) {
        favoritesMigrationStatus = results.favorites;
        await onFavoritesStatusChange?.(results.favorites);
        reviewDocsMigrationStatus = results.review;
        await onReviewDocsStatusChange?.(results.review);
        taskIndexMigrationStatus = results.task;
        await onTaskIndexStatusChange?.(results.task);
        heatmapIndexStatus = results.heatmap;
        await onHeatmapIndexStatusChange?.(results.heatmap);
        statIndexStatus = results.stat;
        await onStatIndexStatusChange?.(results.stat);
        enhancedDiaryIndexStatus = results.enhancedDiary;
        await onEnhancedDiaryIndexStatusChange?.(results.enhancedDiary);
    }

    async function handleFavoritesMigrate() {
        if (!plugin || isFavoritesMigrating) return;
        isFavoritesMigrating = true;
        try {
            const status = await migrateFavoritesIndexFromGlobalSql(plugin);
            favoritesMigrationStatus = status;
            await onFavoritesStatusChange?.(status);
        } finally {
            isFavoritesMigrating = false;
        }
    }

    async function handleReviewMigrate() {
        if (!plugin || isReviewMigrating) return;
        isReviewMigrating = true;
        try {
            const status = await migrateReviewIndexFromGlobalSql(plugin);
            reviewDocsMigrationStatus = status;
            await onReviewDocsStatusChange?.(status);
        } finally {
            isReviewMigrating = false;
        }
    }

    async function handleTaskRebuild() {
        if (!plugin || isTaskRebuilding) return;
        isTaskRebuilding = true;
        try {
            const status = await rebuildTaskIndexFromGlobalSql(plugin);
            taskIndexMigrationStatus = status;
            await onTaskIndexStatusChange?.(status);
        } finally {
            isTaskRebuilding = false;
        }
    }

    async function handleTaskRefresh() {
        if (!plugin || isTaskRefreshing) return;
        isTaskRefreshing = true;
        try {
            const status = await refreshTaskIndexFromRecentDocuments(plugin, { force: true });
            taskIndexMigrationStatus = status;
            await onTaskIndexStatusChange?.(status);
        } finally {
            isTaskRefreshing = false;
        }
    }

    async function handleHeatmapRebuild() {
        if (!plugin || isHeatmapRebuilding) return;
        isHeatmapRebuilding = true;
        try {
            const clamped = clampHeatmapMonths(heatmapRebuildMonths);
            const now = new Date();
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            const start = new Date(now);
            start.setMonth(start.getMonth() - clamped + 1, 1);
            const status = await rebuildHeatmapDailyIndexFromGlobalSql(
                plugin,
                start.toISOString().split("T")[0],
                end.toISOString().split("T")[0],
            );
            heatmapIndexStatus = status;
            await onHeatmapIndexStatusChange?.(status);
        } finally {
            isHeatmapRebuilding = false;
        }
    }

    async function handleHeatmapRefresh() {
        if (!plugin || isHeatmapRefreshing) return;
        isHeatmapRefreshing = true;
        try {
            const status = await refreshHeatmapIndexFromRecentDocuments(plugin, { force: true });
            heatmapIndexStatus = status;
            await onHeatmapIndexStatusChange?.(status);
        } finally {
            isHeatmapRefreshing = false;
        }
    }

    async function handleStatRebuild() {
        if (!plugin || isStatRebuilding) return;
        isStatRebuilding = true;
        try {
            const status = await rebuildStatIndexFromGlobalSql(plugin);
            statIndexStatus = status;
            await onStatIndexStatusChange?.(status);
        } finally {
            isStatRebuilding = false;
        }
    }

    async function handleStatRefresh() {
        if (!plugin || isStatRefreshing) return;
        isStatRefreshing = true;
        try {
            const status = await refreshStatIndexFromRecentDocuments(plugin, { force: true });
            statIndexStatus = status;
            await onStatIndexStatusChange?.(status);
        } finally {
            isStatRefreshing = false;
        }
    }

    async function handleEnhancedDiaryRebuild() {
        if (!plugin || isEnhancedDiaryRebuilding) return;
        isEnhancedDiaryRebuilding = true;
        try {
            const config = await loadEnhancedDiaryConfig(plugin);
            const status = await rebuildEnhancedDiaryIndex(config.dailyNotebookId || "");
            enhancedDiaryIndexStatus = status;
            await onEnhancedDiaryIndexStatusChange?.(status);
        } finally {
            isEnhancedDiaryRebuilding = false;
        }
    }

    async function handleEnhancedDiaryRefresh() {
        if (!plugin || isEnhancedDiaryRefreshing) return;
        isEnhancedDiaryRefreshing = true;
        try {
            const config = await loadEnhancedDiaryConfig(plugin);
            const status = await refreshEnhancedDiaryIndex(config.dailyNotebookId || "", { force: true });
            enhancedDiaryIndexStatus = status;
            await onEnhancedDiaryIndexStatusChange?.(status);
        } finally {
            isEnhancedDiaryRefreshing = false;
        }
    }
</script>

<SettingSection title="检索总操作">
    <SettingRow
        title="一键重建所有检索"
        description="对所有组件索引执行全量重建。重建会执行用户可感知的索引建设 SQL，只在你点击时执行，用于建立或重建本地索引。"
    >
        <button
            type="button"
            class="index-action-btn"
            onclick={handleRebuildAll}
            disabled={!plugin || isRebuildingAll}
        >
            {isRebuildingAll ? "重建中..." : "一键重建所有检索"}
        </button>
    </SettingRow>
    <SettingRow
        title="一键刷新所有检索"
        description="基于最近文档快照，只更新变动文档，不做全库扫描。刷新只做本地索引校验和最近文档增量。"
    >
        <button
            type="button"
            class="index-action-btn"
            onclick={handleRefreshAll}
            disabled={!plugin || isRefreshingAll}
        >
            {isRefreshingAll ? "刷新中..." : "一键刷新所有检索"}
        </button>
    </SettingRow>
</SettingSection>

<SettingSection title="收藏文档索引">
    <SettingRow
        title="迁移旧收藏属性到索引"
        description="扫描使用旧版属性的文档，将其迁移到本地收藏索引。只在你点击时执行，用于建立或重建本地索引。"
    >
        <button
            type="button"
            class="index-action-btn"
            onclick={handleFavoritesMigrate}
            disabled={!plugin || isFavoritesMigrating}
        >
            {isFavoritesMigrating ? "迁移中..." : "迁移旧收藏属性"}
        </button>
    </SettingRow>
    <SettingRow title="最近状态">
        <span class="index-status-text">{formatStatus(favoritesMigrationStatus)}</span>
    </SettingRow>
    {#if favoritesMigrationStatus.lastMessage}
        <SettingRow title="最近消息">
            <span class="index-status-text">{favoritesMigrationStatus.lastMessage}</span>
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="复习文档索引">
    <SettingRow
        title="迁移旧复习属性到索引"
        description="扫描使用旧版属性的文档，将其迁移到本地复习索引。只在你点击时执行，用于建立或重建本地索引。"
    >
        <button
            type="button"
            class="index-action-btn"
            onclick={handleReviewMigrate}
            disabled={!plugin || isReviewMigrating}
        >
            {isReviewMigrating ? "迁移中..." : "迁移旧复习属性"}
        </button>
    </SettingRow>
    <SettingRow title="最近状态">
        <span class="index-status-text">{formatStatus(reviewDocsMigrationStatus)}</span>
    </SettingRow>
    {#if reviewDocsMigrationStatus.lastMessage}
        <SettingRow title="最近消息">
            <span class="index-status-text">{reviewDocsMigrationStatus.lastMessage}</span>
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="任务索引">
    <SettingRow
        title="刷新最近文档增量索引"
        description="基于最近文档快照，只对变动文档按 root_id 精确刷新任务索引，不做全库扫描。"
    >
        <button
            type="button"
            class="index-action-btn"
            onclick={handleTaskRefresh}
            disabled={!plugin || isTaskRefreshing}
        >
            {isTaskRefreshing ? "刷新中..." : "刷新任务增量索引"}
        </button>
    </SettingRow>
    <SettingRow
        title="重建任务索引"
        description="扫描任务块，重建本地任务索引。只在你点击时执行，用于建立或重建本地索引。"
    >
        <button
            type="button"
            class="index-action-btn"
            onclick={handleTaskRebuild}
            disabled={!plugin || isTaskRebuilding}
        >
            {isTaskRebuilding ? "重建中..." : "重建任务索引"}
        </button>
    </SettingRow>
    <SettingRow title="最近状态">
        <span class="index-status-text">{formatStatus(taskIndexMigrationStatus)}</span>
    </SettingRow>
    {#if taskIndexMigrationStatus.lastMessage}
        <SettingRow title="最近消息">
            <span class="index-status-text">{taskIndexMigrationStatus.lastMessage}</span>
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="热力图索引">
    <SettingRow title="重建范围（月）" description="设置热力图重建的月份范围，默认 12 个月（1-60）">
        <input
            type="number"
            class="control-xs"
            min="1"
            max="60"
            bind:value={heatmapRebuildMonths}
        />
    </SettingRow>
    <SettingRow
        title="刷新最近文档增量索引"
        description="基于最近文档快照，只对变动文档按 root_id 精确刷新热力图贡献，不做全库扫描。"
    >
        <button
            type="button"
            class="index-action-btn"
            onclick={handleHeatmapRefresh}
            disabled={!plugin || isHeatmapRefreshing}
        >
            {isHeatmapRefreshing ? "刷新中..." : "刷新热力图增量索引"}
        </button>
    </SettingRow>
    <SettingRow
        title="重建热力图索引"
        description="按当前范围重建本地热力图索引。只在你点击时执行，用于建立或重建本地索引。"
    >
        <button
            type="button"
            class="index-action-btn"
            onclick={handleHeatmapRebuild}
            disabled={!plugin || isHeatmapRebuilding}
        >
            {isHeatmapRebuilding ? "重建中..." : "重建热力图索引"}
        </button>
    </SettingRow>
    <SettingRow title="最近状态">
        <span class="index-status-text">{formatStatus(heatmapIndexStatus)}</span>
    </SettingRow>
    {#if heatmapIndexStatus.lastMessage}
        <SettingRow title="最近消息">
            <span class="index-status-text">{heatmapIndexStatus.lastMessage}</span>
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="统计卡片索引">
    <SettingRow
        title="刷新最近文档增量索引"
        description="基于最近文档快照，只对变动文档按 root_id 精确刷新统计贡献，不做全库扫描。"
    >
        <button
            type="button"
            class="index-action-btn"
            onclick={handleStatRefresh}
            disabled={!plugin || isStatRefreshing}
        >
            {isStatRefreshing ? "刷新中..." : "刷新统计增量索引"}
        </button>
    </SettingRow>
    <SettingRow
        title="重建统计索引"
        description="手动扫描 blocks 表必要字段，重建本地统计索引。只在你点击时执行，用于建立或重建本地索引。"
    >
        <button
            type="button"
            class="index-action-btn"
            onclick={handleStatRebuild}
            disabled={!plugin || isStatRebuilding}
        >
            {isStatRebuilding ? "重建中..." : "重建统计索引"}
        </button>
    </SettingRow>
    <SettingRow title="最近状态">
        <span class="index-status-text">{formatStatus(statIndexStatus)}</span>
    </SettingRow>
    {#if statIndexStatus.lastMessage}
        <SettingRow title="最近消息">
            <span class="index-status-text">{statIndexStatus.lastMessage}</span>
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="强化日记索引">
    <SettingRow
        title="刷新强化日记增量索引"
        description="只使用最近文档增量；仅处理当前配置日记笔记本中的变动文档。"
    >
        <button type="button" class="index-action-btn" onclick={handleEnhancedDiaryRefresh} disabled={!plugin || isEnhancedDiaryRefreshing}>
            {isEnhancedDiaryRefreshing ? "刷新中..." : "刷新强化日记增量索引"}
        </button>
    </SettingRow>
    <SettingRow
        title="重建强化日记索引"
        description="只遍历当前配置的日记笔记本文件树，并对已取得的文档 ID 精确识别；不扫描全库 blocks。"
    >
        <button type="button" class="index-action-btn" onclick={handleEnhancedDiaryRebuild} disabled={!plugin || isEnhancedDiaryRebuilding}>
            {isEnhancedDiaryRebuilding ? "重建中..." : "重建强化日记索引"}
        </button>
    </SettingRow>
    <SettingRow title="最近状态">
        <span class="index-status-text">{formatStatus(enhancedDiaryIndexStatus)}</span>
    </SettingRow>
    {#if enhancedDiaryIndexStatus.lastMessage}
        <SettingRow title="最近消息">
            <span class="index-status-text">{enhancedDiaryIndexStatus.lastMessage}</span>
        </SettingRow>
    {/if}
</SettingSection>

<style lang="scss">
    .index-action-btn {
        border: 1px solid var(--b3-border-color, rgba(127, 127, 127, 0.24));
        background: var(--b3-theme-background, #fff);
        color: var(--b3-theme-on-background, #1f2937);
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
    }

    .index-action-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    .index-status-text {
        font-size: 12px;
        color: var(--b3-theme-on-surface, #5f6368);
    }
</style>
