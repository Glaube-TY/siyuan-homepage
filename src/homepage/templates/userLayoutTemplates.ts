import { isDesktopDeviceProfileEnabled } from "@/homepage/utils/deviceProfile";
import { getFileOrNullChecked } from "@/api";
import { collectLayoutReferencedIdsForCleanup } from "./templateBackupScope";
import type { SectionLayoutTemplatePayload } from "./templateTypes";
import type { CoordinatedSnapshot, LayoutSnapshot } from "@/components/utils/widgetBlock/utils/layout-shared";
import {
    getActiveSectionIdFromLayout,
    normalizeLayoutItems,
    readCoordinatedSnapshotForContext,
    resolveEffectiveWidgetLayoutSettings,
    runInSurfaceTransaction,
    saveLayoutDataForContext,
    validateFullProfileSectionsReadOnly,
    validateLayoutViewSectionConsistency,
} from "@/components/utils/widgetBlock/utils/layout-shared";
import { assertSectionLayoutInvariants, reindexLayoutItems } from "@/components/utils/widgetBlock/utils/layout-section-ops";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import { getPluginStorageRoot } from "@/homepage/deviceView/deviceViewPaths";
import {
    createWidgetInstanceConfig,
    createWidgetInstanceId,
    deleteWidgetInstance,
    readWidgetInstanceDocument,
} from "@/homepage/deviceView/widgetInstanceRepository";
import type { DeviceViewContext, DeviceWidgetDocument } from "@/homepage/deviceView/deviceViewTypes";
import {
    cloneJsonSafe as toJsonSafeClone,
    hasSameJsonSemantic as hasSameSemanticValue,
    isJsonSafe,
    isPlainJsonObject as isPlainObject,
} from "@/homepage/deviceView/jsonSafe";

export const USER_LAYOUT_TEMPLATE_FILE = "homepageUserLayoutTemplates.json";

export interface UserLayoutTemplateItem {
    widgetId: string;
    order: number;
    style: string | null;
    colSpan?: number;
    rowSpan?: number;
    hasContent?: boolean;
}

interface UserLayoutTemplateBase {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
    columns: number;
    gap: number;
    layoutItems: UserLayoutTemplateItem[];
}

export interface PublishedLegacyUserLayoutTemplate extends UserLayoutTemplateBase {
    /** 仅兼容已发布旧公开数据；运行时完全忽略。 */
    deviceId?: string | null;
    widgetConfigs?: never;
}

export interface CurrentUserLayoutTemplate extends UserLayoutTemplateBase {
    deviceId?: never;
    widgetConfigs: Record<string, Record<string, unknown>>;
}

export type UserLayoutTemplate = PublishedLegacyUserLayoutTemplate | CurrentUserLayoutTemplate;

export interface UserLayoutTemplateAvailability {
    available: boolean;
    reason: string;
    currentColumns: number;
    templateColumns: number;
    /** 旧公开模板在当前设备可恢复组件数。 */
    recoverableCount?: number;
    /** 旧公开模板在当前设备缺失组件数。 */
    skippedCount?: number;
    /** 是否为旧公开模板。 */
    isLegacy?: boolean;
}

export interface ApplyUserLayoutTemplateResult {
    success: boolean;
    reason: string;
    skippedWidgetIds: string[];
    /** 布局已成功提交，但后续刷新/完整校验建议人工重试时携带的警告信息。 */
    warning?: string;
    /** 创建或清理阶段无法确认状态的组件 ID。 */
    uncertainWidgetIds?: string[];
    /** 无法确认组件或 layout 最终状态，需要人工检查。 */
    manualCheckRequired?: boolean;
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

function isValidLayoutItem(item: unknown): boolean {
    if (!isPlainObject(item)) return false;
    const i = item as Record<string, unknown>;
    if (typeof i.widgetId !== "string" || !i.widgetId.trim()) return false;
    if (typeof i.order !== "number" || !Number.isFinite(i.order) || i.order < 0 || Math.floor(i.order) !== i.order) return false;
    if (i.style !== undefined && i.style !== null && typeof i.style !== "string") return false;
    if (i.colSpan !== undefined && (typeof i.colSpan !== "number" || !Number.isFinite(i.colSpan) || i.colSpan <= 0 || Math.floor(i.colSpan) !== i.colSpan)) return false;
    if (i.rowSpan !== undefined && (typeof i.rowSpan !== "number" || !Number.isFinite(i.rowSpan) || i.rowSpan <= 0 || Math.floor(i.rowSpan) !== i.rowSpan)) return false;
    if (i.hasContent !== undefined && typeof i.hasContent !== "boolean") return false;
    return true;
}

/** 简单结构分类：仅区分旧公开模板、当前模板和无效数据。 */
function classifyTemplateStructure(value: unknown): "published-legacy" | "current" | "invalid" {
    if (!isPlainObject(value)) return "invalid";
    const t = value as Record<string, unknown>;
    const allowedKeys = new Set(["id", "name", "description", "createdAt", "updatedAt", "deviceId", "columns", "gap", "layoutItems", "widgetConfigs"]);
    if (Object.keys(t).some((key) => !allowedKeys.has(key))) return "invalid";

    const hasWC = t.widgetConfigs !== undefined && isPlainObject(t.widgetConfigs) && isJsonSafe(t.widgetConfigs);

    if (hasWC) {
        const forbiddenCurrentKeys = ["deviceId"];
        if (forbiddenCurrentKeys.some((key) => Object.prototype.hasOwnProperty.call(t, key))) return "invalid";
        return "current";
    }
    if (t.widgetConfigs === undefined) {
        if (t.deviceId !== undefined && typeof t.deviceId !== "string" && t.deviceId !== null) return "invalid";
        return "published-legacy";
    }
    // widgetConfigs 存在但无效
    return "invalid";
}

function isValidUserLayoutTemplate(value: unknown): value is UserLayoutTemplate {
    if (!isPlainObject(value)) return false;
    if (!isJsonSafe(value)) return false;
    const t = value as Record<string, unknown>;
    if (typeof t.id !== "string" || !t.id.trim()) return false;
    if (typeof t.name !== "string" || !t.name.trim()) return false;
    if (typeof t.createdAt !== "number" || !Number.isFinite(t.createdAt)) return false;
    if (typeof t.updatedAt !== "number" || !Number.isFinite(t.updatedAt)) return false;
    if (typeof t.columns !== "number" || !Number.isInteger(t.columns) || Number(t.columns) <= 0) return false;
    if (typeof t.gap !== "number" || !Number.isFinite(t.gap) || Number(t.gap) < 0) return false;
    if (t.description !== undefined && typeof t.description !== "string") return false;
    if (!Array.isArray(t.layoutItems)) return false;

    const seenWidgetIds = new Set<string>();
    const seenOrders = new Set<number>();
    for (const item of t.layoutItems) {
        if (!isValidLayoutItem(item)) return false;
        const widgetId = (item as Record<string, unknown>).widgetId as string;
        if (seenWidgetIds.has(widgetId)) return false;
        seenWidgetIds.add(widgetId);
        const order = (item as Record<string, unknown>).order as number;
        if (seenOrders.has(order)) return false;
        seenOrders.add(order);
    }

    // 使用统一结构分类决定格式是否有效。
    const structure = classifyTemplateStructure(value);
    if (structure === "invalid") return false;

    // 当前模板必须执行严格语义校验。
    if (structure === "current") {
        const widgetConfigs = t.widgetConfigs as Record<string, unknown>;
        for (let order = 0; order < t.layoutItems.length; order++) {
            if (!seenOrders.has(order)) return false;
        }

        // 非空 layoutItems 配空 widgetConfigs 必须拒绝。
        if (t.layoutItems.length > 0 && Object.keys(widgetConfigs).length === 0) return false;

        // widgetConfigs 的每个值都必须是可序列化普通对象。
        for (const config of Object.values(widgetConfigs)) {
            if (!isPlainObject(config) || !isJsonSafe(config)) return false;
            // 配置必须包含非空字符串 type（去除空格后仍非空）。
            const configType = (config as Record<string, unknown>).type;
            if (typeof configType !== "string" || !configType.trim()) return false;
        }

        // 每个 layout item 必须有且只有一个对应配置。
        for (const item of t.layoutItems) {
            const widgetId = (item as Record<string, unknown>).widgetId as string;
            if (!widgetConfigs[widgetId]) return false;
        }

        // widgetConfigs 不得包含 layoutItems 之外的额外 ID。
        for (const key of Object.keys(widgetConfigs)) {
            if (!seenWidgetIds.has(key)) return false;
        }
    }

    return true;
}

/**
 * 旧公开模板：published-legacy 结构（无 widgetConfigs）。
 */
function isPublishedLegacyTemplate(template: UserLayoutTemplate): template is PublishedLegacyUserLayoutTemplate {
    return classifyTemplateStructure(template) === "published-legacy";
}

function isCurrentUserLayoutTemplate(template: UserLayoutTemplate): template is CurrentUserLayoutTemplate {
    return classifyTemplateStructure(template) === "current";
}

export { isPublishedLegacyTemplate as isLegacyUserLayoutTemplate };

/**
 * 加载个人布局模板列表。
 */
function validateLoadedUserLayoutTemplates(data: unknown): UserLayoutTemplate[] {
    if (!Array.isArray(data)) {
        throw new Error("个人布局模板文件格式损坏：内容不是数组");
    }
    const valid = data.filter((item) => isValidUserLayoutTemplate(item));
    if (valid.length !== data.length) {
        throw new Error("个人布局模板文件包含无效条目，拒绝加载");
    }
    return toJsonSafeClone(valid);
}

async function decodeUserLayoutTemplateFile(raw: unknown): Promise<unknown> {
    if (Array.isArray(raw) || isPlainObject(raw)) return raw;

    let text: string;
    if (raw instanceof Blob) {
        text = await raw.text();
    } else if (typeof raw === "string") {
        text = raw;
    } else if (raw instanceof ArrayBuffer) {
        text = new TextDecoder().decode(raw);
    } else if (ArrayBuffer.isView(raw)) {
        const view = raw as ArrayBufferView;
        text = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    } else {
        throw new Error("个人布局模板文件读取结果类型无效");
    }

    if (!text.trim()) {
        throw new Error("个人布局模板文件存在但内容为空");
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`个人布局模板文件 JSON 损坏：${String(error)}`);
    }
}

export async function loadUserLayoutTemplates(plugin: any): Promise<UserLayoutTemplate[]> {
    let pluginError: unknown = null;
    try {
        const data = await plugin.loadData(USER_LAYOUT_TEMPLATE_FILE);
        if (Array.isArray(data)) {
            return validateLoadedUserLayoutTemplates(data);
        }
    } catch (error) {
        pluginError = error;
    }

    const path = `${getPluginStorageRoot(plugin)}/${USER_LAYOUT_TEMPLATE_FILE}`;
    const direct = await getFileOrNullChecked(path);
    if (direct === null) {
        if (pluginError) throw pluginError;
        return [];
    }
    return validateLoadedUserLayoutTemplates(await decodeUserLayoutTemplateFile(direct));
}

async function saveUserLayoutTemplates(plugin: any, templates: UserLayoutTemplate[]): Promise<void> {
    const normalized = normalizeUserLayoutTemplateList(templates);
    await plugin.saveData(USER_LAYOUT_TEMPLATE_FILE, normalized);
}

type LayoutCommitState = "notCommitted" | "committedWithWarning" | "uncertainManualCheck";

function classifyLayoutCommitState(originalLayout: unknown, nextLayout: unknown, observedLayout: unknown): LayoutCommitState {
    if (hasSameSemanticValue(observedLayout, originalLayout)) return "notCommitted";
    if (hasSameSemanticValue(observedLayout, nextLayout)) return "committedWithWarning";
    return "uncertainManualCheck";
}

type CoordinatedPostSaveState =
    | { state: "notCommitted" }
    | { state: "committed" }
    | { state: "committedWithWarning"; warning: string; manualCheckRequired?: boolean }
    | { state: "uncertainManualCheck"; reason: string };

function classifyCoordinatedPostSaveState(
    context: DeviceViewContext,
    originalLayout: unknown,
    nextLayout: unknown,
    target: LayoutTarget,
    observed: CoordinatedSnapshot,
): CoordinatedPostSaveState {
    try { assertExpectedLayoutSnapshot(observed.layout, context); } catch (error) {
        return { state: "uncertainManualCheck", reason: error instanceof Error ? error.message : "协调快照 context 无法确认" };
    }
    if (!observed.view || observed.view.deviceId !== context.scopeId || observed.view.surface !== "desktop-homepage") {
        return { state: "uncertainManualCheck", reason: "协调 view 与固定设备 context 不一致" };
    }
    const layoutState = classifyLayoutCommitState(originalLayout, nextLayout, observed.layout.layout);
    if (layoutState === "notCommitted") return { state: "notCommitted" };
    if (layoutState === "uncertainManualCheck") return { state: "uncertainManualCheck", reason: "layout 提交后处于第三种状态" };

    const viewUnchanged = observed.view.revision === target.viewRevision
        && hasSameSemanticValue(observed.view.config, target.viewConfig);
    const consistency = validateLayoutViewSectionConsistency(observed.layout.layout, context.scopeId, observed.view.config);
    if (!viewUnchanged || consistency.ok === false) {
        const detail = !viewUnchanged
            ? "view revision 或配置已变化"
            : `layout/view 不一致：${consistency.ok === false ? consistency.reason : "未知原因"}`;
        return { state: "committedWithWarning", warning: `布局已提交，但${detail}，请刷新页面并人工确认`, manualCheckRequired: true };
    }
    return { state: "committed" };
}

function validateUserLayoutTemplateList(templates: unknown): asserts templates is UserLayoutTemplate[] {
    if (!Array.isArray(templates)) throw new Error("个人布局模板列表必须是数组");
    const ids = new Set<string>();
    for (const template of templates) {
        if (!isValidUserLayoutTemplate(template)) throw new Error("个人布局模板列表包含无效条目，拒绝写入");
        if (ids.has(template.id)) throw new Error(`个人布局模板 ID 重复：${template.id}`);
        ids.add(template.id);
    }
}

function normalizeUserLayoutTemplateList(templates: UserLayoutTemplate[]): UserLayoutTemplate[] {
    const normalized = toJsonSafeClone(templates);
    validateUserLayoutTemplateList(normalized);
    return normalized;
}

type UserLayoutTemplateMutation<T> = (draft: UserLayoutTemplate[]) => { templates: UserLayoutTemplate[]; result: T } | Promise<{ templates: UserLayoutTemplate[]; result: T }>;

let userLayoutTemplateWriteQueue: Promise<unknown> = Promise.resolve();

async function mutateUserLayoutTemplates<T>(plugin: any, mutation: UserLayoutTemplateMutation<T>): Promise<T> {
    const execute = async (): Promise<T> => {
        const before = toJsonSafeClone(await loadUserLayoutTemplates(plugin));
        const { templates: next, result } = await mutation(before);
        const normalizedNext = normalizeUserLayoutTemplateList(Array.isArray(next) ? next : before);
        if (hasSameSemanticValue(normalizedNext, before)) {
            return result;
        }
        const latestBeforeWrite = await loadUserLayoutTemplates(plugin);
        if (!hasSameSemanticValue(latestBeforeWrite, before)) {
            throw new Error("个人布局模板列表已被并发修改，拒绝覆盖最新内容");
        }
        let writeError: unknown = null;
        try {
            await saveUserLayoutTemplates(plugin, normalizedNext);
        } catch (error) {
            writeError = error;
        }
        let after: UserLayoutTemplate[];
        try {
            after = await loadUserLayoutTemplates(plugin);
        } catch (error) {
            throw new Error(`个人布局模板列表写入后状态无法确认，请人工检查：${String(error)}`);
        }
        if (hasSameSemanticValue(after, normalizedNext)) return result;
        if (hasSameSemanticValue(after, before)) {
            if (writeError instanceof Error) throw writeError;
            throw new Error("个人布局模板列表确认未提交");
        }
        throw new Error("个人布局模板列表处于第三状态，请保留文件并人工检查");
    };
    const queued = userLayoutTemplateWriteQueue.then(execute, execute);
    userLayoutTemplateWriteQueue = queued;
    return queued as Promise<T>;
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

function resolveGridSpanFromStoredData(
    style: string | null,
    config: Record<string, unknown>,
): { colSpan: number; rowSpan: number } {
    const styleColSpan = extractGridSpanFromStyle(style, "column");
    const styleRowSpan = extractGridSpanFromStyle(style, "row");
    return {
        colSpan: styleColSpan || normalizePositiveInteger(config.colSize) || 1,
        rowSpan: styleRowSpan || normalizePositiveInteger(config.rowSize) || 1,
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

export function buildUserLayoutTemplateItemStyle(
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

/**
 * 按 order 升序稳定规范化 layoutItems。
 * 校验阶段已禁止重复 order，因此此处直接按 order 排序即可。
 */
function normalizeLayoutItemsByOrder<T extends { order: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.order - b.order);
}

function getEffectiveVisibleOrder(
    layout: any,
    deviceId: string | null,
): Array<{ id: string; style: string | null; index: number }> {
    const profile = layout?.profiles?.[deviceId ?? ""];
    const profileOrder = normalizeOrderItems(profile?.order);

    const result: Array<{ id: string; style: string | null; index: number }> = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < profileOrder.length; i++) {
        const item = profileOrder[i];
        if (!item.id) throw new Error("当前设备主主页 order 包含无效组件 ID");
        if (seenIds.has(item.id)) throw new Error(`当前设备主主页 order 包含重复组件 ${item.id}`);
        result.push({ ...item, index: i });
        seenIds.add(item.id);
    }

    return result;
}

// ---------------------------------------------------------------------------
// 统一布局目标解析
// ---------------------------------------------------------------------------

export interface LayoutTarget {
    /** 当前运行设备，仅供布局事务内部使用。 */
    deviceId: string;
    /** 当前目标中按顺序排列的组件 ID。 */
    orderedWidgetIds: string[];
    /** 当前目标中来自 layout.order 的真实有序 item。 */
    orderedLayoutItems: Array<{ id: string; style: string | null; index: number }>;
    /** 当前目标的列数。 */
    columns: number;
    /** 当前目标的间距。 */
    gap: number;
    /** 读取时的 layout revision。 */
    layoutRevision: number;
    /** 目标类型：完整主页 或 活动分栏。 */
    targetType: "homepage" | "section";
    /** 仅当 targetType==="section" 时有效，活动分栏 ID。 */
    activeSectionId?: string;
    /** 仅当 targetType==="section" 时有效，活动分栏当前成员。 */
    sectionWidgetIds?: string[];
    /** 只读 view 信息，用于写盘前一致性复核；模板不会保存。 */
    viewRevision: number;
    viewConfig: Record<string, unknown>;
}

function assertDesktopHomepageContext(context: DeviceViewContext): void {
    if (!context.scopeId || context.surface !== "desktop-homepage") {
        throw new Error("个人布局模板仅允许当前 deviceId + desktop-homepage context");
    }
}

function assertExpectedLayoutSnapshot(snapshot: LayoutSnapshot, context: DeviceViewContext): void {
    assertDesktopHomepageContext(context);
    if (snapshot.deviceId !== context.scopeId || snapshot.surface !== "desktop-homepage") {
        throw new Error("LayoutSnapshot 与固定设备 context 不一致");
    }
}

/**
 * 严格读取当前 deviceId + desktop-homepage 的最新协调状态，
 * 返回统一的布局目标对象（主页或活动分栏）。
 *
 * 规则：
 * - 未开启分栏：目标为完整主页，组件顺序为 profile 全局 order。
 * - 已开启分栏：目标是有效 activeSectionId 对应的分栏，组件顺序通过分栏 widgetIds 过滤全局 order 得到。
 * - 状态不完整、读取异常时直接停止，禁止回退或猜测。
 */
function resolveLayoutTargetFromSnapshot(
    snapshot: LayoutSnapshot,
    viewSettings: { revision: number; config: Record<string, unknown> },
): LayoutTarget {
    const layout = snapshot.layout;
    const deviceId = snapshot.deviceId;
    const profile = layout.profiles?.[deviceId];
    if (!profile) throw new Error("当前设备主主页 profile 缺失，无法解析布局目标");
    if (!Array.isArray(profile.order)) throw new Error("当前设备主主页 order 缺失，无法解析布局目标");
    const viewConfig = viewSettings.config;
    const consistency = validateLayoutViewSectionConsistency(layout, deviceId, viewConfig);
    if (consistency.ok === false) {
        throw new Error(`当前 layout/view 分栏状态不一致：${consistency.reason}`);
    }

    const sectionsEnabled = profile?.componentSectionsModeEnabled === true;

    if (!sectionsEnabled) {
        // 未开启分栏：返回完整主页布局目标。
        const globalOrder = getEffectiveVisibleOrder(layout, deviceId);
        const settings = resolveEffectiveWidgetLayoutSettings(layout, deviceId, {
            sectionsEnabled: false,
            sectionId: null,
        });
        return {
            deviceId,
            orderedWidgetIds: globalOrder.map((item) => item.id).filter(Boolean),
            orderedLayoutItems: globalOrder,
            columns: settings.widgetLayoutNumber,
            gap: settings.widgetGap,
            layoutRevision: snapshot.revision,
            targetType: "homepage",
            viewRevision: viewSettings.revision,
            viewConfig: structuredClone(viewConfig),
        };
    }

    // 分栏开启：必须存在有效 activeSectionId 和 sections。
    const activeSectionId = getActiveSectionIdFromLayout(layout, deviceId);
    if (!activeSectionId || !profile?.sections || Object.keys(profile.sections).length === 0) {
        throw new Error("分栏模式开启但缺少有效分栏配置，无法解析目标");
    }
    const activeSection = profile.sections[activeSectionId];
    if (!activeSection) {
        throw new Error(`活动分栏 ${activeSectionId} 在 layout.sections 中缺失`);
    }
    if (!validateFullProfileSectionsReadOnly(layout, deviceId, activeSectionId)) {
        throw new Error("分栏布局校验失败，无法解析目标");
    }

    const sectionWidgetIds = (activeSection.widgetIds || []).filter((id: string) => Boolean(id));
    // 通过分栏 widgetIds 过滤全局 order 得到活动分栏组件顺序。
    const globalOrder = getEffectiveVisibleOrder(layout, deviceId);
    const orderedWidgetIds = globalOrder
        .filter((item) => sectionWidgetIds.includes(item.id))
        .map((item) => item.id);
    const settings = resolveEffectiveWidgetLayoutSettings(layout, deviceId, {
        sectionsEnabled: true,
        sectionId: activeSectionId,
    });

    return {
        deviceId,
        orderedWidgetIds,
        orderedLayoutItems: globalOrder.filter((item) => sectionWidgetIds.includes(item.id)),
        columns: settings.widgetLayoutNumber,
        gap: settings.widgetGap,
        layoutRevision: snapshot.revision,
        targetType: "section",
        activeSectionId,
        sectionWidgetIds,
        viewRevision: viewSettings.revision,
        viewConfig: structuredClone(viewConfig),
    };
}

function resolveLayoutTargetFromCoordinatedSnapshot(
    context: DeviceViewContext,
    snapshot: CoordinatedSnapshot,
): LayoutTarget {
    assertExpectedLayoutSnapshot(snapshot.layout, context);
    if (!snapshot.view || snapshot.view.deviceId !== context.scopeId || snapshot.view.surface !== "desktop-homepage") {
        throw new Error("协调 view 与固定设备 context 不一致");
    }
    return resolveLayoutTargetFromSnapshot(snapshot.layout, snapshot.view);
}

export async function resolveCurrentLayoutTarget(plugin: any, fixedContext?: DeviceViewContext): Promise<LayoutTarget> {
    const context = fixedContext ?? getCurrentDeviceViewContext(plugin, "desktop-homepage");
    assertDesktopHomepageContext(context);
    const snapshot = await readCoordinatedSnapshotForContext(context);
    return resolveLayoutTargetFromCoordinatedSnapshot(context, snapshot);
}

// ---------------------------------------------------------------------------
// 模板归一化
// ---------------------------------------------------------------------------

/**
 * 将模板归一化为不含分栏信息的 SectionLayoutTemplatePayload。
 *
 * - 旧公开模板：使用 evaluator 返回的 validLayoutItems 和 widgetConfigs。
 * - 当前模板：直接使用内嵌 widgetConfigs，按规范顺序排列。
 */
async function normalizeTemplateToPayload(
    plugin: any,
    template: UserLayoutTemplate,
    fixedContext?: DeviceViewContext,
): Promise<SectionLayoutTemplatePayload> {
    const structure = classifyTemplateStructure(template);
    if (structure === "invalid") {
        throw new Error("模板格式损坏，无法归一化");
    }

    // 防御性校验：即使调用方未事先校验，也必须确保模板对象完整合法。
    // isValidUserLayoutTemplate 调用 classifyTemplateStructure，不会反向调用归一化，无递归风险。
    if (!isValidUserLayoutTemplate(template)) {
        throw new Error("模板格式完整校验失败，无法归一化");
    }

    if (structure === "published-legacy") {
        // 使用 evaluator 统一评估旧公开模板。
        const context = fixedContext ?? getCurrentDeviceViewContext(plugin, "desktop-homepage");
        const result = await evaluateLegacyTemplateAgainstCurrentDevice(template as PublishedLegacyUserLayoutTemplate, context);
        if (!result.ok) {
            throw new Error((result as { ok: false; reason: string }).reason);
        }
        const { evaluation } = result;
        if (evaluation.validLayoutItems.length === 0) {
            throw new Error("旧模板在当前设备无可恢复组件");
        }
        return {
            layoutItems: evaluation.validLayoutItems,
            widgetConfigs: evaluation.widgetConfigs,
            columns: template.columns,
            gap: template.gap,
        };
    }

    // current：直接使用内嵌 widgetConfigs（分类已通过，widgetConfigs 必然存在且合法），按规范顺序排列。
    return {
        layoutItems: normalizeLayoutItemsByOrder(toJsonSafeClone(template.layoutItems)),
        widgetConfigs: toJsonSafeClone((template as CurrentUserLayoutTemplate).widgetConfigs),
        columns: template.columns,
        gap: template.gap,
    };
}

// ---------------------------------------------------------------------------
// 模板捕获（使用统一目标）
// ---------------------------------------------------------------------------

/**
 * 从当前布局目标中捕获模板 payload。
 * 只读取目标中的组件配置；不保存分栏信息。
 */
function targetFingerprint(target: LayoutTarget): string {
    return JSON.stringify({
        deviceId: target.deviceId,
        targetType: target.targetType,
        activeSectionId: target.activeSectionId ?? null,
        orderedLayoutItems: target.orderedLayoutItems,
        columns: target.columns,
        gap: target.gap,
        layoutRevision: target.layoutRevision,
        viewRevision: target.viewRevision,
        viewConfig: toJsonSafeClone(target.viewConfig),
    });
}

interface TemplateCaptureIO {
    loadWidgetDocument(widgetId: string): Promise<DeviceWidgetDocument | null>;
    reloadTarget(): Promise<LayoutTarget>;
}

function readCapturedWidgetConfig(
    document: DeviceWidgetDocument | null,
    target: LayoutTarget,
    widgetId: string,
): { revision: number; config: Record<string, unknown> } {
    if (!document) throw new Error(`模板引用的组件 ${widgetId} 配置缺失`);
    if (document.deviceId !== target.deviceId || document.surface !== "desktop-homepage" || document.instanceId !== widgetId) {
        throw new Error(`组件 ${widgetId} 文档与固定设备 context 不一致`);
    }
    if (!Number.isInteger(document.revision) || document.revision <= 0) {
        throw new Error(`组件 ${widgetId} revision 无效`);
    }
    if (!isPlainObject(document.config) || typeof document.config.type !== "string" || !document.config.type.trim()) {
        throw new Error(`模板引用的组件 ${widgetId} 配置缺失或无效`);
    }
    return { revision: document.revision, config: toJsonSafeClone(document.config) };
}

async function captureTemplatePayloadCore(target: LayoutTarget, io: TemplateCaptureIO): Promise<SectionLayoutTemplatePayload> {
    const widgetConfigs: Record<string, Record<string, unknown>> = {};
    const layoutItems: SectionLayoutTemplatePayload["layoutItems"] = [];
    const storedItemById = new Map(target.orderedLayoutItems.map((item) => [item.id, item]));
    const initialWidgetState = new Map<string, { revision: number; config: Record<string, unknown> }>();

    for (let i = 0; i < target.orderedWidgetIds.length; i++) {
        const widgetId = target.orderedWidgetIds[i];
        const initial = readCapturedWidgetConfig(await io.loadWidgetDocument(widgetId), target, widgetId);
        initialWidgetState.set(widgetId, initial);
        const config = initial.config;
        widgetConfigs[widgetId] = config;
        const storedItem = storedItemById.get(widgetId);
        if (!storedItem) throw new Error(`当前布局 order 中缺少组件 ${widgetId} 的真实布局项`);
        const span = resolveGridSpanFromStoredData(storedItem.style, config);
        layoutItems.push({
            widgetId,
            order: i,
            style: storedItem.style,
            colSpan: span.colSpan,
            rowSpan: span.rowSpan,
            hasContent: true,
        });
    }

    // 读取全部组件后再次确认 layout revision 未变化。
    const latestTarget = await io.reloadTarget();
    if (targetFingerprint(latestTarget) !== targetFingerprint(target)) {
        throw new Error("捕获模板期间布局已发生变化，停止保存混合时间点模板");
    }

    for (const widgetId of target.orderedWidgetIds) {
        const initial = initialWidgetState.get(widgetId);
        if (!initial) throw new Error(`组件 ${widgetId} 初始捕获状态缺失`);
        const latest = readCapturedWidgetConfig(await io.loadWidgetDocument(widgetId), target, widgetId);
        if (latest.revision !== initial.revision || !hasSameSemanticValue(latest.config, initial.config)) {
            throw new Error(`捕获模板期间组件 ${widgetId} 已发生变化`);
        }
    }

    return {
        layoutItems,
        widgetConfigs: toJsonSafeClone(widgetConfigs),
        columns: target.columns,
        gap: target.gap,
    };
}

export async function saveCurrentDeviceAsLayoutTemplate(
    plugin: any,
    input: { name: string; description?: string },
): Promise<CurrentUserLayoutTemplate> {
    const context = getCurrentDeviceViewContext(plugin, "desktop-homepage");
    assertDesktopHomepageContext(context);
    const queueKey = `${context.scopeId}:desktop-homepage`;
    return runInSurfaceTransaction(queueKey, async () => {
        const normalizedName = input.name.trim();
        const normalizedDescription = input.description?.trim();
        if (!normalizedName) throw new Error("模板名称不能为空");
        const target = await resolveCurrentLayoutTarget(plugin, context);
        const payload = await captureTemplatePayload(plugin, context, target);
        const now = Date.now();
        const randomId = globalThis.crypto?.randomUUID?.();
        if (!randomId) throw new Error("当前环境无法生成安全模板 ID");
        const template: CurrentUserLayoutTemplate = toJsonSafeClone({
            id: `user_layout_${randomId}`,
            name: normalizedName,
            ...(normalizedDescription ? { description: normalizedDescription } : {}),
            createdAt: now,
            updatedAt: now,
            columns: payload.columns,
            gap: payload.gap,
            layoutItems: payload.layoutItems,
            widgetConfigs: payload.widgetConfigs,
        });
        if (!isValidUserLayoutTemplate(template) || !isCurrentUserLayoutTemplate(template)) throw new Error("新建布局模板结构校验失败");
        return mutateUserLayoutTemplates<CurrentUserLayoutTemplate>(plugin, (draft) => {
            if (draft.some((item) => item.id === template.id)) throw new Error("个人布局模板 ID 冲突，无法新增");
            return { templates: [...draft, template], result: template };
        });
    });
}

export async function getUserLayoutTemplateAvailability(
    plugin: any,
    template: UserLayoutTemplate,
    fixedContext?: DeviceViewContext,
    fixedTarget?: LayoutTarget,
): Promise<UserLayoutTemplateAvailability> {
    const templateColumns = template.columns;
    const isLegacy = classifyTemplateStructure(template) === "published-legacy";
    if (!isValidUserLayoutTemplate(template)) {
        return { available: false, reason: "模板格式损坏", currentColumns: 0, templateColumns, isLegacy };
    }

    if (!isDesktopDeviceProfileEnabled()) {
        return {
            available: false,
            reason: "个人布局模板仅支持主主页桌面设备布局",
            currentColumns: 0,
            templateColumns: template.columns,
            isLegacy,
        };
    }

    // 严格取得当前布局目标的列数（主页或活动分栏）。
    const context = fixedContext ?? getCurrentDeviceViewContext(plugin, "desktop-homepage");
    let currentColumns: number;
    try {
        const target = fixedTarget ?? await resolveCurrentLayoutTarget(plugin, context);
        if (target.deviceId !== context.scopeId) throw new Error("模板可用性目标与固定 context 不一致");
        currentColumns = target.columns;
    } catch (error) {
        return {
            available: false,
            reason: error instanceof Error ? error.message : "无法读取当前布局目标列数",
            currentColumns: 0,
            templateColumns: template.columns,
            isLegacy,
        };
    }

    if (template.columns !== currentColumns) {
        return {
            available: false,
            reason: `模板为 ${template.columns} 列，当前布局为 ${currentColumns} 列，请先调整当前布局列数`,
            currentColumns,
            templateColumns: template.columns,
            isLegacy,
        };
    }

    // 旧公开模板使用 evaluator 统一评估。
    if (isLegacy && isPublishedLegacyTemplate(template)) {
        const result = await evaluateLegacyTemplateAgainstCurrentDevice(template, context);
        if (!result.ok) {
            return {
                available: false,
                reason: (result as { ok: false; reason: string }).reason,
                currentColumns,
                templateColumns: template.columns,
                isLegacy: true,
                recoverableCount: 0,
                skippedCount: 0,
            };
        }
        const { evaluation } = result;
        const hasRecoverable = evaluation.recoverableCount > 0;
        return {
            available: hasRecoverable,
            reason: hasRecoverable
                ? (evaluation.skippedCount > 0 ? `可应用，将跳过 ${evaluation.skippedCount} 个历史缺失组件` : "")
                : "当前设备没有该旧模板中的可恢复组件",
            currentColumns,
            templateColumns: template.columns,
            isLegacy: true,
            recoverableCount: evaluation.recoverableCount,
            skippedCount: evaluation.skippedCount,
        };
    }

    // 当前模板：使用归一化判断可用性。
    let payload: SectionLayoutTemplatePayload;
    try {
        payload = await normalizeTemplateToPayload(plugin, template, context);
    } catch (error) {
        return {
            available: false,
            reason: error instanceof Error ? error.message : "模板归一化失败",
            currentColumns,
            templateColumns: template.columns,
            isLegacy: false,
        };
    }

    // 空模板不可添加。
    if (payload.layoutItems.length === 0) {
        return {
            available: false,
            reason: "空模板不可添加",
            currentColumns,
            templateColumns: template.columns,
            isLegacy: false,
        };
    }

    return {
        available: true,
        reason: "",
        currentColumns,
        templateColumns: template.columns,
        isLegacy: false,
    };
}

/** 旧模板评估可注入 I/O 接口。 */
interface LegacyTemplateEvaluatorIO {
    expectedDeviceId: string;
    expectedSurface: "desktop-homepage";
    loadLayoutSnapshot(): Promise<LayoutSnapshot>;
    loadWidgetDocument(widgetId: string): Promise<DeviceWidgetDocument | null>;
}

interface LegacyTemplateEvaluation {
    snapshot: LayoutSnapshot;
    currentOrderIds: Set<string>;
    /** 按规范顺序排列的有效 layoutItems。 */
    validLayoutItems: SectionLayoutTemplatePayload["layoutItems"];
    /** 与有效 item 一一对应的 widgetConfigs。 */
    widgetConfigs: Record<string, Record<string, unknown>>;
    /** 历史缺失的组件 ID。 */
    skippedWidgetIds: string[];
    /** 可恢复组件数。 */
    recoverableCount: number;
    /** 历史缺失组件数。 */
    skippedCount: number;
    /** 起始 layout revision。 */
    startRevision: number;
}

/**
 * 旧模板评估核心（可注入 I/O，用于测试和生产共享）。
 *
 * 规则：
 * - 模板 ID 不在当前 global order：认定为历史缺失，计入 skipped，不读取组件文件；
 * - 模板 ID 在当前 global order：读取完整组件文档并校验身份、revision、config；
 * - 全部初始读取后复核 layout（revision + 完整 JSON 语义）；
 * - layout 复核通过后二次复核每个组件文档（revision + config 语义）；
 * - 返回的 widgetConfigs 使用初始已确认的 JSON-safe clone。
 *
 * 供 preview、availability、apply 三个入口统一消费。
 */
async function evaluateLegacyTemplateCore(
    io: LegacyTemplateEvaluatorIO,
    template: PublishedLegacyUserLayoutTemplate,
): Promise<{ ok: true; evaluation: LegacyTemplateEvaluation } | { ok: false; reason: string }> {
    // ── 第一阶段：读取初始 layout 快照 ──
    let snapshot: LayoutSnapshot;
    try {
        snapshot = await io.loadLayoutSnapshot();
    } catch (error) {
        return {
            ok: false,
            reason: error instanceof Error ? error.message : "读取当前设备布局失败，无法判断旧模板可用性",
        };
    }

    if (snapshot.deviceId !== io.expectedDeviceId || snapshot.surface !== io.expectedSurface) {
        return { ok: false, reason: "旧公开模板评估快照与固定设备 context 不一致" };
    }
    const profile = snapshot.layout.profiles?.[snapshot.deviceId];
    if (!profile || !Array.isArray(profile.order)) {
        return { ok: false, reason: "当前运行设备 profile 或全局 order 缺失，无法评估旧公开模板" };
    }
    const currentOrderIds = new Set<string>();
    for (const item of normalizeOrderItems(profile?.order)) {
        if (!item.id) return { ok: false, reason: "当前运行设备全局 order 包含无效组件 ID" };
        if (currentOrderIds.has(item.id)) return { ok: false, reason: `当前运行设备全局 order 包含重复组件 ${item.id}` };
        currentOrderIds.add(item.id);
    }

    // ── 第二阶段：逐个读取组件完整文档，记录初始状态 ──
    interface InitialWidgetState {
        widgetId: string;
        revision: number;
        config: Record<string, unknown>;
    }
    const validLayoutItems: SectionLayoutTemplatePayload["layoutItems"] = [];
    const initialStates: InitialWidgetState[] = [];
    const skippedWidgetIds: string[] = [];
    let skippedCount = 0;

    for (const layoutItem of template.layoutItems) {
        if (!currentOrderIds.has(layoutItem.widgetId)) {
            // 模板 ID 不在全局 order 中：认定为历史缺失，不读取组件文件。
            skippedCount++;
            skippedWidgetIds.push(layoutItem.widgetId);
            continue;
        }

        // ID 在全局 order 中：读取完整组件文档。
        let doc: DeviceWidgetDocument | null = null;
        try {
            doc = await io.loadWidgetDocument(layoutItem.widgetId);
        } catch (error) {
            // 真实读取异常不能按历史缺失处理。
            return {
                ok: false,
                reason: error instanceof Error
                    ? `读取组件 ${layoutItem.widgetId} 文档失败：${error.message}`
                    : "读取旧模板组件文档失败",
            };
        }

        if (!doc) {
            return {
                ok: false,
                reason: `当前设备布局引用组件 ${layoutItem.widgetId} 文档缺失，视图不完整`,
            };
        }
        // 校验文档身份。
        if (doc.deviceId !== io.expectedDeviceId || doc.surface !== io.expectedSurface || doc.instanceId !== layoutItem.widgetId) {
            return {
                ok: false,
                reason: `组件 ${layoutItem.widgetId} 文档与固定设备 context 不一致`,
            };
        }
        // revision 必须为正整数。
        if (typeof doc.revision !== "number" || !Number.isInteger(doc.revision) || doc.revision <= 0) {
            return {
                ok: false,
                reason: `组件 ${layoutItem.widgetId} revision 无效`,
            };
        }
        // config 必须为 JSON-safe 普通对象且 type 为非空字符串。
        if (!isPlainObject(doc.config) || typeof doc.config.type !== "string" || !doc.config.type.trim() || !isJsonSafe(doc.config)) {
            return {
                ok: false,
                reason: `当前设备布局引用组件 ${layoutItem.widgetId} 配置缺失或无效，视图不完整`,
            };
        }

        validLayoutItems.push({ ...layoutItem });
        initialStates.push({
            widgetId: layoutItem.widgetId,
            revision: doc.revision,
            config: toJsonSafeClone(doc.config),
        });
    }

    // ── 第三阶段：完整复核 layout ──
    let latestSnapshot: LayoutSnapshot;
    try {
        latestSnapshot = await io.loadLayoutSnapshot();
    } catch (error) {
        return {
            ok: false,
            reason: error instanceof Error
                ? `评估后重读布局失败：${error.message}`
                : "评估后重读布局失败",
        };
    }
    if (
        latestSnapshot.deviceId !== io.expectedDeviceId
        || latestSnapshot.surface !== io.expectedSurface
        || latestSnapshot.revision !== snapshot.revision
    ) {
        return { ok: false, reason: "评估旧模板期间布局已发生变化，请重试" };
    }
    if (!hasSameSemanticValue(latestSnapshot.layout, snapshot.layout)) {
        return { ok: false, reason: "评估旧模板期间 layout 内容发生变化，请重试" };
    }

    // ── 第四阶段：二次复核组件文档 ──
    for (const state of initialStates) {
        let reDoc: DeviceWidgetDocument | null = null;
        try {
            reDoc = await io.loadWidgetDocument(state.widgetId);
        } catch (error) {
            return {
                ok: false,
                reason: error instanceof Error
                    ? `二次复核组件 ${state.widgetId} 失败：${error.message}`
                    : `二次复核组件 ${state.widgetId} 失败`,
            };
        }
        if (!reDoc) {
            return { ok: false, reason: `二次复核组件 ${state.widgetId} 文档消失` };
        }
        if (reDoc.deviceId !== io.expectedDeviceId || reDoc.surface !== io.expectedSurface || reDoc.instanceId !== state.widgetId) {
            return { ok: false, reason: `二次复核组件 ${state.widgetId} 文档身份异常` };
        }
        if (reDoc.revision !== state.revision) {
            return { ok: false, reason: `评估旧模板期间组件 ${state.widgetId} revision 发生变化，请重试` };
        }
        if (!isPlainObject(reDoc.config) || !isJsonSafe(reDoc.config) || !hasSameSemanticValue(reDoc.config, state.config)) {
            return { ok: false, reason: `评估旧模板期间组件 ${state.widgetId} 配置发生变化，请重试` };
        }
    }

    // ── 输出：使用初始已确认的 JSON-safe clone ──
    const widgetConfigs: Record<string, Record<string, unknown>> = {};
    for (const state of initialStates) {
        widgetConfigs[state.widgetId] = state.config;
    }
    const sortedValidLayoutItems = normalizeLayoutItemsByOrder(validLayoutItems);

    return {
        ok: true,
        evaluation: {
            snapshot,
            currentOrderIds,
            validLayoutItems: sortedValidLayoutItems,
            widgetConfigs,
            skippedWidgetIds,
            recoverableCount: initialStates.length,
            skippedCount,
            startRevision: snapshot.revision,
        },
    };
}

/**
 * 旧公开模板评估（生产入口）。
 */
async function evaluateLegacyTemplateAgainstCurrentDevice(
    template: PublishedLegacyUserLayoutTemplate,
    context: DeviceViewContext,
): Promise<{ ok: true; evaluation: LegacyTemplateEvaluation } | { ok: false; reason: string }> {
    assertDesktopHomepageContext(context);
    const io: LegacyTemplateEvaluatorIO = {
        expectedDeviceId: context.scopeId,
        expectedSurface: "desktop-homepage",
        loadLayoutSnapshot: async () => (await readCoordinatedSnapshotForContext(context)).layout,
        loadWidgetDocument: (widgetId) => readWidgetInstanceDocument(context, widgetId),
    };
    return evaluateLegacyTemplateCore(io, template);
}

export async function applyUserLayoutTemplateToCurrentDevice(
    plugin: any,
    templateId: string,
): Promise<ApplyUserLayoutTemplateResult> {
    const context = getCurrentDeviceViewContext(plugin, "desktop-homepage");
    assertDesktopHomepageContext(context);
    const templates = await loadUserLayoutTemplates(plugin);
    const template = templates.find((t) => t.id === templateId);

    if (!template) {
        return {
            success: false,
            reason: "找不到指定的个人布局模板",
            skippedWidgetIds: [],
        };
    }

    return appendTemplateToTarget(plugin, template, context);
}

function validateTemplatePayload(payload: SectionLayoutTemplatePayload): void {
    const seen = new Set<string>();
    if (payload.layoutItems.length === 0) throw new Error("空模板不可添加");
    for (const item of payload.layoutItems) {
        if (!item.widgetId.trim() || seen.has(item.widgetId)) throw new Error("模板组件 ID 缺失或重复");
        seen.add(item.widgetId);
        const config = payload.widgetConfigs[item.widgetId];
        if (!isPlainObject(config) || typeof config.type !== "string" || !config.type.trim() || !isJsonSafe(config)) {
            throw new Error(`模板组件 ${item.widgetId} 配置缺失或无效`);
        }
    }
    if (Object.keys(payload.widgetConfigs).some((id) => !seen.has(id))) throw new Error("模板包含未被布局引用的额外组件配置");
}

interface TemplateWidgetCreationIO {
    expectedDeviceId: string;
    expectedSurface: "desktop-homepage";
    create(widgetId: string, config: Record<string, unknown>): Promise<DeviceWidgetDocument>;
    read(widgetId: string): Promise<DeviceWidgetDocument | null>;
    createId(): string;
}

type TemplateWidgetCreationResult =
    | { ok: true; mapping: Map<string, string>; confirmed: CreatedWidgetRecord[] }
    | { ok: false; reason: string; confirmed: CreatedWidgetRecord[]; uncertainWidgetIds: string[] };

async function createTemplateWidgetInstancesCore(
    payload: SectionLayoutTemplatePayload,
    io: TemplateWidgetCreationIO,
): Promise<TemplateWidgetCreationResult> {
    validateTemplatePayload(payload);
    const mapping = new Map<string, string>();
    const confirmed: CreatedWidgetRecord[] = [];
    for (const item of payload.layoutItems) {
        const newId = io.createId();
        const nextConfig = toJsonSafeClone(payload.widgetConfigs[item.widgetId]);
        if (typeof nextConfig.blockId === "string") nextConfig.blockId = newId;
        if (typeof nextConfig.instanceId === "string") nextConfig.instanceId = newId;
        try {
            const created = await io.create(newId, nextConfig);
            if (
                created.deviceId !== io.expectedDeviceId
                || created.surface !== io.expectedSurface
                || created.instanceId !== newId
                || !Number.isInteger(created.revision)
                || created.revision <= 0
                || !hasSameSemanticValue(created.config, nextConfig)
            ) {
                return { ok: false, reason: `组件 ${newId} 创建结果无效`, confirmed, uncertainWidgetIds: [newId] };
            }
            confirmed.push({ widgetId: newId, revision: created.revision });
            mapping.set(item.widgetId, newId);
        } catch (error) {
            let observed: DeviceWidgetDocument | null;
            try {
                observed = await io.read(newId);
            } catch {
                return { ok: false, reason: `组件 ${newId} 创建后状态无法确认`, confirmed, uncertainWidgetIds: [newId] };
            }
            if (
                observed
                && observed.deviceId === io.expectedDeviceId
                && observed.surface === io.expectedSurface
                && observed.instanceId === newId
                && Number.isInteger(observed.revision)
                && observed.revision > 0
                && hasSameSemanticValue(observed.config, nextConfig)
            ) {
                confirmed.push({ widgetId: newId, revision: observed.revision });
                mapping.set(item.widgetId, newId);
                continue;
            }
            if (observed === null) {
                return {
                    ok: false,
                    reason: error instanceof Error ? error.message : `组件 ${newId} 创建失败`,
                    confirmed,
                    uncertainWidgetIds: [],
                };
            }
            return { ok: false, reason: `组件 ${newId} 创建结果与目标配置不一致`, confirmed, uncertainWidgetIds: [newId] };
        }
    }
    return { ok: true, mapping, confirmed };
}

// ---------------------------------------------------------------------------
// 追加模板到当前布局目标（核心实现）
// ---------------------------------------------------------------------------

async function appendTemplateToTarget(
    plugin: any,
    template: UserLayoutTemplate,
    context: DeviceViewContext,
): Promise<ApplyUserLayoutTemplateResult> {
    assertDesktopHomepageContext(context);
    const queueKey = `${context.scopeId}:desktop-homepage`;

    return runInSurfaceTransaction(queueKey, async (): Promise<ApplyUserLayoutTemplateResult> => {
        let target: LayoutTarget;
        try { target = await resolveCurrentLayoutTarget(plugin, context); } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : "无法解析当前布局目标", skippedWidgetIds: [] };
        }
        if (template.columns !== target.columns) {
            return { success: false, reason: `模板为 ${template.columns} 列，当前布局为 ${target.columns} 列，请先调整当前布局列数`, skippedWidgetIds: [] };
        }

        let payload: SectionLayoutTemplatePayload;
        let skippedWidgetIds: string[] = [];
        if (isPublishedLegacyTemplate(template)) {
            const evaluated = await evaluateLegacyTemplateAgainstCurrentDevice(template, context);
            if (evaluated.ok === false) return { success: false, reason: evaluated.reason, skippedWidgetIds: [] };
            if (evaluated.evaluation.startRevision !== target.layoutRevision) {
                return { success: false, reason: "评估旧模板期间当前布局已变化，请重试", skippedWidgetIds: [] };
            }
            skippedWidgetIds = evaluated.evaluation.skippedWidgetIds;
            payload = {
                layoutItems: evaluated.evaluation.validLayoutItems,
                widgetConfigs: evaluated.evaluation.widgetConfigs,
                columns: template.columns,
                gap: template.gap,
            };
        } else {
            payload = {
                layoutItems: normalizeLayoutItemsByOrder(toJsonSafeClone(template.layoutItems)),
                widgetConfigs: toJsonSafeClone(template.widgetConfigs),
                columns: template.columns,
                gap: template.gap,
            };
        }
        try { validateTemplatePayload(payload); } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : "模板内容无效", skippedWidgetIds };
        }
        if (typeof payload.gap !== "number" || !Number.isFinite(payload.gap) || payload.gap < 0) {
            return { success: false, reason: "模板 gap 无效（需为有限非负数）", skippedWidgetIds };
        }

        try {
            const preCreationSnapshot = await readCoordinatedSnapshotForContext(context);
            const preCreationTarget = resolveLayoutTargetFromCoordinatedSnapshot(context, preCreationSnapshot);
            if (targetFingerprint(preCreationTarget) !== targetFingerprint(target)) {
                return { success: false, reason: "创建组件前布局目标已发生变化，请重试", skippedWidgetIds };
            }
            if (preCreationTarget.columns !== payload.columns) {
                return { success: false, reason: `创建组件前列数校验失败：模板 ${payload.columns} 列，当前 ${preCreationTarget.columns} 列`, skippedWidgetIds };
            }
        } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : "创建组件前无法复核布局目标", skippedWidgetIds };
        }

        const creation = await createTemplateWidgetInstancesCore(payload, {
            expectedDeviceId: context.scopeId,
            expectedSurface: "desktop-homepage",
            createId: createWidgetInstanceId,
            create: (widgetId, config) => createWidgetInstanceConfig(context, widgetId, config),
            read: (widgetId) => readWidgetInstanceDocument(context, widgetId),
        });
        if (creation.ok === false) {
            const cleanup = await cleanupCreatedWidgetIds(plugin, context, creation.confirmed, { committed: false });
            const uncertainWidgetIds = [...new Set([...creation.uncertainWidgetIds, ...cleanup.uncertainWidgetIds])];
            return {
                success: false,
                reason: creation.reason,
                skippedWidgetIds,
                ...(uncertainWidgetIds.length ? { uncertainWidgetIds, manualCheckRequired: true } : {}),
            };
        }

        let latestTarget: LayoutTarget;
        let originalSnapshot: CoordinatedSnapshot;
        try {
            originalSnapshot = await readCoordinatedSnapshotForContext(context);
            latestTarget = resolveLayoutTargetFromCoordinatedSnapshot(context, originalSnapshot);
            if (targetFingerprint(latestTarget) !== targetFingerprint(target)) throw new Error("创建组件期间布局目标已发生变化");
        } catch (error) {
            const cleanup = await cleanupCreatedWidgetIds(plugin, context, creation.confirmed, { committed: false });
            return {
                success: false,
                reason: error instanceof Error ? error.message : "提交前重读布局失败",
                skippedWidgetIds,
                ...(cleanup.uncertainWidgetIds.length ? { uncertainWidgetIds: cleanup.uncertainWidgetIds, manualCheckRequired: true } : {}),
            };
        }

        const originalLayout = originalSnapshot.layout.layout;
        let nextLayout: any;
        try {
            nextLayout = makeAppendLayoutMutator(
                originalLayout,
                context.scopeId,
                latestTarget,
                payload,
                creation.mapping,
                originalLayout.profiles?.[context.scopeId],
            );
            validateNextLayoutBeforeSave(originalLayout, nextLayout, latestTarget, creation.mapping, payload);
        } catch (error) {
            const cleanup = await cleanupCreatedWidgetIds(plugin, context, creation.confirmed, { committed: false });
            return {
                success: false,
                reason: error instanceof Error ? error.message : "写盘前布局校验失败",
                skippedWidgetIds,
                ...(cleanup.uncertainWidgetIds.length ? { uncertainWidgetIds: cleanup.uncertainWidgetIds, manualCheckRequired: true } : {}),
            };
        }

        let saveError: unknown = null;
        try {
            await saveLayoutDataForContext(context, nextLayout, { expectedRevision: latestTarget.layoutRevision });
        } catch (error) {
            saveError = error;
        }

        let observed: CoordinatedSnapshot;
        try {
            observed = await readCoordinatedSnapshotForContext(context);
        } catch {
            return {
                success: false,
                reason: "layout 提交后无法读取协调快照，状态无法确认，需要人工检查",
                skippedWidgetIds,
                uncertainWidgetIds: creation.confirmed.map((item) => item.widgetId),
                manualCheckRequired: true,
            };
        }
        const postSaveState = classifyCoordinatedPostSaveState(context, originalLayout, nextLayout, latestTarget, observed);

        if (postSaveState.state === "committed") {
            return {
                success: true,
                reason: "",
                skippedWidgetIds,
                ...(saveError ? { warning: "布局已提交，但存储接口返回异常，请刷新页面确认" } : {}),
            };
        }
        if (postSaveState.state === "committedWithWarning") {
            return {
                success: true,
                reason: "",
                skippedWidgetIds,
                warning: postSaveState.warning,
                manualCheckRequired: postSaveState.manualCheckRequired,
            };
        }
        if (postSaveState.state === "uncertainManualCheck") {
            return {
                success: false,
                reason: `layout 提交状态无法确认：${postSaveState.reason}`,
                skippedWidgetIds,
                uncertainWidgetIds: creation.confirmed.map((item) => item.widgetId),
                manualCheckRequired: true,
            };
        }
        const cleanup = await cleanupCreatedWidgetIds(plugin, context, creation.confirmed, { committed: false });
        return {
            success: false,
            reason: saveError instanceof Error ? saveError.message : "layout 确认未提交",
            skippedWidgetIds,
            ...(cleanup.uncertainWidgetIds.length ? { uncertainWidgetIds: cleanup.uncertainWidgetIds, manualCheckRequired: true } : {}),
        };
    });
}

/**
 * 构造 layout mutator：基于模板 payload 和实例映射，将新组件追加到当前目标。
 * 不写 view.json，不清空已有组件，不修改分栏结构。
 */
function findSectionAppendInsertionIndex(
    globalOrder: Array<{ id: string }>,
    sections: Record<string, { widgetIds: string[] }>,
    sectionIds: string[],
    activeSectionId: string,
): number {
    const activeIndex = sectionIds.indexOf(activeSectionId);
    if (activeIndex < 0) throw new Error("活动分栏不在确定的分栏顺序中");
    const activeIds = new Set(sections[activeSectionId]?.widgetIds || []);
    if (activeIds.size > 0) {
        let last = -1;
        for (let i = 0; i < globalOrder.length; i++) if (activeIds.has(globalOrder[i].id)) last = i;
        if (last < 0) throw new Error("活动分栏成员未形成有效全局片段");
        return last + 1;
    }
    for (let i = activeIndex + 1; i < sectionIds.length; i++) {
        const nextIds = new Set(sections[sectionIds[i]]?.widgetIds || []);
        if (nextIds.size === 0) continue;
        const first = globalOrder.findIndex((item) => nextIds.has(item.id));
        if (first < 0) throw new Error("后续分栏成员未形成有效全局片段");
        return first;
    }
    for (let i = activeIndex - 1; i >= 0; i--) {
        const previousIds = new Set(sections[sectionIds[i]]?.widgetIds || []);
        if (previousIds.size === 0) continue;
        let last = -1;
        for (let j = 0; j < globalOrder.length; j++) if (previousIds.has(globalOrder[j].id)) last = j;
        if (last < 0) throw new Error("前置分栏成员未形成有效全局片段");
        return last + 1;
    }
    if (globalOrder.length !== 0) throw new Error("所有分栏均为空但全局 order 非空");
    return 0;
}

function validateTemplateInstanceMapping(
    payload: SectionLayoutTemplatePayload,
    instanceIdMapping: Map<string, string>,
): void {
    const sourceIds = new Set(payload.layoutItems.map((item) => item.widgetId));
    if (instanceIdMapping.size !== payload.layoutItems.length) throw new Error("模板实例映射数量不完整");
    const newIds = new Set<string>();
    for (const sourceId of sourceIds) {
        const newId = instanceIdMapping.get(sourceId);
        if (typeof newId !== "string" || !newId.trim()) throw new Error(`模板组件 ${sourceId} 缺少实例映射`);
        if (newIds.has(newId)) throw new Error(`模板实例映射包含重复新 ID ${newId}`);
        newIds.add(newId);
    }
    for (const sourceId of instanceIdMapping.keys()) {
        if (!sourceIds.has(sourceId)) throw new Error(`模板实例映射包含额外源 ID ${sourceId}`);
    }
}

function makeAppendLayoutMutator(
    currentLayout: any,
    deviceId: string,
    target: LayoutTarget,
    payload: SectionLayoutTemplatePayload,
    instanceIdMapping: Map<string, string>,
    currentProfile: any,
): any {
    validateTemplateInstanceMapping(payload, instanceIdMapping);
    // 构建新布局 items（按模板顺序）。
    const newLayoutItems: Array<{ id: string; style: string | null }> = [];
    for (const item of payload.layoutItems) {
        const newId = instanceIdMapping.get(item.widgetId);
        if (!newId) throw new Error(`模板组件 ${item.widgetId} 缺少实例映射`);
        newLayoutItems.push({
            id: newId,
            style: buildUserLayoutTemplateItemStyle(item.style, item.colSpan, item.rowSpan),
        });
    }

    const profile = {
        ...(currentProfile || { order: normalizeLayoutItems(currentLayout.order) }),
    };

    if (target.targetType === "homepage") {
        // 追加到全局 order 末尾；columns 只作兼容门槛，不修改存储字段；gap 作为模板布局属性应用。
        const globalOrder = normalizeLayoutItems(profile.order);
        profile.order = reindexLayoutItems([...globalOrder, ...newLayoutItems.map((item) => ({ ...item, index: 0 }))]);
        profile.widgetGap = payload.gap;
    } else {
        // 追加到活动分栏成员末尾，并在全局 order 中插入到该分栏连续片段末尾。
        const activeSectionId = target.activeSectionId!;
        const section = { ...(profile.sections?.[activeSectionId] || {}) };
        const existingWidgetIds: string[] = [...(section.widgetIds || [])];
        const globalOrder = normalizeLayoutItems(profile.order);
        const sectionIds = Object.keys(profile.sections || {});
        const insertionIndex = findSectionAppendInsertionIndex(globalOrder, profile.sections || {}, sectionIds, activeSectionId);

        // 更新分栏 widgetIds；columns 只作兼容门槛，不修改存储字段。
        section.widgetIds = [...existingWidgetIds, ...newLayoutItems.map((item) => item.id)];
        // gap：仅当有效 gap 与模板不同时才显式写入，避免将继承值显式化。
        if (target.gap !== payload.gap) {
            section.widgetGap = payload.gap;
        }
        profile.sections = { ...(profile.sections || {}), [activeSectionId]: section };

        // 在全局 order 中找到当前分栏的连续片段末尾并插入新 items。
        const newWithIndex = newLayoutItems.map((item) => ({ ...item, index: 0 }));
        const newOrder = [...globalOrder];
        newOrder.splice(insertionIndex, 0, ...newWithIndex);
        profile.order = reindexLayoutItems(newOrder);

        // 不修改 activeSectionId。
    }

    return {
        ...currentLayout,
        profiles: {
            ...(currentLayout.profiles || {}),
            [deviceId]: profile,
        },
    };
}

async function captureTemplatePayload(
    plugin: any,
    context: DeviceViewContext,
    target: LayoutTarget,
): Promise<SectionLayoutTemplatePayload> {
    assertDesktopHomepageContext(context);
    if (context.scopeId !== target.deviceId) throw new Error("捕获模板期间当前设备发生变化，已停止保存");
    return captureTemplatePayloadCore(target, {
        loadWidgetDocument: (widgetId) => readWidgetInstanceDocument(context, widgetId),
        reloadTarget: () => resolveCurrentLayoutTarget(plugin, context),
    });
}

function validateNextLayoutBeforeSave(
    originalLayout: any,
    nextLayout: any,
    target: LayoutTarget,
    instanceIdMapping: Map<string, string>,
    payload: SectionLayoutTemplatePayload,
): void {
    const originalProfile = originalLayout.profiles?.[target.deviceId];
    const nextProfile = nextLayout.profiles?.[target.deviceId];
    if (!originalProfile || !nextProfile) throw new Error("写盘前当前设备 profile 缺失");
    const originalProfileIds = Object.keys(originalLayout.profiles || {}).sort();
    const nextProfileIds = Object.keys(nextLayout.profiles || {}).sort();
    if (!hasSameSemanticValue(originalProfileIds, nextProfileIds)) throw new Error("写盘前 profile 集合被修改");
    for (const [deviceId, profile] of Object.entries(originalLayout.profiles || {})) {
        if (deviceId !== target.deviceId && !hasSameSemanticValue(profile, nextLayout.profiles?.[deviceId])) {
            throw new Error(`写盘前校验发现其他设备 profile ${deviceId} 被修改`);
        }
    }
    if (nextProfile.activeSectionId !== originalProfile.activeSectionId) throw new Error("写盘前校验发现 activeSectionId 被修改");
    if (nextProfile.componentSectionsModeEnabled !== originalProfile.componentSectionsModeEnabled) throw new Error("写盘前分栏模式被修改");
    if (nextProfile.widgetLayoutNumber !== originalProfile.widgetLayoutNumber) {
        throw new Error("写盘前主页列数被修改");
    }
    if (target.targetType === "homepage") {
        if (nextProfile.widgetGap !== payload.gap) {
            throw new Error("写盘前主页间距未正确应用模板 gap");
        }
    } else {
        if (nextProfile.widgetGap !== originalProfile.widgetGap) {
            throw new Error("写盘前分栏模式意外修改了主页间距");
        }
    }
    const consistency = validateLayoutViewSectionConsistency(nextLayout, target.deviceId, target.viewConfig);
    if (consistency.ok === false) throw new Error(`写盘前 layout/view 校验失败：${consistency.reason}`);

    const nextOrder = normalizeLayoutItems(nextProfile.order);
    const nextIds = nextOrder.map((item) => item.id);
    if (new Set(nextIds).size !== nextIds.length) throw new Error("写盘前全局 order 存在重复组件");
    const createdIds = [...instanceIdMapping.values()];
    for (const id of createdIds) if (!nextIds.includes(id)) throw new Error(`写盘前新组件 ${id} 未进入全局 order`);

    if (target.targetType === "section") {
        const activeSectionId = target.activeSectionId;
        if (!activeSectionId) throw new Error("写盘前活动分栏 ID 缺失");
        const sectionIds = Object.keys(nextProfile.sections || {});
        assertSectionLayoutInvariants(nextOrder, nextProfile.sections || {}, sectionIds, { requireAllAssigned: true });
        const activeIds = nextProfile.sections?.[activeSectionId]?.widgetIds || [];
        const expectedActiveIds = [...(originalProfile.sections?.[activeSectionId]?.widgetIds || []), ...createdIds];
        if (!hasSameSemanticValue(activeIds, expectedActiveIds)) throw new Error("写盘前新组件在活动分栏中的顺序不正确");
        const originalActive = originalProfile.sections?.[activeSectionId];
        const nextActive = nextProfile.sections?.[activeSectionId];
        if (originalActive?.widgetLayoutNumber !== nextActive?.widgetLayoutNumber) {
            throw new Error("写盘前活动分栏列数存储字段被修改");
        }
        const nextEffectiveGap = resolveEffectiveWidgetLayoutSettings(nextLayout, target.deviceId, {
            sectionsEnabled: true,
            sectionId: activeSectionId,
        }).widgetGap;
        if (nextEffectiveGap !== payload.gap) {
            throw new Error("写盘前活动分栏有效间距未正确应用模板 gap");
        }
        if (target.gap === payload.gap && originalActive?.widgetGap !== nextActive?.widgetGap) {
            throw new Error("写盘前活动分栏 gap 无语义变化但存储表示被修改");
        }
        for (const sectionId of sectionIds) {
            if (sectionId === activeSectionId) continue;
            if (!hasSameSemanticValue(originalProfile.sections?.[sectionId], nextProfile.sections?.[sectionId])) {
                throw new Error(`写盘前校验发现其他分栏 ${sectionId} 被修改`);
            }
        }
    } else if (!hasSameSemanticValue(originalProfile.sections || {}, nextProfile.sections || {})) {
        throw new Error("写盘前主页追加意外修改了分栏定义");
    }
}

interface CreatedWidgetRecord {
    widgetId: string;
    /** 创建后返回的真实 revision；创建失败后重读确认时可能为 null。 */
    revision: number | null;
    /** 创建确认为 uncertain 时标记，禁止自动删除。 */
    uncertain?: boolean;
}

interface CleanupCreatedWidgetIdsOptions {
    /** true 表示 layout/view 两份文档均已成功提交；false 表示已回滚或从未保留本次变更。 */
    committed?: boolean;
    /** true 表示无法确认补偿结果，禁止自动删除组件。 */
    manualCheckRequired?: boolean;
}

interface CleanupCreatedWidgetIdsIO {
    loadCoordinatedSnapshot(context: DeviceViewContext): Promise<CoordinatedSnapshot>;
    readWidgetDocument(context: DeviceViewContext, widgetId: string): Promise<DeviceWidgetDocument | null>;
    deleteWidget(context: DeviceViewContext, widgetId: string, expectedRevision: number): Promise<void>;
}

async function cleanupCreatedWidgetIdsCore(
    context: DeviceViewContext,
    createdWidgetIds: CreatedWidgetRecord[],
    options: CleanupCreatedWidgetIdsOptions,
    io: CleanupCreatedWidgetIdsIO,
): Promise<{ uncertainWidgetIds: string[] }> {
    assertDesktopHomepageContext(context);
    if (createdWidgetIds.length === 0) return { uncertainWidgetIds: [] };

    // P1: 仅在 committed=false 且 !manualCheckRequired 时清理本次新组件；
    // committed=true 或 uncertain 时禁止删除。
    const committed = options.committed === true;
    const manualCheckRequired = options.manualCheckRequired === true;
    if (committed || manualCheckRequired) {
        const uncertainIds = createdWidgetIds
            .filter((r) => r.uncertain)
            .map((r) => r.widgetId);
        return { uncertainWidgetIds: [...new Set(uncertainIds)] };
    }

    // 先收集标记为 uncertain 的记录。
    const uncertainWidgetIds: string[] = createdWidgetIds
        .filter((r) => r.uncertain)
        .map((r) => r.widgetId);

    let latestLayout: any;
    try {
        const snapshot = await io.loadCoordinatedSnapshot(context);
        assertExpectedLayoutSnapshot(snapshot.layout, context);
        latestLayout = snapshot.layout.layout;
    } catch {
        // 最新布局读取失败时无法确认引用关系，禁止删除任何本次组件。
        // 所有非 uncertain 的本次组件均标记为 uncertain。
        for (const record of createdWidgetIds) {
            if (!record.uncertain) {
                uncertainWidgetIds.push(record.widgetId);
            }
        }
        return { uncertainWidgetIds: [...new Set(uncertainWidgetIds)] };
    }

    // 使用 collectLayoutReferencedIdsForCleanup 遍历全局 order 与所有 sections（包括休眠 sections），
    // 避免误删仍在休眠分栏中引用的组件。
    const referencedIds = collectLayoutReferencedIdsForCleanup(latestLayout, context.scopeId);
    for (const record of createdWidgetIds) {
        if (record.uncertain) continue;
        if (referencedIds.has(record.widgetId)) {
            uncertainWidgetIds.push(record.widgetId);
            continue;
        }

        // 只有未引用且 revision 可确认时才允许删除。
        if (record.revision === null) {
            uncertainWidgetIds.push(record.widgetId);
            continue;
        }

        try {
            // 读取当前组件文档确认 revision 仍等于本次创建 revision。
            const currentDoc = await io.readWidgetDocument(context, record.widgetId);
            if (!currentDoc) {
                // 文件已不存在 → 无需清理。
                continue;
            }
            if (currentDoc.revision !== record.revision) {
                // revision 已变化：禁止删除。
                uncertainWidgetIds.push(record.widgetId);
                continue;
            }
        } catch {
            uncertainWidgetIds.push(record.widgetId);
            continue;
        }

        try {
            await io.deleteWidget(context, record.widgetId, record.revision);
            // 删除后确认文件确实不存在。
            const recheck = await io.readWidgetDocument(context, record.widgetId);
            if (recheck) {
                uncertainWidgetIds.push(record.widgetId);
            }
        } catch {
            // 删除失败：标记为 uncertain。
            uncertainWidgetIds.push(record.widgetId);
        }
    }

    return { uncertainWidgetIds: [...new Set(uncertainWidgetIds)] };
}

async function cleanupCreatedWidgetIds(
    _plugin: any,
    context: DeviceViewContext,
    createdWidgetIds: CreatedWidgetRecord[],
    options: CleanupCreatedWidgetIdsOptions = {},
): Promise<{ uncertainWidgetIds: string[] }> {
    return cleanupCreatedWidgetIdsCore(context, createdWidgetIds, options, {
        loadCoordinatedSnapshot: (fixedContext) => readCoordinatedSnapshotForContext(fixedContext),
        readWidgetDocument: (fixedContext, widgetId) => readWidgetInstanceDocument(fixedContext, widgetId),
        deleteWidget: (fixedContext, widgetId, expectedRevision) => deleteWidgetInstance(fixedContext, widgetId, expectedRevision),
    });
}

export async function deleteUserLayoutTemplate(plugin: any, templateId: string): Promise<boolean> {
    return mutateUserLayoutTemplates<boolean>(plugin, (draft) => {
        const exists = draft.some((t) => t.id === templateId);
        if (!exists) return { templates: draft, result: false };
        return { templates: draft.filter((t) => t.id !== templateId), result: true };
    });
}

export async function updateUserLayoutTemplateFromCurrentDevice(
    plugin: any,
    templateId: string,
    input?: { name?: string; description?: string },
): Promise<CurrentUserLayoutTemplate | null> {
    const context = getCurrentDeviceViewContext(plugin, "desktop-homepage");
    assertDesktopHomepageContext(context);
    const queueKey = `${context.scopeId}:desktop-homepage`;
    return runInSurfaceTransaction(queueKey, async () => {
        const target = await resolveCurrentLayoutTarget(plugin, context);
        const payload = await captureTemplatePayload(plugin, context, target);
        return mutateUserLayoutTemplates<CurrentUserLayoutTemplate | null>(plugin, async (draft) => {
            const idx = draft.findIndex((t) => t.id === templateId);
            if (idx === -1) return { templates: draft, result: null };
            const existing = draft[idx];
            const normalizedName = input?.name === undefined ? existing.name.trim() : input.name.trim();
            if (!normalizedName) throw new Error("模板名称不能为空");
            const normalizedDescription = input?.description === undefined ? existing.description?.trim() : input.description.trim();
            const updated: CurrentUserLayoutTemplate = toJsonSafeClone({
                id: existing.id,
                name: normalizedName,
                ...(normalizedDescription ? { description: normalizedDescription } : {}),
                createdAt: existing.createdAt,
                updatedAt: Date.now(),
                columns: payload.columns,
                gap: payload.gap,
                layoutItems: payload.layoutItems,
                widgetConfigs: payload.widgetConfigs,
            });
            if (!isValidUserLayoutTemplate(updated) || !isCurrentUserLayoutTemplate(updated)) {
                throw new Error("更新后的布局模板结构校验失败");
            }
            const next = [...draft];
            next[idx] = updated;
            return { templates: next, result: updated };
        });
    });
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
    "accounting": "记账",
    "stikynot": "便签",
};

function getWidgetTypeDisplayName(widgetType: string): string {
    return WIDGET_TYPE_DISPLAY_NAMES[widgetType] ?? widgetType;
}

export async function buildUserLayoutTemplatePreview(
    plugin: any,
    template: UserLayoutTemplate,
    fixedContext?: DeviceViewContext,
): Promise<UserLayoutTemplatePreview> {
    const structure = classifyTemplateStructure(template);
    if (structure === "invalid") {
        throw new Error("模板格式损坏，无法预览");
    }

    const items: UserLayoutTemplatePreviewItem[] = [];
    const isLegacy = structure === "published-legacy";

    // 旧公开模板预览使用 evaluator 统一评估。
    let legacyEvaluation: LegacyTemplateEvaluation | null = null;
    if (isLegacy && isPublishedLegacyTemplate(template)) {
        const context = fixedContext ?? getCurrentDeviceViewContext(plugin, "desktop-homepage");
        const result = await evaluateLegacyTemplateAgainstCurrentDevice(template, context);
        if (!result.ok) {
            throw new Error((result as { ok: false; reason: string }).reason);
        }
        legacyEvaluation = result.evaluation;
    }

    // 构建预览项的辅助函数。
    const buildPreviewItem = (
        layoutItem: UserLayoutTemplate["layoutItems"][number],
        config: Record<string, unknown> | null,
        missing: boolean,
    ): UserLayoutTemplatePreviewItem => {
        let widgetType = "unknown";
        let displayName = "";
        let placeholder = false;

        if (config) {
            const configAny = config as any;
            widgetType = configAny.type ?? configAny.data?.type ?? "unknown";
            const userTitle =
                configAny.title ??
                configAny.name ??
                configAny.label ??
                configAny.data?.title ??
                configAny.data?.name ??
                configAny.data?.label;
            displayName = userTitle ?? getWidgetTypeDisplayName(widgetType);
            if (!displayName && widgetType === "unknown") {
                displayName = layoutItem.widgetId;
            }
        } else if (layoutItem.hasContent === false) {
            placeholder = true;
            widgetType = "placeholder";
            displayName = "未设置内容";
        } else if (missing) {
            widgetType = "missing";
            displayName = "组件已不存在";
        }

        const colSpan = normalizePositiveInteger(layoutItem.colSpan) > 0
            ? normalizePositiveInteger(layoutItem.colSpan)
            : extractGridSpanFromStyle(layoutItem.style, "column") || 1;
        const rowSpan = normalizePositiveInteger(layoutItem.rowSpan) > 0
            ? normalizePositiveInteger(layoutItem.rowSpan)
            : extractGridSpanFromStyle(layoutItem.style, "row") || 1;

        return {
            widgetId: layoutItem.widgetId,
            order: layoutItem.order,
            style: layoutItem.style,
            widgetType,
            displayName,
            missing,
            placeholder,
            colSpan,
            rowSpan,
        };
    };

    if (isLegacy && legacyEvaluation) {
        // 旧公开模板：基于 evaluator 返回的 validLayoutItems 和 skippedWidgetIds 生成预览。
        // 有效项（已按 order 排序）。
        for (const layoutItem of legacyEvaluation.validLayoutItems) {
            const config = legacyEvaluation.widgetConfigs[layoutItem.widgetId] ?? null;
            items.push(buildPreviewItem(layoutItem, config, false));
        }
        // 跳过的项（历史缺失）。
        for (const widgetId of legacyEvaluation.skippedWidgetIds) {
            const originalItem = template.layoutItems.find((item) => item.widgetId === widgetId);
            if (originalItem) {
                items.push(buildPreviewItem(originalItem, null, true));
            }
        }
    } else {
        // 当前模板：直接使用内嵌 widgetConfigs，按规范顺序排列。
        const sortedLayoutItems = normalizeLayoutItemsByOrder(template.layoutItems);
        for (const layoutItem of sortedLayoutItems) {
            const config = (template.widgetConfigs?.[layoutItem.widgetId] as Record<string, unknown>) ?? null;
            items.push(buildPreviewItem(layoutItem, config, false));
        }
    }

    // 最终按 order 排序（确保 skipped 项也按正确顺序）。
    items.sort((a, b) => a.order - b.order);

    return {
        columns: template.columns,
        gap: template.gap,
        items,
    };
}
