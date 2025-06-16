import { sql, lsNotebooks } from "@/api";

export interface StatsData {
    startDate: string;
    notesCount: number;
    notebooksCount: number;
    DocsCount: number;
    nowDate: string;
}

function parseDateToTimestamp(dateStr: string): number | null {
    if (!dateStr || typeof dateStr !== "string") return null;

    const normalized = dateStr
        .replace(/年|月/g, "-")
        .replace(/日/g, "")
        .replace(/\./g, "-")
        .replace(/\//g, "-")
        .replace(/\s+/g, "")
        .trim();

    const date = new Date(normalized);

    return isNaN(date.getTime()) ? null : date.getTime();
}

export function parseDurationExpression(expression: string, statsData: StatsData): string {
    const regex = /^(\s*[\w\u4e00-\u9fa5][\w\s\u4e00-\u9fa5\-:\/]*?)\s+([dp])\s+(\s*[\w\u4e00-\u9fa5][\w\s\u4e00-\u9fa5\-:\/]*?)(?:\s+as\s+([\w\u4e00-\u9fa5\s]+))?$/;
    const match = expression.match(regex);

    if (!match) return "";

    let var1: number | null = null;
    if (match[1] === "nowDate") {
        var1 = parseDateToTimestamp(statsData.nowDate);
    } else if (match[1] === "startDate") {
        var1 = parseDateToTimestamp(statsData.startDate);
    } else {
        var1 = parseDateToTimestamp(match[1]);
    }

    let var2: number | null = null;
    if (match[3] === "nowDate") {
        var2 = parseDateToTimestamp(statsData.nowDate);
    } else if (match[3] === "startDate") {
        var2 = parseDateToTimestamp(statsData.startDate);
    } else {
        var2 = parseDateToTimestamp(match[3]);
    }

    if (var1 === null || var2 === null) return "无效日期";

    let result: number;
    if (match[2] === "d") {
        result = Math.abs(var1 - var2);
    } else if (match[2] === "p") {
        result = Math.abs(var1 + var2);
    } else {
        return "";
    }

    const seconds = Math.floor(result / 1000);
    const minutes = parseFloat((result / (1000 * 60)).toFixed(2));
    const hours = parseFloat((result / (1000 * 60 * 60)).toFixed(2));
    const days = parseFloat((result / (1000 * 60 * 60 * 24)).toFixed(2));
    const months = parseFloat((result / (1000 * 60 * 60 * 24 * 30)).toFixed(2));
    const years = parseFloat((result / (1000 * 60 * 60 * 24 * 365)).toFixed(2));

    if (match[4]) {
        if (match[4] === "Y") return `${years}`;
        else if (match[4] === "M") return `${months}`;
        else if (match[4] === "D") return `${days}`;
        else if (match[4] === "h") return `${hours}`;
        else if (match[4] === "m") return `${minutes}`;
        else if (match[4] === "s") return `${seconds}`;
    }

    return `${years}年同${months}月同${days}日同${hours}时同${minutes}分同${seconds}秒`;
}

export async function loadStatsData(): Promise<StatsData> {
    try {
        const notebooksResponse = await lsNotebooks();

        const notesResponse = await sql("SELECT COUNT(*) AS totalDocuments FROM blocks WHERE type = 'd' LIMIT 9999999999999;");
        const totalNotesResponse = await sql("SELECT COUNT(*) AS totalDocuments FROM blocks WHERE type != 'd' LIMIT 9999999999999;");

        const startDateResult = await sql("SELECT created AS startDate FROM blocks WHERE type = 'd' ORDER BY created ASC LIMIT 1;");

        const today = new Date();
        const year = String(today.getFullYear());
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const nowDate = `${year}年${month}月${day}日`;

        return {
            startDate: formatSiYuanTime(startDateResult[0]?.startDate || "未知"),
            notesCount: totalNotesResponse[0]?.totalDocuments || 0,
            notebooksCount: notebooksResponse.notebooks.length,
            DocsCount: notesResponse[0]?.totalDocuments || 0,
            nowDate,
        };
    } catch (error) {
        console.error("Failed to load stats data:", error);
        return {
            startDate: "未知",
            notesCount: 0,
            notebooksCount: 0,
            DocsCount: 0,
            nowDate: "未知",
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