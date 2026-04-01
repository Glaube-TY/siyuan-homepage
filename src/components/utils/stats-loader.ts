import { sql } from "@/api";
import { getStatisticalData } from "../tools/statisticalAPI";

function parseDateToTimestamp(dateStr: string): number | null {
    if (!dateStr || typeof dateStr !== "string") return null;

    // 处理带时间的格式: "2025年03月31日 14:30:25"
    // 先提取时间部分
    const timeMatch = dateStr.match(/(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    let timeSuffix = "";
    let datePart = dateStr;
    
    if (timeMatch) {
        timeSuffix = `T${timeMatch[1].padStart(2, '0')}:${timeMatch[2].padStart(2, '0')}:${timeMatch[3].padStart(2, '0')}`;
        datePart = dateStr.substring(0, dateStr.lastIndexOf(timeMatch[0])).trim();
    }

    const normalized = datePart
        .replace(/年|月/g, "-")
        .replace(/日/g, "")
        .replace(/\./g, "-")
        .replace(/\//g, "-")
        .trim();

    // 组合日期和时间
    const dateTimeStr = timeSuffix ? `${normalized}${timeSuffix}` : normalized;
    const date = new Date(dateTimeStr);

    return isNaN(date.getTime()) ? null : date.getTime();
}

export async function parseDurationExpression(expression: string, plugin: any) {
    const regex = /^(\s*[\w\u4e00-\u9fa5][\w\s\u4e00-\u9fa5\-:\/]*?)\s+([dp])\s+(\s*[\w\u4e00-\u9fa5][\w\s\u4e00-\u9fa5\-:\/]*?)(?:\s+as\s+([\w\u4e00-\u9fa5\s]+))?$/;
    const match = expression.match(regex);

    if (!match) return "";

    let var1: number | null = null;
    if (match[1] === "nowDate") {
        var1 = parseDateToTimestamp(await loadStatsData("nowDate", plugin));
    } else if (match[1] === "startDate") {
        var1 = parseDateToTimestamp(await loadStatsData("startDate", plugin));
    } else {
        var1 = parseDateToTimestamp(match[1]);
    }

    let var2: number | null = null;
    if (match[3] === "nowDate") {
        var2 = parseDateToTimestamp(await loadStatsData("nowDate", plugin));
    } else if (match[3] === "startDate") {
        var2 = parseDateToTimestamp(await loadStatsData("startDate", plugin));
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

export async function loadStatsData(statisticalContent: string, plugin: any) {
    try {
        let res: any;

        if (statisticalContent === "startDate") { // 获取第一个文档的创建时间
            const startDateResult = await sql("SELECT created AS startDate FROM blocks WHERE type = 'd' ORDER BY created ASC LIMIT 1;");
            res = formatSiYuanTime(startDateResult[0]?.startDate || "未知");
        } else if (statisticalContent === "nowDate") { // 获取当前日期时间
            const today = new Date();
            const year = String(today.getFullYear());
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const hours = String(today.getHours()).padStart(2, '0');
            const minutes = String(today.getMinutes()).padStart(2, '0');
            const seconds = String(today.getSeconds()).padStart(2, '0');
            const nowDate = `${year}年${month}月${day}日 ${hours}:${minutes}:${seconds}`;
            res = nowDate;
        } else if (statisticalContent === "docsCount") { // 获取文档数量
            res = await getStatisticalData("docsCount", plugin);
        } else if (statisticalContent === "notebooksCount") { // 获取笔记本数量
            res = await getStatisticalData("notebooksCount", plugin);
        } else if (statisticalContent === "blocksCount") { // 获取块数量
            res = await getStatisticalData("blocksCount", plugin);
        } else if (statisticalContent === "wordsCount") { // 获取字数量
            res = await getStatisticalData("wordsCount", plugin);
        } else if (statisticalContent === "tasksCount") { // 获取任务数量
            res = await getStatisticalData("tasksCount", plugin);
        } else if (statisticalContent === "doneTasksCount") { // 获取已完成任务数量
            res = await getStatisticalData("doneTasksCount", plugin);
        } else if (statisticalContent === "undoneTasksCount") { // 获取未完成任务数量
            res = await getStatisticalData("undoneTasksCount", plugin);
        } else if (statisticalContent === "dailynotesCount") { // 获取日记数量
            res = await getStatisticalData("dailynotesCount", plugin);
        } else if (statisticalContent === "tagsCount") { // 获取标签数量
            res = await getStatisticalData("tagsCount", plugin);
        } else if (statisticalContent === "codeBlocksCount") { // 获取代码块数量
            res = await getStatisticalData("codeBlocksCount", plugin);
        } else if (statisticalContent === "mathBlocksCount") { // 获取数学块数量
            res = await getStatisticalData("mathBlocksCount", plugin);
        } else if (statisticalContent === "citationCount") { // 获取引用数量
            res = await getStatisticalData("citationCount", plugin);
        } else {
            res = "未知";
        }

        return res;
    } catch (error) {
        console.error("Failed to load stats data:", error);
        return "未知";
    }

    function formatSiYuanTime(timestamp: string): string {
        if (!timestamp || timestamp === "未知") return "未知";

        const year = timestamp.substring(0, 4);
        const month = timestamp.substring(4, 6);
        const day = timestamp.substring(6, 8);

        return `${year}年${month}月${day}日`;
    }
}