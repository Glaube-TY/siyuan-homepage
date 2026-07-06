import { lsNotebooks, getTag } from "@/api";
import {
    getHomepageGlobalSqlPolicy,
    runHomepageGlobalSqlCompatQuery,
    type ComponentDataMode,
} from "@/components/tools/siyuanComponentDataApi";

export interface StatisticalDataResult {
    value: number | null;
    status: "ok" | "disabled" | "unsupported" | "error";
    message?: string;
    mode?: ComponentDataMode;
}

interface CountRow {
    count: number;
}

interface IdMarkdownRow {
    id: string;
    markdown: string;
}

const GLOBAL_STAT_CACHE_TTL_MS = 5 * 60 * 1000;
const globalStatCache = new Map<string, { value: number; expiresAt: number }>();

const STAT_LABEL_MAP: Record<string, string> = {
    wordsCount: "字数",
    docsCount: "文档数",
    blocksCount: "块数",
    tasksCount: "任务数",
    doneTasksCount: "已完成任务",
    undoneTasksCount: "未完成任务",
    dailynotesCount: "日记数",
    citationCount: "引用数",
    codeBlocksCount: "代码块数",
    mathBlocksCount: "公式块数",
};

function getGlobalStatCacheKey(type: string): string {
    return `globalStat:${type}`;
}

function getCachedGlobalStat(type: string): number | null {
    const entry = globalStatCache.get(getGlobalStatCacheKey(type));
    if (entry && entry.expiresAt > Date.now()) {
        return entry.value;
    }
    globalStatCache.delete(getGlobalStatCacheKey(type));
    return null;
}

function setCachedGlobalStat(type: string, value: number): void {
    globalStatCache.set(getGlobalStatCacheKey(type), {
        value,
        expiresAt: Date.now() + GLOBAL_STAT_CACHE_TTL_MS,
    });
}

function disabledStat(message?: string): StatisticalDataResult {
    return {
        value: null,
        status: "disabled",
        message: message || "全库统计已停用。可在主页设置开启全库 SQL 兼容模式以恢复，但大库可能影响性能。",
    };
}

function unsupportedStat(message?: string): StatisticalDataResult {
    return {
        value: null,
        status: "unsupported",
        message: message || "当前统计项暂无官方 API 替代。",
    };
}

function errorStat(message: string): StatisticalDataResult {
    return {
        value: null,
        status: "error",
        message,
    };
}

function okStat(value: number, mode?: ComponentDataMode, message?: string): StatisticalDataResult {
    return {
        value,
        status: "ok",
        mode,
        message,
    };
}

async function ensureGlobalSqlAllowed(plugin: any): Promise<boolean> {
    const policy = await getHomepageGlobalSqlPolicy(plugin);
    return policy.allowGlobalSql;
}

async function queryGlobalStatCount(
    plugin: any,
    type: string,
    stmt: string,
): Promise<StatisticalDataResult> {
    if (!(await ensureGlobalSqlAllowed(plugin))) {
        return disabledStat();
    }
    const cached = getCachedGlobalStat(type);
    if (cached !== null) {
        return okStat(cached, "global_sql_compat", `${STAT_LABEL_MAP[type] || type}：兼容模式缓存值`);
    }
    const result = await runHomepageGlobalSqlCompatQuery<CountRow>(plugin, stmt);
    if (result.ok === false) {
        return errorStat(result.reason);
    }
    const value = Number(result.rows?.[0]?.count) || 0;
    setCachedGlobalStat(type, value);
    return okStat(value, "global_sql_compat", `${STAT_LABEL_MAP[type] || type}：全库 SQL 统计`);
}

async function queryGlobalRowsAndCount(
    plugin: any,
    type: string,
    stmt: string,
    predicate: (row: IdMarkdownRow) => boolean,
): Promise<StatisticalDataResult> {
    if (!(await ensureGlobalSqlAllowed(plugin))) {
        return disabledStat();
    }
    const cached = getCachedGlobalStat(type);
    if (cached !== null) {
        return okStat(cached, "global_sql_compat", `${STAT_LABEL_MAP[type] || type}：兼容模式缓存值`);
    }
    const result = await runHomepageGlobalSqlCompatQuery<IdMarkdownRow>(plugin, stmt);
    if (result.ok === false) {
        return errorStat(result.reason);
    }
    const value = result.rows.filter(predicate).length;
    setCachedGlobalStat(type, value);
    return okStat(value, "global_sql_compat", `${STAT_LABEL_MAP[type] || type}：全库 SQL 返回后本地过滤`);
}

function isDoneTaskMarkdown(markdown: string): boolean {
    const firstLine = String(markdown || "").split("\n")[0] || "";
    return /^[*-]\s*\[[xX]\]/.test(firstLine.trim());
}

function isUndoneTaskMarkdown(markdown: string): boolean {
    const firstLine = String(markdown || "").split("\n")[0] || "";
    return /^[*-]\s*\[\s*\]/.test(firstLine.trim());
}

function hasCitation(markdown: string): boolean {
    return String(markdown || "").includes("((");
}

export async function getStatisticalData(statisticalType: string, plugin: any): Promise<StatisticalDataResult> {
    try {
        if (statisticalType === "notebooksCount") {
            const res = await lsNotebooks();
            return okStat(res.notebooks.length, "official_api");
        }
        if (statisticalType === "tagsCount") {
            const tags = await getTag(1, true, "statisticalCard");
            return okStat(tags.length, "official_api");
        }
        if (statisticalType === "blocksCount") {
            return queryGlobalStatCount(
                plugin,
                "blocksCount",
                "SELECT COUNT(*) AS count FROM blocks",
            );
        }
        if (statisticalType === "docsCount") {
            return queryGlobalStatCount(
                plugin,
                "docsCount",
                "SELECT COUNT(*) AS count FROM blocks WHERE type = 'd'",
            );
        }
        if (statisticalType === "wordsCount") {
            return queryGlobalStatCount(
                plugin,
                "wordsCount",
                "SELECT SUM(LENGTH(content)) AS count FROM blocks",
            );
        }
        if (statisticalType === "tasksCount") {
            return queryGlobalStatCount(
                plugin,
                "tasksCount",
                "SELECT COUNT(*) AS count FROM blocks WHERE subtype = 't'",
            );
        }
        if (statisticalType === "doneTasksCount") {
            return queryGlobalRowsAndCount(
                plugin,
                "doneTasksCount",
                "SELECT id, markdown FROM blocks WHERE subtype = 't'",
                (row) => isDoneTaskMarkdown(row.markdown),
            );
        }
        if (statisticalType === "undoneTasksCount") {
            return queryGlobalRowsAndCount(
                plugin,
                "undoneTasksCount",
                "SELECT id, markdown FROM blocks WHERE subtype = 't'",
                (row) => isUndoneTaskMarkdown(row.markdown),
            );
        }
        if (statisticalType === "dailynotesCount") {
            return queryGlobalStatCount(
                plugin,
                "dailynotesCount",
                "SELECT COUNT(*) AS count FROM blocks WHERE type = 'd' AND ial LIKE '%custom-dailynote-%'",
            );
        }
        if (statisticalType === "citationCount") {
            return queryGlobalRowsAndCount(
                plugin,
                "citationCount",
                "SELECT id, markdown FROM blocks WHERE type = 'i'",
                (row) => hasCitation(row.markdown),
            );
        }
        if (statisticalType === "codeBlocksCount") {
            return queryGlobalStatCount(
                plugin,
                "codeBlocksCount",
                "SELECT COUNT(*) AS count FROM blocks WHERE type = 'c'",
            );
        }
        if (statisticalType === "mathBlocksCount") {
            return queryGlobalStatCount(
                plugin,
                "mathBlocksCount",
                "SELECT COUNT(*) AS count FROM blocks WHERE type = 'm'",
            );
        }
        return unsupportedStat(`未知统计项：${statisticalType}`);
    } catch (error) {
        return errorStat(error instanceof Error ? error.message : "统计 API 调用失败");
    }
}
