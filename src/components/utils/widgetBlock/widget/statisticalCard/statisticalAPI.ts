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
        const res = await plugin.client.sql({ stmt: "SELECT content FROM blocks LIMIT 9999999999999;" });
        statisticalCount = res.data.reduce((total: number, block: any) => {
            return total + (block.content ? block.content.length : 0);
        }, 0);
    } else if (statisticalType === "tasksCount") {
        const res = await plugin.client.sql({ stmt: "SELECT * FROM blocks WHERE subtype = 't' AND type != 'l' LIMIT 9999999999999;" });
        statisticalCount = res.data.length;
    } else if (statisticalType === "doneTasksCount") {
        const res = await plugin.client.sql({ stmt: "SELECT * FROM blocks WHERE subtype = 't' AND type != 'l' AND markdown LIKE '%[x]%' LIMIT 9999999999999;" });
        statisticalCount = res.data.length;
    } else if (statisticalType === "undoneTasksCount") {
        const res = await plugin.client.sql({ stmt: "SELECT * FROM blocks WHERE subtype = 't' AND type != 'l' AND markdown LIKE '%[ ]%' LIMIT 9999999999999;" });
        statisticalCount = res.data.length;
    } else if (statisticalType === "dailynotesCount") {
        const res = await plugin.client.sql({ stmt: "SELECT * FROM blocks WHERE type = 'd' AND ial LIKE '%custom-dailynote-%' LIMIT 9999999999999;" });
        statisticalCount = res.data.length;
    } else if (statisticalType === "tagsCount") {
        const res = await fetchSyncPost("/api/tag/getTag", { sort: 1, ignoreMaxListHint: true, app: "statisticalCard" });
        statisticalCount = res.data.length;
    } else if (statisticalType === "codeBlocksCount") {
        const res = await plugin.client.sql({ stmt: "SELECT * FROM blocks WHERE type = 'c' LIMIT 9999999999999;" });
        statisticalCount = res.data.length;
    } else if (statisticalType === "mathBlocksCount") {
        const res = await plugin.client.sql({ stmt: "SELECT * FROM blocks WHERE type = 'm' LIMIT 9999999999999;" });
        statisticalCount = res.data.length;
    } else if (statisticalType === "citationCount") {
        const res = await plugin.client.sql({ stmt: "SELECT * FROM blocks WHERE type = 'b' LIMIT 9999999999999;" });
        statisticalCount = res.data.length;
    }

    return statisticalCount;
}