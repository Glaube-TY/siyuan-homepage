import { sql, lsNotebooks } from "@/api";

export interface StatsData {
    startDate: string;
    totalNotes: number;
    notebooksCount: number;
    notesCount: number;
}

export async function loadStatsData(): Promise<StatsData> {
    try {
        // 获取笔记本列表
        const notebooksResponse = await lsNotebooks();

        const notesResponse = await sql("SELECT COUNT(*) AS totalDocuments FROM blocks WHERE type = 'd' LIMIT 9999999999999;");

        const totalNotesResponse = await sql("SELECT COUNT(*) AS totalDocuments FROM blocks WHERE type != 'd' LIMIT 9999999999999;");

        const startDateResult = await sql("SELECT created AS startDate FROM blocks WHERE type = 'd' ORDER BY created ASC LIMIT 1;");

        // TODO: 这里可以替换为实际调用思源 API 获取其他统计数据

        return {
            startDate: formatSiYuanTime(startDateResult[0]?.startDate || "未知"),
            totalNotes: totalNotesResponse[0]?.totalDocuments || 0,
            notebooksCount: notebooksResponse.notebooks.length,
            notesCount: notesResponse[0]?.totalDocuments || 0,
        };
    } catch (error) {
        console.error("Failed to load stats data:", error);
        // 如果出错返回默认值或其他处理方式
        return {
            startDate: "未知",
            totalNotes: 0,
            notebooksCount: 0,
            notesCount: 0,
        };
    }

    function formatSiYuanTime(timestamp: string): string {
        if (!timestamp || timestamp === "未知") return "未知";

        const year = timestamp.substring(0, 4);
        const month = timestamp.substring(4, 6);
        const day = timestamp.substring(6, 8);

        return `${year}年${month}月${day}日`;
    }
}