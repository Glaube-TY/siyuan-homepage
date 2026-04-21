import { lsNotebooks, sql, getTag } from "@/api";

export async function getStatisticalData(statisticalType: string, plugin: any) {
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
        const res = await sql("SELECT COUNT(*) AS doneTasks FROM blocks WHERE subtype = 't' AND type != 'l' AND markdown LIKE '%[x]%'");
        statisticalCount = res[0]?.doneTasks || 0;
    } else if (statisticalType === "undoneTasksCount") {
        const res = await sql("SELECT COUNT(*) AS undoneTasks FROM blocks WHERE subtype = 't' AND type != 'l' AND markdown LIKE '%[ ]%'");
        statisticalCount = res[0]?.undoneTasks || 0;
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
