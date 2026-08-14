import { getAttributeView, getTag, sql } from "@/api";
import { buildFtsMatchClause } from "@/components/tools/siyuanSqlPaging";
import type { VisualChartConfig, VisualChartDataset, VisualChartLoadResult } from "./visual-chart-types";

function text(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
    if (typeof value !== "object") return "";
    const item = value as Record<string, any>;
    for (const key of ["content", "name", "text", "value", "label", "title"]) {
        const resolved = text(item[key]);
        if (resolved) return resolved;
    }
    return "";
}

function attributeCellValue(cell: Record<string, any>): unknown {
    const typedKeys = ["block", "text", "number", "date", "created", "updated", "select", "mSelect", "checkbox", "url", "email", "phone", "relation", "rollup", "template"];
    for (const key of typedKeys) {
        const value = cell[key];
        if (value === undefined || value === null) continue;
        if (key === "checkbox") return Boolean(value.checked ?? value.content ?? value);
        if (["number", "date", "created", "updated"].includes(key)) {
            const candidate = value.content ?? value.number ?? value.timestamp ?? value.value;
            const numeric = Number(candidate);
            return Number.isFinite(numeric) ? numeric : text(value);
        }
        return text(value);
    }
    return text(cell);
}

function columnsOf(rows: Array<Record<string, unknown>>): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row)) if (!seen.has(key)) { seen.add(key); result.push(key); }
    return result;
}

function parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') {
            if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
            else quoted = !quoted;
        } else if (char === "," && !quoted) { cells.push(current.trim()); current = ""; }
        else current += char;
    }
    cells.push(current.trim());
    return cells;
}

function parseManualData(input: string): Array<Record<string, unknown>> {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        const parsed = JSON.parse(trimmed);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        if (rows.every((row) => row && typeof row === "object" && !Array.isArray(row))) return rows;
        if (rows.every(Array.isArray) && rows.length > 1) {
            const headers = rows[0].map(String);
            return rows.slice(1).map((row: unknown[]) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
        }
        throw new Error("手动数据必须是对象数组，或首行为字段名的二维数组");
    }
    const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new Error("CSV 至少需要表头和一行数据");
    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] ?? ""])));
}

function extractAttributeViewId(source: string): string {
    const match = source.match(/(?:av-id|data-av-id|custom-av-id)[=\\"\s:]+([0-9]{14}-[a-z0-9]{7})/i);
    return match?.[1] || "";
}

async function resolveAttributeViewId(input: string): Promise<string> {
    const id = input.trim();
    if (!id) throw new Error("请填写数据库块 ID 或属性视图 ID");
    const direct = await getAttributeView(id);
    if (direct?.keyValues?.length || direct?.name) return id;
    const rows = await sql(`select markdown, ial from blocks where id='${id.split("'").join("''")}' and type='av' limit 1`);
    const resolved = extractAttributeViewId(`${rows[0]?.markdown || ""} ${rows[0]?.ial || ""}`);
    if (!resolved) throw new Error("没有从该块中找到属性视图 ID");
    return resolved;
}

async function loadDatabase(input: string): Promise<VisualChartLoadResult> {
    const id = await resolveAttributeViewId(input);
    const view = await getAttributeView(id);
    if (!view) throw new Error("数据库读取失败");
    const rowOrder: string[] = [];
    const rowMap = new Map<string, Record<string, unknown>>();
    view.keyValues.forEach((column, columnIndex) => {
        column.values.forEach((rawCell: any, rowIndex: number) => {
            const rowId = String(rawCell.blockID || rawCell.id || rowIndex);
            if (!rowMap.has(rowId)) { rowOrder.push(rowId); rowMap.set(rowId, {}); }
            const name = column.key.name || `字段 ${columnIndex + 1}`;
            const value = attributeCellValue(rawCell);
            rowMap.get(rowId)![name] = value;
        });
    });
    const rows = rowOrder.map((id) => rowMap.get(id)!);
    return { columns: view.keyValues.map((item) => item.key.name), rows, sourceLabel: view.name || "思源数据库", resolvedDatabaseId: id };
}

function safeDocumentQuery(config: VisualChartConfig): string {
    const filters = ["type='d'"];
    const ids = config.source.notebookIds.filter((id) => /^[0-9]{14}-[a-z0-9]{7}$/.test(id));
    if (ids.length) filters.push(`box in (${ids.map((id) => `'${id}'`).join(",")})`);
    const order = config.source.documentSort === "created" ? "created desc" : config.source.documentSort === "title" ? "content asc" : "updated desc";
    const limit = Math.min(5000, Math.max(1, config.transform.limit));
    const keywordTerms = config.source.documentKeyword.trim().split(/\s+/).filter(Boolean);
    if (keywordTerms.length) {
        filters.push(buildFtsMatchClause(keywordTerms, ["content"], {
            columnQualified: true,
            prefix: true,
            limit,
        }));
    }
    return `select id, content as title, box as notebook_id, path, created, updated from blocks where ${filters.join(" and ")} order by ${order} limit ${limit}`;
}

export async function loadVisualChartData(config: VisualChartConfig): Promise<VisualChartLoadResult> {
    if (config.source.type === "database") return loadDatabase(config.source.databaseId);
    if (config.source.type === "sql") {
        if (!config.source.sql.trim()) throw new Error("请输入 SQL 查询");
        const rows = await sql(config.source.sql) as Array<Record<string, unknown>>;
        return { columns: columnsOf(rows), rows, sourceLabel: "SQL 查询" };
    }
    if (config.source.type === "documents") {
        const rows = await sql(safeDocumentQuery(config)) as Array<Record<string, unknown>>;
        return { columns: columnsOf(rows), rows, sourceLabel: "文档信息" };
    }
    if (config.source.type === "tags") {
        const tags = await getTag(1, true, "homepageVisualChart");
        const rows = tags.map((item: { label?: string; count?: number }) => ({ name: String(item.label || "").trim(), count: Number(item.count) || 0 })).filter((item: { name: string }) => item.name);
        return { columns: ["name", "count"], rows, sourceLabel: "笔记标签" };
    }
    const rows = parseManualData(config.source.manualData);
    return { columns: columnsOf(rows), rows, sourceLabel: "手动数据" };
}

function number(value: unknown, emptyAsZero: boolean): number | null {
    if ((value === "" || value === null || value === undefined) && !emptyAsZero) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : emptyAsZero ? 0 : null;
}

export function transformVisualChartData(dataset: VisualChartDataset, config: VisualChartConfig): VisualChartDataset {
    const category = config.mapping.category || config.mapping.name || dataset.columns[0] || "category";
    const valueFields = config.mapping.values.length ? config.mapping.values : [config.mapping.value || dataset.columns[1]].filter(Boolean);
    let rows = [...dataset.rows];
    if (config.transform.aggregate !== "none") {
        const groups = new Map<string, Array<Record<string, unknown>>>();
        for (const row of rows) {
            const key = String(row[category] ?? "未分类");
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(row);
        }
        rows = Array.from(groups, ([key, items]) => {
            const output: Record<string, unknown> = { [category]: key };
            const fields = valueFields.length ? valueFields : ["value"];
            for (const field of fields) {
                const values = items.map((item) => number(item[field], config.transform.emptyAsZero)).filter((item): item is number => item !== null);
                output[field] = config.transform.aggregate === "count" ? items.length
                    : config.transform.aggregate === "sum" ? values.reduce((sum, item) => sum + item, 0)
                    : config.transform.aggregate === "average" ? (values.reduce((sum, item) => sum + item, 0) / Math.max(1, values.length))
                    : config.transform.aggregate === "min" ? (values.length ? Math.min(...values) : 0)
                    : values.length ? Math.max(...values) : 0;
            }
            return output;
        });
    }
    const sortField = valueFields[0];
    if (config.transform.sort !== "none") rows.sort((left, right) => {
        if (config.transform.sort === "categoryAsc" || config.transform.sort === "categoryDesc") {
            const result = String(left[category] ?? "").localeCompare(String(right[category] ?? ""), "zh-CN");
            return config.transform.sort === "categoryDesc" ? -result : result;
        }
        const result = (number(left[sortField], true) || 0) - (number(right[sortField], true) || 0);
        return config.transform.sort === "valueDesc" ? -result : result;
    });
    rows = rows.slice(0, config.transform.limit);
    return { ...dataset, rows };
}
