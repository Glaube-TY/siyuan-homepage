import {
    getStatisticalData,
    refreshStatIndexFromRecentDocuments,
    type StatisticalDataResult,
} from "../../components/tools/statisticalAPI";

let prepareStatisticsPromise: Promise<void> | null = null;

export async function prepareHomepageStatistics(plugin: any): Promise<void> {
    if (!prepareStatisticsPromise) {
        prepareStatisticsPromise = refreshStatIndexFromRecentDocuments(plugin)
            .then(() => undefined)
            .finally(() => { prepareStatisticsPromise = null; });
    }
    await prepareStatisticsPromise;
}

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

function nowDateResult(): StatisticalDataResult {
    const today = new Date();
    const year = String(today.getFullYear());
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const hours = String(today.getHours()).padStart(2, '0');
    const minutes = String(today.getMinutes()).padStart(2, '0');
    const seconds = String(today.getSeconds()).padStart(2, '0');
    return { value: `${year}年${month}月${day}日 ${hours}:${minutes}:${seconds}`, status: "ok" };
}

export async function loadStatsDataResult(statisticalContent: string, plugin: any): Promise<StatisticalDataResult> {
    try {
        if (statisticalContent === "nowDate") return nowDateResult();
        return await getStatisticalData(statisticalContent, plugin);
    } catch (error) {
        console.error("Failed to load stats data:", error);
        return { value: null, status: "error", message: error instanceof Error ? error.message : "统计读取失败" };
    }
}

export async function loadStatsData(statisticalContent: string, plugin: any): Promise<string> {
    const result = await loadStatsDataResult(statisticalContent, plugin);
    return result.status === "ok" && result.value !== null ? String(result.value) : "暂无数据";
}
