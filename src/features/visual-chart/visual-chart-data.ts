import { getAttributeView, getTag, renderAttributeViewReadonly, sql, sqlChecked } from "@/api";
import { buildFtsMatchClause } from "@/components/tools/siyuanSqlPaging";
import type { VisualChartConfig, VisualChartDatabaseView, VisualChartDataset, VisualChartLoadResult } from "./visual-chart-types";

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
    const typedKeys = ["block", "text", "number", "date", "created", "updated", "select", "mSelect", "checkbox", "url", "email", "phone", "relation", "rollup", "template", "mAsset"];
    for (const key of typedKeys) {
        const value = cell[key];
        if (value === undefined || value === null) continue;
        if (key === "checkbox") return Boolean(value.checked ?? value.content ?? value);
        if (key === "relation" || key === "rollup") {
            if (value.contents === null) return null; // Go nil slice is a legitimate empty relation/rollup.
            if (!Array.isArray(value.contents)) throw new Error("数据库字段响应异常：关联或汇总字段缺少 contents 数组。");
            const contents = value.contents.map((item: any) => item ? attributeCellValue(item) : null);
            if (!contents.length) return null;
            return key === "rollup" && contents.length === 1 ? contents[0] : contents.map(text).filter(Boolean).join(", ");
        }
        if (["number", "date", "created", "updated"].includes(key)) {
            if (value.isNotEmpty === false) return null;
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

async function resolveAttributeViewId(input: string): Promise<{ id: string; blockID?: string }> {
    const id = input.trim();
    if (!id) throw new Error("请填写数据库块 ID 或属性视图 ID");
    if (!/^[0-9]{14}-[a-z0-9]{7}$/.test(id)) throw new Error("数据库 ID 无效：请填写数据库块 ID 或属性视图 ID");
    let rows: any[];
    try { rows = await sqlChecked(`select markdown, ial from blocks where id='${id}' and type='av' limit 1`); }
    catch { throw new Error("数据库 ID 解析时读取失败，请检查权限或内核连接。"); }
    if (!rows.length) return { id };
    const resolved = extractAttributeViewId(`${rows[0]?.markdown || ""} ${rows[0]?.ial || ""}`);
    if (!resolved) throw new Error("数据库块 ID 无法解析：该块缺少属性视图 ID。");
    return { id: resolved, blockID: id };
}

async function readDatabaseDefinition(input: string) {
    const target = await resolveAttributeViewId(input);
    let definition: Awaited<ReturnType<typeof getAttributeView>>;
    try { definition = await getAttributeView(target.id, { checked: true }); }
    catch (error) {
        if (error instanceof Error && error.message.startsWith("数据库")) throw error;
        throw new Error("数据库定义读取失败，请检查权限或内核连接。");
    }
    if (!definition) throw new Error("数据库 ID 无效或不存在，无法读取数据库。");
    return { target, definition };
}

// SiYuan 3.8.6 AVView uses id/name/type, not the database's root viewID.
function databaseViews(definition: Awaited<ReturnType<typeof getAttributeView>>): VisualChartDatabaseView[] {
    const views = definition?.raw?.views;
    if (views == null) throw new Error("数据库没有可用视图，请在思源中检查数据库。");
    if (!Array.isArray(views)) throw new Error("数据库视图响应不完整：views 不是数组。");
    const ids = new Set<string>();
    const labels: Record<string, string> = { table: "表格", list: "列表", calendar: "日历", gallery: "画廊", kanban: "看板" };
    return views.map((view): VisualChartDatabaseView => {
        if (!view || typeof view.id !== "string" || !/^[0-9]{14}-[a-z0-9]{7}$/.test(view.id) || ids.has(view.id) ||
            typeof view.name !== "string" || typeof view.type !== "string" || !view.type) {
            throw new Error("数据库视图响应不完整：视图 ID、名称或布局异常。");
        }
        ids.add(view.id);
        const unsupportedReason = view.type === "calendar"
            ? "日历按日期范围读取且排除无日期条目，不具备普通分页语义；暂不支持作为图表数据源。"
            : !["table", "list"].includes(view.type)
                ? `${labels[view.type] || "未知"}布局暂不支持图表数据读取，请选择表格或列表视图。`
                : view.group?.field || view.groups?.length
                    ? "分组视图暂不支持图表，请选择未分组的表格或列表视图。" : "";
        return { id: view.id, name: view.name || "未命名视图", type: view.type, typeLabel: labels[view.type] || `未知布局（${view.type}）`, unsupportedReason };
    });
}

export async function loadVisualChartDatabaseViews(input: string): Promise<VisualChartDatabaseView[]> {
    const { definition } = await readDatabaseDefinition(input);
    const views = databaseViews(definition);
    if (!views.length) throw new Error("数据库没有可用视图，请在思源中检查数据库。");
    return views;
}

async function loadDatabase(input: string, requestedLimit: number, requestedViewID = ""): Promise<VisualChartLoadResult> {
    const { target, definition } = await readDatabaseDefinition(input);
    const views = databaseViews(definition);
    if (!views.length) throw new Error("数据库没有可用视图，请在思源中检查数据库。");
    const selected = requestedViewID ? views.find((view) => view.id === requestedViewID) : undefined;
    if (requestedViewID && !selected) throw new Error("已选择的数据库视图不存在或已删除，请主动选择其他视图。");
    if (selected?.unsupportedReason) throw new Error(selected.unsupportedReason);
    const limit = Math.min(5000, Math.max(1, Math.floor(requestedLimit) || 200));
    const pageSize = Math.min(200, limit);
    const rows: Array<Record<string, unknown>> = [];
    const rowIds = new Set<string>();
    let columns: string[] = [];
    let columnSignature = "";
    let selectedViewID: string | undefined = requestedViewID || undefined;
    let viewSignature = "";
    for (let page = 1; rows.length < limit; page += 1) {
        let rendered: any;
        try { rendered = await renderAttributeViewReadonly({ ...target, viewID: selectedViewID, page, pageSize }); }
        catch (error) {
            if ((error as { siyuanMsg?: string })?.siyuanMsg === "attribute view not found") {
                throw new Error("数据库 ID 无效或不存在，无法读取数据库。");
            }
            if (selectedViewID && /view.*not found/i.test((error as { siyuanMsg?: string })?.siyuanMsg || "")) {
                throw new Error("已选择的数据库视图不存在或已删除，请主动选择其他视图。");
            }
            throw new Error("数据库行读取失败，请检查权限、数据库块上下文或内核连接。");
        }
        const view = rendered?.view;
        if (selectedViewID && rendered?.viewID !== selectedViewID) throw new Error("数据库视图在读取期间发生变化：返回的 viewID 与所选视图不一致，请重新载入。");
        const currentView = views.find((item) => item.id === rendered?.viewID);
        if (typeof rendered?.viewID === "string" && rendered.viewID && !currentView) {
            throw new Error("数据库视图在读取期间发生变化：视图已不存在，请重新载入。");
        }
        if (currentView?.unsupportedReason) throw new Error(currentView.unsupportedReason);
        if (!view || !["table", "list"].includes(rendered.viewType)) {
            throw new Error("数据库响应不完整或当前布局暂不支持：请使用表格或列表视图。");
        }
        if (view.group?.field || view.groups?.length) throw new Error("当前数据库分组结构暂不支持图表，请使用未分组的表格或列表视图。");
        if (!Array.isArray(view.columns) || !view.columns.length || typeof rendered.viewID !== "string" || !rendered.viewID) {
            throw new Error("数据库响应不完整：缺少有效的 columns 或 viewID。");
        }
        if (!Number.isInteger(view.rowCount) || view.rowCount < 0) throw new Error("数据库分页响应不完整：缺少有效的 rowCount。");
        const currentSignature = JSON.stringify([rendered.viewType, view.rowCount, view.filters, view.sorts, rendered.contextFilter]);
        if ((currentView && currentView.type !== rendered.viewType) || (page > 1 && viewSignature !== currentSignature)) {
            throw new Error("数据库视图在读取期间发生变化，请重新载入。");
        }
        viewSignature = currentSignature;
        const pageRows = view.rows === null && view.rowCount === 0 ? [] : view.rows;
        if (!Array.isArray(pageRows)) throw new Error("数据库响应不完整：缺少有效的 rows。");
        const names = view.columns.map((column: any, index: number) => {
            if (!column || typeof column.id !== "string" || !column.id || typeof column.name !== "string" || typeof column.type !== "string" || !column.type) {
                throw new Error("数据库字段响应不完整：缺少列 ID、名称或类型。");
            }
            return column.name || `字段 ${index + 1}`;
        });
        if (new Set(names).size !== names.length) throw new Error("数据库字段名称重复，无法可靠映射图表字段。");
        const signature = JSON.stringify(view.columns.map((column: any) => [column.id, column.name, column.type]));
        if (page > 1 && (selectedViewID !== rendered.viewID || signature !== columnSignature)) {
            throw new Error("数据库视图在读取期间发生变化，请重新载入。");
        }
        selectedViewID = rendered.viewID;
        columnSignature = signature;
        columns = names;
        const fields = new Map<string, string>(view.columns.map((column: any, index: number) => [column.id, names[index]]));
        if (fields.size !== names.length) throw new Error("数据库字段 ID 重复，无法可靠映射图表字段。");
        for (const row of pageRows) {
            if (!row || typeof row.id !== "string" || !row.id || !Array.isArray(row.cells) || rowIds.has(row.id)) {
                throw new Error("数据库行响应不完整：条目 ID 或 cells 异常。");
            }
            rowIds.add(row.id);
            const output = Object.fromEntries(names.map((name: string) => [name, null]));
            const seenKeys = new Set<string>();
            for (const cell of row.cells) {
                if (!cell || typeof cell !== "object" || Array.isArray(cell)) throw new Error("数据库字段响应异常：单元格结构无效。");
                if (cell.value == null) continue;
                const value = cell.value;
                if (typeof value !== "object" || Array.isArray(value) || !fields.has(value.keyID) || seenKeys.has(value.keyID) ||
                    (value.blockID && value.blockID !== row.id)) {
                    throw new Error("数据库字段响应异常：单元格的 keyID 或条目 ID 无法关联。");
                }
                seenKeys.add(value.keyID);
                output[fields.get(value.keyID)!] = attributeCellValue(value);
            }
            rows.push(output);
            if (rows.length >= limit) break;
        }
        if (rows.length > view.rowCount || (pageRows.length < pageSize && rows.length < Math.min(limit, view.rowCount))) {
            throw new Error("数据库分页响应不完整：返回行数与 rowCount 不一致。");
        }
        if (rows.length >= view.rowCount) break;
    }
    return { columns, rows, sourceLabel: definition.name || "思源数据库", resolvedDatabaseId: target.id };
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
    if (config.source.type === "database") return loadDatabase(config.source.databaseId, config.transform.limit, config.source.databaseViewId);
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
