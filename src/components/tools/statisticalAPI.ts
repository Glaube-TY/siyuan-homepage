import { lsNotebooks, sql, getTag } from "@/api";
import { selectPaged } from "@/components/tools/siyuanSqlPaging";

/**
 * 拉取任务块 markdown，用于在 JS 中统计完成/未完成数量。
 * 避免使用 markdown LIKE 造成大库扫描；最多处理前 10000 条任务。
 */
async function loadTaskMarkdownRows(): Promise<{ id: string; markdown: string }[]> {
    const query = `
        SELECT id, markdown
        FROM blocks
        WHERE subtype = 't' AND type != 'l'
        ORDER BY updated DESC, id DESC
    `;
    return selectPaged(query, { pageSize: 64, maxRows: 10000 }) as Promise<{ id: string; markdown: string }[]>;
}

function getFirstTaskCheckboxState(markdown: string): "done" | "undone" | null {
    const firstLine = markdown.split("\n")[0]?.trim() ?? "";
    if (/^[-*]\s+\[[xX]\]/.test(firstLine)) return "done";
    if (/^[-*]\s+\[\s\]/.test(firstLine)) return "undone";
    return null;
}

export async function getStatisticalData(statisticalType: string, _plugin: any) {
    let statisticalCount = 0;

    if (statisticalType === "notebooksCount") {
        const res = await lsNotebooks();
        statisticalCount = res.notebooks.length;
    } else if (statisticalType === "docsCount") {
        const res = await sql("SELECT COUNT(*) AS totalDocuments FROM blocks WHERE type = 'd'");
        statisticalCount = res[0].totalDocuments;
    } else if (statisticalType === "blocksCount") {
        const res = await sql("SELECT COUNT(*) AS totalBlocks FROM blocks");
        statisticalCount = res[0].totalBlocks;
    } else if (statisticalType === "wordsCount") {
        const res = await sql("SELECT SUM(LENGTH(content)) AS totalWords FROM blocks");
        statisticalCount = res[0]?.totalWords || 0;
    } else if (statisticalType === "tasksCount") {
        const res = await sql("SELECT COUNT(*) AS totalTasks FROM blocks WHERE subtype = 't' AND type != 'l'");
        statisticalCount = res[0]?.totalTasks || 0;
    } else if (statisticalType === "doneTasksCount") {
        const rows = await loadTaskMarkdownRows();
        statisticalCount = rows.filter((row) => getFirstTaskCheckboxState(row.markdown) === "done").length;
    } else if (statisticalType === "undoneTasksCount") {
        const rows = await loadTaskMarkdownRows();
        statisticalCount = rows.filter((row) => getFirstTaskCheckboxState(row.markdown) === "undone").length;
    } else if (statisticalType === "dailynotesCount") {
        const res = await sql("SELECT COUNT(*) AS dailynotes FROM blocks WHERE type = 'd' AND ial LIKE '%custom-dailynote-%'");
        statisticalCount = res[0]?.dailynotes || 0;
    } else if (statisticalType === "tagsCount") {
        const tags = await getTag(1, true, "statisticalCard");
        statisticalCount = tags.length;
    } else if (statisticalType === "codeBlocksCount") {
        const res = await sql("SELECT COUNT(*) AS codeBlocks FROM blocks WHERE type = 'c'");
        statisticalCount = res[0]?.codeBlocks || 0;
    } else if (statisticalType === "mathBlocksCount") {
        const res = await sql("SELECT COUNT(*) AS mathBlocks FROM blocks WHERE type = 'm'");
        statisticalCount = res[0]?.mathBlocks || 0;
    } else if (statisticalType === "citationCount") {
        const res = await sql("SELECT COUNT(*) AS citations FROM blocks WHERE type = 'b'");
        statisticalCount = res[0]?.citations || 0;
    }

    return statisticalCount;
}
