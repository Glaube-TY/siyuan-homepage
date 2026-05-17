import { isDesktopDeviceProfileEnabled } from "@/homepage/utils/deviceProfile";
import { getTemplateRuntimeContext } from "./templateRuntimeContext";
import { createTemplateBackup } from "./templateBackup";

export const USER_LAYOUT_TEMPLATE_FILE = "homepageUserLayoutTemplates.json";

export interface UserLayoutTemplate {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
    deviceId: string | null;
    columns: number;
    gap: number;
    layoutItems: Array<{
        widgetId: string;
        order: number;
        style: string | null;
        colSpan?: number;
        rowSpan?: number;
        hasContent?: boolean;
    }>;
}

export interface UserLayoutTemplateAvailability {
    available: boolean;
    reason: string;
    currentColumns: number;
    templateColumns: number;
}

export interface ApplyUserLayoutTemplateResult {
    success: boolean;
    reason: string;
    backupId?: string;
    skippedWidgetIds: string[];
}

export interface UserLayoutTemplatePreviewItem {
    widgetId: string;
    order: number;
    style: string | null;
    widgetType: string;
    displayName: string;
    missing: boolean;
    placeholder: boolean;
    colSpan: number;
    rowSpan: number;
}

export interface UserLayoutTemplatePreview {
    columns: number;
    gap: number;
    items: UserLayoutTemplatePreviewItem[];
}

export async function loadUserLayoutTemplates(plugin: any): Promise<UserLayoutTemplate[]> {
    try {
        const data = await plugin.loadData(USER_LAYOUT_TEMPLATE_FILE);
        if (Array.isArray(data)) {
            return data;
        }
    } catch {
        // ignore
    }
    return [];
}

export async function saveUserLayoutTemplates(plugin: any, templates: UserLayoutTemplate[]): Promise<void> {
    await plugin.saveData(USER_LAYOUT_TEMPLATE_FILE, templates);
}

async function safeLoadWidgetLayout(plugin: any): Promise<any> {
    try {
        const layout = await plugin.loadData("widgetLayout.json");
        return layout ?? { defaultOrder: [], profiles: {} };
    } catch {
        return { defaultOrder: [], profiles: {} };
    }
}

function normalizePositiveInteger(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    const n = Math.floor(value);
    return n > 0 ? n : 0;
}

function parseGridSpanValue(value: string | null): number {
    if (!value) return 0;
    const trimmed = value.trim();
    const spanMatch = trimmed.match(/span\s+(\d+)/i);
    if (spanMatch?.[1]) {
        const n = parseInt(spanMatch[1], 10);
        if (Number.isFinite(n) && n > 0) return n;
    }
    const rangeMatch = trimmed.match(/(\d+)\s*\/\s*(\d+)/);
    if (rangeMatch?.[1] && rangeMatch?.[2]) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            return Math.max(1, end - start);
        }
    }
    return 0;
}

function extractGridSpanFromComputedStyle(
    css: CSSStyleDeclaration,
    axis: "column" | "row",
): number {
    const end = css.getPropertyValue(`grid-${axis}-end`);
    const start = css.getPropertyValue(`grid-${axis}-start`);

    const endSpan = parseGridSpanValue(end);
    if (endSpan > 0) {
        return endSpan;
    }

    const startLine = parseInt(start.trim(), 10);
    const endLine = parseInt(end.trim(), 10);
    if (
        Number.isFinite(startLine) &&
        Number.isFinite(endLine) &&
        endLine > startLine
    ) {
        return endLine - startLine;
    }

    return 0;
}

function extractGridSpanFromStyle(style: string | null, axis: "column" | "row"): number {
    if (!style) return 0;
    if (!style.includes(":")) {
        const directSpan = parseGridSpanValue(style);
        if (directSpan > 0) return directSpan;
    }

    const props = axis === "column"
        ? ["grid-column", "grid-column-end", "grid-column-start"]
        : ["grid-row", "grid-row-end", "grid-row-start"];

    for (const prop of props) {
        const escaped = prop.replace(/\-/g, "\\-");
        const regex = new RegExp(`${escaped}\\s*:\\s*([^;]+)`, "i");
        const match = style.match(regex);
        if (match?.[1]) {
            const span = parseGridSpanValue(match[1]);
            if (span > 0) return span;
        }
    }

    return 0;
}

async function loadWidgetSpanFromConfig(
    plugin: any,
    widgetId: string,
    axis: "column" | "row",
): Promise<number> {
    try {
        const config = await plugin.loadData(`widget-${widgetId}.json`);
        if (config) {
            const key = axis === "column" ? "colSize" : "rowSize";
            const value = typeof config[key] === "number" ? config[key] : undefined;
            const span = normalizePositiveInteger(value);
            if (span > 0) return span;
        }
    } catch {
        // ignore
    }
    return 0;
}

function readGridSpanFromElement(el: HTMLElement): { colSpan: number; rowSpan: number } {
    let colSpan = 0;
    let rowSpan = 0;

    try {
        const computedStyle = window.getComputedStyle(el);
        colSpan = extractGridSpanFromComputedStyle(computedStyle, "column");
        rowSpan = extractGridSpanFromComputedStyle(computedStyle, "row");
    } catch {
        // ignore
    }

    if (colSpan < 1) {
        colSpan = extractGridSpanFromStyle(el.style?.gridColumn || null, "column");
    }
    if (colSpan < 1) {
        colSpan = extractGridSpanFromStyle(el.style?.gridColumnEnd || null, "column");
    }
    if (colSpan < 1) {
        colSpan = extractGridSpanFromStyle(el.getAttribute("style") || null, "column");
    }
    if (rowSpan < 1) {
        rowSpan = extractGridSpanFromStyle(el.style?.gridRow || null, "row");
    }
    if (rowSpan < 1) {
        rowSpan = extractGridSpanFromStyle(el.style?.gridRowEnd || null, "row");
    }
    if (rowSpan < 1) {
        rowSpan = extractGridSpanFromStyle(el.getAttribute("style") || null, "row");
    }

    return {
        colSpan: normalizePositiveInteger(colSpan),
        rowSpan: normalizePositiveInteger(rowSpan),
    };
}

function getGridSpanFromElement(el: HTMLElement): { colSpan: number; rowSpan: number } {
    const span = readGridSpanFromElement(el);
    return {
        colSpan: Math.max(1, span.colSpan),
        rowSpan: Math.max(1, span.rowSpan),
    };
}

async function resolveGridSpanForWidget(
    plugin: any,
    widgetId: string,
    el: HTMLElement | null,
): Promise<{ colSpan: number; rowSpan: number }> {
    const domSpan = el ? readGridSpanFromElement(el) : { colSpan: 0, rowSpan: 0 };
    if (el && domSpan.colSpan > 0 && domSpan.rowSpan > 0) {
        return getGridSpanFromElement(el);
    }

    let colSpan = normalizePositiveInteger(domSpan.colSpan);
    let rowSpan = normalizePositiveInteger(domSpan.rowSpan);

    if (colSpan < 1) {
        colSpan = await loadWidgetSpanFromConfig(plugin, widgetId, "column");
    }
    if (rowSpan < 1) {
        rowSpan = await loadWidgetSpanFromConfig(plugin, widgetId, "row");
    }

    return {
        colSpan: Math.max(1, colSpan),
        rowSpan: Math.max(1, rowSpan),
    };
}

function extractAllowedVisualStyleRules(style: string | null): string[] {
    if (!style) return [];
    const allowedProps = [
        "background-color",
        "background",
        "border",
        "border-radius",
        "box-shadow",
        "transition",
    ];
    return style
        .split(";")
        .map((rule) => rule.trim())
        .filter(Boolean)
        .filter((rule) => {
            const colonIndex = rule.indexOf(":");
            if (colonIndex === -1) return false;
            const prop = rule.substring(0, colonIndex).trim().toLowerCase();
            return allowedProps.includes(prop);
        });
}

function buildLayoutItemStyle(
    style: string | null,
    colSpan?: number,
    rowSpan?: number,
): string {
    const finalColSpan = Math.max(1, normalizePositiveInteger(colSpan) || extractGridSpanFromStyle(style, "column") || 1);
    const finalRowSpan = Math.max(1, normalizePositiveInteger(rowSpan) || extractGridSpanFromStyle(style, "row") || 1);
    const parts = [
        `grid-column: span ${finalColSpan}`,
        `grid-row: span ${finalRowSpan}`,
        ...extractAllowedVisualStyleRules(style),
    ];
    return parts.join("; ");
}

function normalizeOrderItems(items: unknown): Array<{ id: string; style: string | null }> {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
        if (typeof item !== "object" || item === null) {
            return { id: "", style: null };
        }
        const raw = item as Record<string, unknown>;
        const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : "";
        const style = typeof raw.style === "string" ? raw.style : null;
        return { id, style };
    });
}

function getEffectiveVisibleOrder(
    layout: any,
    deviceId: string | null,
): Array<{ id: string; style: string | null; index: number }> {
    const profile = layout?.profiles?.[deviceId ?? ""];
    const profileOrder = normalizeOrderItems(profile?.order);
    const defaultOrder = normalizeOrderItems(layout?.defaultOrder ?? layout?.order ?? []);
    const hiddenIds = new Set<string>(
        Array.isArray(profile?.hiddenWidgetIds)
            ? profile.hiddenWidgetIds.filter((id: unknown): id is string => typeof id === "string")
            : [],
    );

    const result: Array<{ id: string; style: string | null; index: number }> = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < profileOrder.length; i++) {
        const item = profileOrder[i];
        if (item.id && !seenIds.has(item.id)) {
            result.push({ ...item, index: i });
            seenIds.add(item.id);
        }
    }

    for (let i = 0; i < defaultOrder.length; i++) {
        const item = defaultOrder[i];
        if (!item.id) continue;
        if (seenIds.has(item.id)) continue;
        if (hiddenIds.has(item.id)) continue;
        result.push({ ...item, index: profileOrder.length + i });
        seenIds.add(item.id);
    }

    return result;
}

async function hasWidgetContent(plugin: any, widgetId: string): Promise<boolean> {
    try {
        return !!(await plugin.loadData(`widget-${widgetId}.json`));
    } catch {
        return false;
    }
}

async function captureCurrentDeviceLayoutTemplatePayload(plugin: any): Promise<{
    deviceId: string | null;
    columns: number;
    gap: number;
    layoutItems: Array<{
        widgetId: string;
        order: number;
        style: string | null;
        colSpan?: number;
        rowSpan?: number;
        hasContent?: boolean;
    }>;
}> {
    const context = await getTemplateRuntimeContext(plugin);

    if (!isDesktopDeviceProfileEnabled() || !context.deviceId) {
        throw new Error("个人布局模板仅支持主主页桌面设备布局");
    }

    const layout = await safeLoadWidgetLayout(plugin);
    const effectiveOrder = getEffectiveVisibleOrder(layout, context.deviceId);

    const layoutItems: Array<{
        widgetId: string;
        order: number;
        style: string | null;
        colSpan?: number;
        rowSpan?: number;
        hasContent?: boolean;
    }> = [];
    let orderIndex = 0;

    for (const item of effectiveOrder) {
        if (!item.id) continue;
        const element = document.getElementById(item.id) as HTMLElement | null;
        const hasContent = await hasWidgetContent(plugin, item.id);
        if (!hasContent && !element) {
            console.warn(`[TemplateCapture] 跳过缺失组件: ${item.id}`);
            continue;
        }

        const span = await resolveGridSpanForWidget(plugin, item.id, element);

        layoutItems.push({
            widgetId: item.id,
            order: orderIndex,
            style: item.style ?? null,
            colSpan: span.colSpan,
            rowSpan: span.rowSpan,
            hasContent,
        });
        orderIndex++;
    }

    return {
        deviceId: context.deviceId,
        columns: context.currentColumns,
        gap: context.currentGap,
        layoutItems,
    };
}

export async function saveCurrentDeviceAsLayoutTemplate(
    plugin: any,
    input: { name: string; description?: string },
): Promise<UserLayoutTemplate> {
    const payload = await captureCurrentDeviceLayoutTemplatePayload(plugin);

    const now = Date.now();
    const template: UserLayoutTemplate = {
        id: `user_layout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: input.name,
        description: input.description,
        createdAt: now,
        updatedAt: now,
        deviceId: payload.deviceId,
        columns: payload.columns,
        gap: payload.gap,
        layoutItems: payload.layoutItems,
    };

    const templates = await loadUserLayoutTemplates(plugin);
    templates.push(template);
    await saveUserLayoutTemplates(plugin, templates);

    return template;
}

export async function getUserLayoutTemplateAvailability(
    plugin: any,
    template: UserLayoutTemplate,
): Promise<UserLayoutTemplateAvailability> {
    const context = await getTemplateRuntimeContext(plugin);

    if (!isDesktopDeviceProfileEnabled() || !context.deviceId) {
        return {
            available: false,
            reason: "个人布局模板仅支持主主页桌面设备布局",
            currentColumns: context.currentColumns,
            templateColumns: template.columns,
        };
    }

    if (template.columns !== context.currentColumns) {
        return {
            available: false,
            reason: `该布局模板保存时为 ${template.columns} 列，当前主页为 ${context.currentColumns} 列。为避免布局错乱，请先切换到 ${template.columns} 列后再应用。`,
            currentColumns: context.currentColumns,
            templateColumns: template.columns,
        };
    }

    return {
        available: true,
        reason: "",
        currentColumns: context.currentColumns,
        templateColumns: template.columns,
    };
}

export async function applyUserLayoutTemplateToCurrentDevice(
    plugin: any,
    templateId: string,
): Promise<ApplyUserLayoutTemplateResult> {
    const templates = await loadUserLayoutTemplates(plugin);
    const template = templates.find((t) => t.id === templateId);

    if (!template) {
        return {
            success: false,
            reason: "找不到指定的个人布局模板",
            skippedWidgetIds: [],
        };
    }

    const context = await getTemplateRuntimeContext(plugin);

    if (!isDesktopDeviceProfileEnabled() || !context.deviceId) {
        return {
            success: false,
            reason: "个人布局模板仅支持主主页桌面设备布局",
            skippedWidgetIds: [],
        };
    }

    const availability = await getUserLayoutTemplateAvailability(plugin, template);
    if (!availability.available) {
        return {
            success: false,
            reason: availability.reason,
            skippedWidgetIds: [],
        };
    }

    const backup = await createTemplateBackup(plugin, {
        templateId: template.id,
        templateName: template.name,
        deviceId: context.deviceId,
        reason: "apply-user-layout-template",
    });

    const layout = await safeLoadWidgetLayout(plugin);

    if (!layout.profiles) {
        layout.profiles = {};
    }
    if (!layout.profiles[context.deviceId]) {
        layout.profiles[context.deviceId] = { order: [] };
    }

    const profile = layout.profiles[context.deviceId];
    const existingHiddenIds = Array.isArray(profile.hiddenWidgetIds) ? profile.hiddenWidgetIds : [];

    const allExistingWidgetIds = new Set<string>();
    const defaultOrder = normalizeOrderItems(layout?.defaultOrder ?? layout?.order ?? []);
    for (const item of defaultOrder) {
        if (item.id) allExistingWidgetIds.add(item.id);
    }
    const profileOrder = normalizeOrderItems(profile?.order);
    for (const item of profileOrder) {
        if (item.id) allExistingWidgetIds.add(item.id);
    }

    const currentVisibleIds = new Set(
        getEffectiveVisibleOrder(layout, context.deviceId).map((item) => item.id),
    );

    const newOrderItems: Array<{ id: string; style: string | null; index: number }> = [];
    const skippedWidgetIds: string[] = [];

    for (const item of template.layoutItems) {
        const inLayout = allExistingWidgetIds.has(item.widgetId);
        const hasContent = await hasWidgetContent(plugin, item.widgetId);
        const isPlaceholder = item.hasContent === false;
        if ((inLayout && hasContent) || isPlaceholder) {
            newOrderItems.push({
                id: item.widgetId,
                style: buildLayoutItemStyle(item.style, item.colSpan, item.rowSpan),
                index: item.order,
            });
        } else {
            skippedWidgetIds.push(item.widgetId);
        }
    }

    const newOrder = newOrderItems.sort((a, b) => a.index - b.index);

    const validTemplateWidgetIds = new Set(newOrder.map((item) => item.id));

    const newlyHiddenIds = Array.from(currentVisibleIds).filter(
        (id) => !validTemplateWidgetIds.has(id),
    );

    const visibleTemplateHiddenRemoved = existingHiddenIds.filter(
        (id) => !validTemplateWidgetIds.has(id),
    );

    const mergedHiddenIds = Array.from(new Set([
        ...visibleTemplateHiddenRemoved,
        ...newlyHiddenIds,
    ]));

    const nextGap = typeof template.gap === "number" ? template.gap : context.currentGap;

    profile.order = newOrder;
    profile.hiddenWidgetIds = mergedHiddenIds;
    profile.widgetLayoutNumber = template.columns;
    profile.widgetGap = nextGap;

    await plugin.saveData("widgetLayout.json", layout);

    return {
        success: true,
        reason: "",
        backupId: backup.id,
        skippedWidgetIds,
    };
}

export async function deleteUserLayoutTemplate(plugin: any, templateId: string): Promise<boolean> {
    const templates = await loadUserLayoutTemplates(plugin);
    const index = templates.findIndex((t) => t.id === templateId);
    if (index === -1) {
        return false;
    }
    templates.splice(index, 1);
    await saveUserLayoutTemplates(plugin, templates);
    return true;
}

export async function updateUserLayoutTemplateFromCurrentDevice(
    plugin: any,
    templateId: string,
    input?: { name?: string; description?: string },
): Promise<UserLayoutTemplate | null> {
    const templates = await loadUserLayoutTemplates(plugin);
    const templateIndex = templates.findIndex((t) => t.id === templateId);
    if (templateIndex === -1) {
        return null;
    }

    const payload = await captureCurrentDeviceLayoutTemplatePayload(plugin);

    const existing = templates[templateIndex];

    const updated: UserLayoutTemplate = {
        id: existing.id,
        name: (input?.name && input.name.trim()) ? input.name.trim() : existing.name,
        description: input?.description !== undefined ? input.description : existing.description,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
        deviceId: payload.deviceId,
        columns: payload.columns,
        gap: payload.gap,
        layoutItems: payload.layoutItems,
    };

    templates[templateIndex] = updated;
    await saveUserLayoutTemplates(plugin, templates);

    return updated;
}

const WIDGET_TYPE_DISPLAY_NAMES: Record<string, string> = {
    "latest-docs": "最近文档",
    "childDocs": "子文档",
    "favorites": "收藏文档",
    "recent-journals": "最近日记",
    "dailyQuote": "每日一言",
    "countdown": "倒计时",
    "focus": "专注计时",
    "TaskMan": "任务管理",
    "TaskManPlus": "任务管理 Plus",
    "timedate": "时间日期",
    "custom-web": "浏览器组件",
    "custom-text": "自定义文本",
    "custom-protyle": "自定义文档",
    "weather": "天气",
    "almanac": "黄历",
    "musicPlayer": "音乐播放器",
    "PicCaro": "图片轮播",
    "heatmap": "热力图",
    "sql": "SQL 查询",
    "visualChart": "可视化图表",
    "databaseChart": "数据库图表",
    "statisticalCard": "统计卡片",
    "conditionDocs": "条件文档",
    "quick-notes": "快速笔记",
    "historyDays": "历史上的今天",
    "constellation": "星座",
    "News": "新闻",
    "HOT": "热榜",
    "CYBMOK": "沉浸模式",
    "countdownTimer": "计时器",
    "fixedAssets": "固定资产",
    "stikynot": "便签",
};

function getWidgetTypeDisplayName(widgetType: string): string {
    return WIDGET_TYPE_DISPLAY_NAMES[widgetType] ?? widgetType;
}

export async function buildUserLayoutTemplatePreview(
    plugin: any,
    template: UserLayoutTemplate,
): Promise<UserLayoutTemplatePreview> {
    const items: UserLayoutTemplatePreviewItem[] = [];

    for (const layoutItem of template.layoutItems) {
        let widgetType = "unknown";
        let displayName = "";
        let missing = false;
        let placeholder = false;

        try {
            const config = await plugin.loadData(`widget-${layoutItem.widgetId}.json`);
            if (config) {
                widgetType = config.type ?? config.data?.type ?? "unknown";
                const userTitle =
                    config.title ??
                    config.name ??
                    config.label ??
                    config.data?.title ??
                    config.data?.name ??
                    config.data?.label;
                displayName = userTitle ?? getWidgetTypeDisplayName(widgetType);
                if (!displayName && widgetType === "unknown") {
                    displayName = layoutItem.widgetId;
                }
            } else if (layoutItem.hasContent === false) {
                placeholder = true;
                widgetType = "placeholder";
                displayName = "未设置内容";
            } else {
                missing = true;
                widgetType = "missing";
                displayName = "组件已不存在";
            }
        } catch {
            if (layoutItem.hasContent === false) {
                placeholder = true;
                widgetType = "placeholder";
                displayName = "未设置内容";
            } else {
                missing = true;
                widgetType = "missing";
                displayName = "组件已不存在";
            }
        }

        const colSpan = normalizePositiveInteger(layoutItem.colSpan) > 0
            ? normalizePositiveInteger(layoutItem.colSpan)
            : extractGridSpanFromStyle(layoutItem.style, "column") || 1;
        const rowSpan = normalizePositiveInteger(layoutItem.rowSpan) > 0
            ? normalizePositiveInteger(layoutItem.rowSpan)
            : extractGridSpanFromStyle(layoutItem.style, "row") || 1;

        items.push({
            widgetId: layoutItem.widgetId,
            order: layoutItem.order,
            style: layoutItem.style,
            widgetType,
            displayName,
            missing,
            placeholder,
            colSpan,
            rowSpan,
        });
    }

    items.sort((a, b) => a.order - b.order);

    return {
        columns: template.columns,
        gap: template.gap,
        items,
    };
}
