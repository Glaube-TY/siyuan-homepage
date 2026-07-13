import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";
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
import { rebuildEnhancedDiaryProjectIndex, refreshEnhancedDiaryProjectIndex } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectIndex";
import { rebuildEnhancedDiaryProjectRecordIndex, refreshEnhancedDiaryProjectRecordIndex } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectRecordIndex";

export interface RebuildAllResult {
    favorites: ComponentMigrationStatus;
    review: ComponentMigrationStatus;
    task: ComponentMigrationStatus;
    heatmap: ComponentMigrationStatus;
    stat: ComponentMigrationStatus;
    enhancedDiary: ComponentMigrationStatus;
    enhancedDiaryProject: ComponentMigrationStatus;
    enhancedDiaryProjectRecord: ComponentMigrationStatus;
}

export interface RebuildAllOptions {
    heatmapMonths?: number;
}

function getDefaultHeatmapRange(months: number): [string, string] {
    const clamped = Math.max(1, Math.min(60, Math.floor(Number(months) || 12)));
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const start = new Date(now);
    start.setMonth(start.getMonth() - clamped + 1, 1);
    return [
        start.toISOString().split("T")[0],
        end.toISOString().split("T")[0],
    ];
}

export async function rebuildAllHomepageIndexes(
    plugin: any,
    options?: RebuildAllOptions,
): Promise<RebuildAllResult> {
    const heatmapMonths = options?.heatmapMonths ?? 12;
    const [heatmapStart, heatmapEnd] = getDefaultHeatmapRange(heatmapMonths);

    const results: Partial<RebuildAllResult> = {};

    const tasks: Array<{ key: keyof RebuildAllResult; fn: () => Promise<ComponentMigrationStatus> }> = [
        {
            key: "favorites",
            fn: () => migrateFavoritesIndexFromGlobalSql(plugin),
        },
        {
            key: "review",
            fn: () => migrateReviewIndexFromGlobalSql(plugin),
        },
        {
            key: "task",
            fn: () => rebuildTaskIndexFromGlobalSql(plugin),
        },
        {
            key: "heatmap",
            fn: () => rebuildHeatmapDailyIndexFromGlobalSql(plugin, heatmapStart, heatmapEnd),
        },
        {
            key: "stat",
            fn: () => rebuildStatIndexFromGlobalSql(plugin),
        },
        {
            key: "enhancedDiary",
            fn: async () => rebuildEnhancedDiaryIndex((await loadEnhancedDiaryConfig(plugin)).dailyNotebookId || ""),
        },
        {
            key: "enhancedDiaryProject",
            fn: async () => rebuildEnhancedDiaryProjectIndex((await loadEnhancedDiaryConfig(plugin)).projectStorage),
        },
        {
            key: "enhancedDiaryProjectRecord",
            fn: async () => rebuildEnhancedDiaryProjectRecordIndex(await loadEnhancedDiaryConfig(plugin)),
        },
    ];

    for (const task of tasks) {
        try {
            results[task.key] = await task.fn();
        } catch (error) {
            results[task.key] = {
                lastRunAt: new Date().toISOString(),
                lastStatus: "error",
                lastMessage: error instanceof Error ? error.message : `重建 ${task.key} 索引时发生未知错误`,
            };
        }
    }

    return results as RebuildAllResult;
}

export interface RefreshAllResult {
    favorites: ComponentMigrationStatus;
    review: ComponentMigrationStatus;
    task: ComponentMigrationStatus;
    heatmap: ComponentMigrationStatus;
    stat: ComponentMigrationStatus;
    enhancedDiary: ComponentMigrationStatus;
    enhancedDiaryProject: ComponentMigrationStatus;
    enhancedDiaryProjectRecord: ComponentMigrationStatus;
}

export async function refreshAllHomepageIndexes(
    plugin: any,
): Promise<RefreshAllResult> {
    const results: Partial<RefreshAllResult> = {};

    const tasks: Array<{ key: keyof RefreshAllResult; fn: () => Promise<ComponentMigrationStatus> }> = [
        {
            key: "favorites",
            fn: () => refreshFavoritesIndex(plugin),
        },
        {
            key: "review",
            fn: () => refreshReviewIndex(plugin),
        },
        {
            key: "task",
            fn: () => refreshTaskIndexFromRecentDocuments(plugin, { force: true }),
        },
        {
            key: "heatmap",
            fn: () => refreshHeatmapIndexFromRecentDocuments(plugin, { force: true }),
        },
        {
            key: "stat",
            fn: () => refreshStatIndexFromRecentDocuments(plugin, { force: true }),
        },
        {
            key: "enhancedDiary",
            fn: async () => refreshEnhancedDiaryIndex((await loadEnhancedDiaryConfig(plugin)).dailyNotebookId || "", { force: true }),
        },
        {
            key: "enhancedDiaryProject",
            fn: async () => refreshEnhancedDiaryProjectIndex((await loadEnhancedDiaryConfig(plugin)).projectStorage),
        },
        {
            key: "enhancedDiaryProjectRecord",
            fn: async () => refreshEnhancedDiaryProjectRecordIndex(await loadEnhancedDiaryConfig(plugin)),
        },
    ];

    for (const task of tasks) {
        try {
            results[task.key] = await task.fn();
        } catch (error) {
            results[task.key] = {
                lastRunAt: new Date().toISOString(),
                lastStatus: "error",
                lastMessage: error instanceof Error ? error.message : `刷新 ${task.key} 索引时发生未知错误`,
            };
        }
    }

    return results as RefreshAllResult;
}
