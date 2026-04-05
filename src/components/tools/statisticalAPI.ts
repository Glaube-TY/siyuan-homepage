import { fetchSyncPost } from "siyuan";

export async function getStatisticalData(statisticalType: string, plugin: any) {
    let statisticalCount = 0;

    if (statisticalType === "notebooksCount") {
        const res = await plugin.client.lsNotebooks();
        statisticalCount = res.data.notebooks.length;
    } else if (statisticalType === "docsCount") {
        const res = await plugin.client.sql({ stmt: "SELECT COUNT(*) AS totalDocuments FROM blocks WHERE type = 'd'" });
        statisticalCount = res.data[0].totalDocuments;
    } else if (statisticalType === "blocksCount") {
        const res = await plugin.client.sql({ stmt: "SELECT COUNT(*) AS totalBlocks FROM blocks" });
        statisticalCount = res.data[0].totalBlocks;
    } else if (statisticalType === "wordsCount") {
        const res = await plugin.client.sql({ stmt: "SELECT SUM(LENGTH(content)) AS totalWords FROM blocks" });
        statisticalCount = res.data[0]?.totalWords || 0;
    } else if (statisticalType === "tasksCount") {
        const res = await plugin.client.sql({ stmt: "SELECT COUNT(*) AS totalTasks FROM blocks WHERE subtype = 't' AND type != 'l'" });
        statisticalCount = res.data[0]?.totalTasks || 0;
    } else if (statisticalType === "doneTasksCount") {
        const res = await plugin.client.sql({ stmt: "SELECT COUNT(*) AS doneTasks FROM blocks WHERE subtype = 't' AND type != 'l' AND markdown LIKE '%[x]%'" });
        statisticalCount = res.data[0]?.doneTasks || 0;
    } else if (statisticalType === "undoneTasksCount") {
        const res = await plugin.client.sql({ stmt: "SELECT COUNT(*) AS undoneTasks FROM blocks WHERE subtype = 't' AND type != 'l' AND markdown LIKE '%[ ]%'" });
        statisticalCount = res.data[0]?.undoneTasks || 0;
    } else if (statisticalType === "dailynotesCount") {
        const res = await plugin.client.sql({ stmt: "SELECT COUNT(*) AS dailynotes FROM blocks WHERE type = 'd' AND ial LIKE '%custom-dailynote-%'" });
        statisticalCount = res.data[0]?.dailynotes || 0;
    } else if (statisticalType === "tagsCount") {
        const res = await fetchSyncPost("/api/tag/getTag", { sort: 1, ignoreMaxListHint: true, app: "statisticalCard" });
        statisticalCount = res.data.length;
    } else if (statisticalType === "codeBlocksCount") {
        const res = await plugin.client.sql({ stmt: "SELECT COUNT(*) AS codeBlocks FROM blocks WHERE type = 'c'" });
        statisticalCount = res.data[0]?.codeBlocks || 0;
    } else if (statisticalType === "mathBlocksCount") {
        const res = await plugin.client.sql({ stmt: "SELECT COUNT(*) AS mathBlocks FROM blocks WHERE type = 'm'" });
        statisticalCount = res.data[0]?.mathBlocks || 0;
    } else if (statisticalType === "citationCount") {
        const res = await plugin.client.sql({ stmt: "SELECT COUNT(*) AS citations FROM blocks WHERE type = 'b'" });
        statisticalCount = res.data[0]?.citations || 0;
    }

    return statisticalCount;
}