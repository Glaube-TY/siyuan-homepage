import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";
import {
    rebuildTaskIndexFromGlobalSql,
    rebuildHeatmapDailyIndexFromGlobalSql,
    refreshFavoritesIndex,
    refreshReviewIndex,
    refreshTaskIndexFromRecentDocuments,
    refreshHeatmapIndexFromRecentDocuments,
} from "@/components/tools/siyuanComponentDataApi";
import {
    rebuildStatIndexFromGlobalSql,
    refreshStatIndexFromRecentDocuments,
} from "@/components/tools/statisticalAPI";
import { loadEnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryConfig";
import { rebuildEnhancedDiaryIndex, refreshEnhancedDiaryIndex } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryIndex";
import { rebuildEnhancedDiaryProjectIndex, refreshEnhancedDiaryProjectIndex, readEnhancedDiaryProjectIndexStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectIndex";
import { rebuildEnhancedDiaryProjectRecordIndex, refreshEnhancedDiaryProjectRecordIndex } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectRecordIndex";
import type { EnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";

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

type ProjectIndexesResult = Pick<RebuildAllResult, "enhancedDiaryProject" | "enhancedDiaryProjectRecord">;

function projectRecordStageSkipped(): ComponentMigrationStatus {
    return { lastStatus: "idle", lastMessage: "项目记录阶段未执行：项目结构索引未完整可用，已保留历史关联。" };
}

async function maintainProjectIndexes(config: EnhancedDiaryConfig, refresh = false): Promise<ProjectIndexesResult> {
    let project: ComponentMigrationStatus;
    try {
        project = await (refresh ? refreshEnhancedDiaryProjectIndex : rebuildEnhancedDiaryProjectIndex)(config.projectStorage);
        if (project.lastStatus !== "success") return { enhancedDiaryProject: project, enhancedDiaryProjectRecord: projectRecordStageSkipped() };
        // A completed operation may still have reached its indexing limit. Read back the actual payload.
        await readEnhancedDiaryProjectIndexStrict(config.projectStorage);
    } catch (error) {
        return { enhancedDiaryProject: { lastStatus: "error", lastRunAt: new Date().toISOString(),
            lastMessage: error instanceof Error ? error.message : "项目结构索引读取或重建失败。" }, enhancedDiaryProjectRecord: projectRecordStageSkipped() };
    }
    try {
        const records = await (refresh ? refreshEnhancedDiaryProjectRecordIndex : rebuildEnhancedDiaryProjectRecordIndex)(config);
        return { enhancedDiaryProject: project, enhancedDiaryProjectRecord: records };
    } catch (error) {
        return { enhancedDiaryProject: project, enhancedDiaryProjectRecord: { lastStatus: "error", lastRunAt: new Date().toISOString(),
            lastMessage: error instanceof Error ? error.message : "项目记录索引重建失败，已保留历史关联。" } };
    }
}

export function rebuildEnhancedDiaryProjectIndexes(config: EnhancedDiaryConfig): Promise<ProjectIndexesResult> {
    return maintainProjectIndexes(config);
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
            fn: () => refreshFavoritesIndex(plugin),
        },
        {
            key: "review",
            fn: () => refreshReviewIndex(plugin),
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
            fn: async () => {
                const projectResults = await rebuildEnhancedDiaryProjectIndexes(await loadEnhancedDiaryConfig(plugin));
                results.enhancedDiaryProjectRecord = projectResults.enhancedDiaryProjectRecord;
                return projectResults.enhancedDiaryProject;
            },
        },
    ];

    for (const task of tasks) {
        try {
            results[task.key] = await task.fn();
        } catch (error) {
            if (task.key === "enhancedDiaryProject") results.enhancedDiaryProjectRecord = projectRecordStageSkipped();
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
            fn: async () => {
                const projectResults = await maintainProjectIndexes(await loadEnhancedDiaryConfig(plugin), true);
                results.enhancedDiaryProjectRecord = projectResults.enhancedDiaryProjectRecord;
                return projectResults.enhancedDiaryProject;
            },
        },
    ];

    for (const task of tasks) {
        try {
            results[task.key] = await task.fn();
        } catch (error) {
            if (task.key === "enhancedDiaryProject") results.enhancedDiaryProjectRecord = projectRecordStageSkipped();
            results[task.key] = {
                lastRunAt: new Date().toISOString(),
                lastStatus: "error",
                lastMessage: error instanceof Error ? error.message : `刷新 ${task.key} 索引时发生未知错误`,
            };
        }
    }

    return results as RefreshAllResult;
}
