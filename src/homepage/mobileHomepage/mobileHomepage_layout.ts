import type { Plugin } from "siyuan";
import { WidgetBlock } from "./mobileWidgetBlock";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import { ensureCurrentDeviceViewReady } from "@/homepage/deviceView/deviceViewReadiness";
import { readDeviceViewLayout, updateDeviceViewLayout } from "@/homepage/deviceView/deviceViewStorage";
import { loadWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
import { stringifyWidgetConfigForMount, type LayoutItem } from "../../components/utils/widgetBlock/utils/layout-shared";
import { mapWithConcurrency } from "@/utils/async/mapWithConcurrency";
import { shouldClearMobileConfirmedEmpty } from "../deviceView/confirmedEmptyLayout";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";
import {
    applyMobileSectionOperation,
    readMobileSectionState,
    type MobileSectionOperation,
    type MobileSectionState,
} from "./mobileSectionLayout";

export const MOBILE_LAYOUT_SURFACE = "mobile-homepage" as const;

/**
 * 移动主页乐观并发冲突：用户编辑 DOM 所依据的 layout revision 与当前 storage 不一致。
 * 属于正常并发冲突（用户与 Agent / 其他窗口同时编辑），不是存储失败。
 */
export class MobileLayoutRevisionConflictError extends Error {
    public readonly expectedRevision: number;
    public readonly actualRevision: number;
    constructor(expectedRevision: number, actualRevision: number) {
        super(`移动主页布局已被其他操作修改：期望 revision ${expectedRevision}，当前 ${actualRevision}`);
        this.name = "MobileLayoutRevisionConflictError";
        this.expectedRevision = expectedRevision;
        this.actualRevision = actualRevision;
    }
}

// Module-level serial save queue for mobile homepage (single shared scope).
// Ensures saves execute in call order: drag-1 → drag-2 → click-完成.
// Previous failures do not block subsequent saves; each caller receives the real task Promise.
let mobileLayoutSaveQueue: Promise<void> = Promise.resolve();

function validateLayoutItems(items: LayoutItem[]): LayoutItem[] {
    const seen = new Set<string>();
    return items.map((item, index) => {
        if (!item.id) throw new Error(`移动主页布局第 ${index + 1} 项缺少组件 ID`);
        if (seen.has(item.id)) throw new Error(`移动主页布局包含重复组件 ${item.id}`);
        seen.add(item.id);
        return { ...item, index };
    });
}

function readCurrentOrder(container: Element): LayoutItem[] {
    return validateLayoutItems(Array.from(container.children)
        .filter((element): element is HTMLElement => element instanceof HTMLElement && element.classList.contains("widget-block") && Boolean(element.id))
        .map((element, index) => ({ id: element.id, style: element.getAttribute("style"), index })));
}

async function getReadyContext(plugin: Plugin): Promise<DeviceViewContext> {
    const context = getCurrentDeviceViewContext(plugin, MOBILE_LAYOUT_SURFACE);
    await ensureCurrentDeviceViewReady(context);
    return context;
}

/**
 * 移动主页“已确认空布局”双读校验：
 * 只有第二次读取仍能读到 layout、revision 与第一次一致、order 仍为空时，
 * 才允许清空现有健康组件。任一不满足都返回 false，保留现有 DOM，由 latest-wins 重新处理。
 */
async function verifyMobileEmptyLayout(context: DeviceViewContext, expectedRevision: number): Promise<boolean> {
    const second = await readDeviceViewLayout(context);
    let secondOrderEmpty = false;
    if (second) {
        try {
            secondOrderEmpty = validateLayoutItems(second.order).length === 0;
        } catch {
            secondOrderEmpty = false;
        }
    }
    return shouldClearMobileConfirmedEmpty({
        firstReadSucceeded: true,
        firstOrderEmpty: true,
        secondLayoutExists: second !== null,
        secondRevisionMatches: second !== null && second.revision === expectedRevision,
        secondOrderEmpty,
    });
}

export interface MobileSaveLayoutResult {
    /** 本次成功提交后的真实 layout revision。 */
    committedRevision: number;
    sectionState: MobileSectionState;
}

/**
 * 保存移动主页布局（乐观并发控制）。
 *
 * options.expectedRevision 表示当前 DOM 所依据的 layout revision：
 * - 进入编辑会话时记录（editBaseLayoutRevision）；
 * - 提交时若 storage revision 已变化，抛出 MobileLayoutRevisionConflictError，绝不覆盖；
 * - 不传时保持原兼容行为（无并发保护）。
 *
 * 返回真实 committedRevision，供连续拖动/多次保存更新 base revision。
 */
export async function saveLayout(
    plugin: Plugin,
    containerEl: HTMLElement | null,
    options: { expectedRevision?: number; sectionOperation?: MobileSectionOperation } = {},
): Promise<MobileSaveLayoutResult> {
    // Must receive an explicit container element — no global DOM fallback.
    // This prevents saving the wrong instance when multiple mobile homepage
    // instances coexist (e.g. preview + settings dialog).
    if (!containerEl || !(containerEl instanceof HTMLElement)) {
        throw new Error("移动主页保存失败：未传入有效的容器元素");
    }

    // Capture DOM snapshot synchronously BEFORE any await.
    // If we wait until the queue processes this task, the DOM may have changed
    // due to subsequent edits or component destruction.
    const snapshot = readCurrentOrder(containerEl);

    // Serial save queue: chain tasks so they execute one at a time in call order.
    const previous = mobileLayoutSaveQueue;

    let resolveTask!: (value: MobileSaveLayoutResult) => void;
    let rejectTask!: (reason: unknown) => void;
    const taskPromise = new Promise<MobileSaveLayoutResult>((resolve, reject) => {
        resolveTask = resolve;
        rejectTask = reject;
    });

    const queued = previous.catch(() => undefined).then(async () => {
        let context: DeviceViewContext;
        try {
            context = await getReadyContext(plugin);

            // 进入写队列后读取最新 revision；若与编辑会话 base 不一致，直接拒绝覆盖。
            if (options.expectedRevision !== undefined) {
                const current = await readDeviceViewLayout(context);
                if (!current) throw new Error("移动主页 layout.json 缺失，拒绝保存");
                if (current.revision !== options.expectedRevision) {
                    throw new MobileLayoutRevisionConflictError(options.expectedRevision, current.revision);
                }
            }

            // 传递 expectedRevision 作为写队列内的第二层并发保护（防 read→write 竞态）。
            const result = await updateDeviceViewLayout(
                context,
                (latest) => applyMobileSectionOperation({ ...latest, order: snapshot }, options.sectionOperation),
                { expectedRevision: options.expectedRevision },
            );

            // Post-save semantic verification against the captured snapshot
            const resultIds = result.order.map((item) => item.id);
            const snapshotIds = snapshot.map((item) => item.id);
            if (
                resultIds.length !== snapshotIds.length
                || !resultIds.every((id, i) => id === snapshotIds[i])
            ) {
                throw new Error("移动主页布局保存后校验失败：组件顺序与快照不一致");
            }
            for (let i = 0; i < snapshot.length; i++) {
                if (result.order[i].style !== snapshot[i].style) {
                    throw new Error(
                        `移动主页布局保存后校验失败：组件 ${snapshot[i].id} 的 style 与快照不一致`,
                    );
                }
                if (result.order[i].index !== snapshot[i].index) {
                    throw new Error(
                        `移动主页布局保存后校验失败：组件 ${snapshot[i].id} 的 index 与快照不一致`,
                    );
                }
            }
            const assignment = options.sectionOperation?.type === "assign"
                ? options.sectionOperation
                : null;
            if (assignment) {
                const assignedSections = Object.entries(result.sections || {})
                    .filter(([, section]) => section.widgetIds.includes(assignment.widgetId))
                    .map(([sectionId]) => sectionId);
                if (
                    assignedSections.length !== 1
                    || assignedSections[0] !== assignment.sectionId
                ) {
                    throw new Error("移动主页分区设置保存后校验失败");
                }
            }

            resolveTask({ committedRevision: result.revision, sectionState: readMobileSectionState(result) });
        } catch (error) {
            // 竞态：预检与写队列之间可能被并发更新，转换为结构化冲突错误。
            if (options.expectedRevision !== undefined && !(error instanceof MobileLayoutRevisionConflictError)) {
                try {
                    const latest = await readDeviceViewLayout(context);
                    if (latest && latest.revision !== options.expectedRevision) {
                        rejectTask(new MobileLayoutRevisionConflictError(options.expectedRevision, latest.revision));
                        return;
                    }
                } catch {
                    // 忽略二级读取失败，抛原始错误
                }
            }
            rejectTask(error);
        }
    });

    // Update queue tail: absorb errors so the next task still runs.
    mobileLayoutSaveQueue = queued.catch(() => undefined);

    return taskPromise;
}

export interface MobileRestoreLayoutResult {
    /** 本次成功恢复所依据的真实 layout revision；未成功恢复时为 null。 */
    layoutRevision: number | null;
    status: "ready" | "incomplete";
    /** 本次是否执行了“已确认空布局”清空。 */
    emptyCleared: boolean;
    sectionState: MobileSectionState;
}

export async function restoreLayout(
    plugin: Plugin,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    containerEl?: HTMLElement | null,
    runtimeContext: { previewMode?: boolean; deviceViewContext?: DeviceViewContext; confirmedEmptyLayout?: boolean } = {},
): Promise<MobileRestoreLayoutResult> {
    const { confirmedEmptyLayout = false, ...widgetRuntimeContext } = runtimeContext;
    const container = containerEl || document.querySelector(".mobile-homepage-widget");
    if (!(container instanceof HTMLElement)) return { layoutRevision: null, status: "incomplete", emptyCleared: false, sectionState: readMobileSectionState(null) };
    container.dataset.layoutRestoreState = "restoring";
    const context = runtimeContext.deviceViewContext || await getReadyContext(plugin);

    let layout;
    try {
        layout = await readDeviceViewLayout(context);
        if (!layout) throw new Error("移动主页 layout.json 缺失");
    } catch (error) {
        container.dataset.layoutRestoreState = "incomplete";
        console.warn("[MobileLayout] 布局暂时不可读，保留已挂载组件:", error);
        return { layoutRevision: null, status: "incomplete", emptyCleared: false, sectionState: readMobileSectionState(null) };
    }
    const renderedRevision = layout.revision;
    const sectionState = readMobileSectionState(layout);

    const order = validateLayoutItems(layout.order);
    const prepared: Array<{ item: LayoutItem; contentJson: string }> = [];
    const existing = new Map<string, HTMLElement>();
    for (const child of Array.from(container.children)) {
        if (child instanceof HTMLElement && child.classList.contains("widget-block") && child.id) existing.set(child.id, child);
    }
    if (order.length === 0 && [...existing.values()].some((element) => (element as any).__widgetBlockInstance?.hasMountedContent?.())) {
        if (confirmedEmptyLayout !== true) {
            // 普通恢复保护：同步临时空读/暂不可读时保留已挂载健康组件。
            container.dataset.layoutRestoreState = "incomplete";
            console.warn("[MobileLayout] 空布局与当前健康组件冲突，本轮保留已挂载组件");
            return { layoutRevision: renderedRevision, status: "incomplete", emptyCleared: false, sectionState };
        }
        // 已验证的合法空布局（Agent external refresh）：双读确认 storage 仍为空后才允许清空。
        const confirmedEmpty = await verifyMobileEmptyLayout(context, layout.revision);
        if (!confirmedEmpty) {
            // 双读不一致（例如并发写入了新组件）：停止本轮清空，保留现有 DOM，
            // pending 由 latest-wins 重新处理。
            container.dataset.layoutRestoreState = "incomplete";
            return { layoutRevision: renderedRevision, status: "incomplete", emptyCleared: false, sectionState };
        }
        // 确认仍为空：正常 destroy 每个 widget runtime instance 后再移除元素。
        for (const element of existing.values()) {
            try {
                (element as any).__widgetBlockInstance?.destroy?.();
            } catch {
                // 忽略单个实例销毁失败
            }
            element.remove();
        }
        container.dataset.mobileConfirmedEmptyCleared = "1";
        container.dataset.layoutRestoreState = "ready";
        return { layoutRevision: renderedRevision, status: "ready", emptyCleared: true, sectionState };
    }

    let allWidgetsComplete = true;
    const widgetReadResults = await mapWithConcurrency(order, 4, async (item) => {
        const current = existing.get(item.id);
        if ((current as any)?.__widgetBlockInstance?.hasMountedContent?.()) {
            return { item, alreadyHealthy: true as const };
        }
        try {
            const config = await loadWidgetInstanceConfig(context, item.id);
            const contentJson = stringifyWidgetConfigForMount(config);
            if (!contentJson) throw new Error(`移动组件 ${item.id} 配置缺失或无效`);
            return { item, alreadyHealthy: false as const, contentJson };
        } catch (error) {
            return {
                item,
                alreadyHealthy: false as const,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    });
    for (const result of widgetReadResults) {
        if (result.alreadyHealthy) continue;
        if ("error" in result) {
            allWidgetsComplete = false;
            console.warn(`[MobileLayout] 组件 ${result.item.id} 暂时无法恢复，已继续处理其他健康组件:`, result.error);
            continue;
        }
        prepared.push({ item: result.item, contentJson: result.contentJson });
    }

    for (const { item, contentJson } of prepared) {
        let instance: WidgetBlock | null = null;
        try {
            instance = new WidgetBlock(plugin, currentBlockForSettingsRef, item.id, item.style || undefined, "", {
                ...widgetRuntimeContext,
                deviceViewContext: context,
            });
            const old = existing.get(item.id);
            if (old?.parentElement === container) {
                (old as any).__widgetBlockInstance?.destroy?.();
                old.replaceWith(instance.element);
            } else {
                container.appendChild(instance.element);
            }
            instance.loadcontent = contentJson;
            instance.updateContent(contentJson, { deviceViewContext: context });
            existing.set(item.id, instance.element);
        } catch (error) {
            allWidgetsComplete = false;
            try {
                instance?.destroy();
            } catch {
                // 构造函数失败时实例可能尚未赋值；清理失败不能掩盖单组件隔离。
            }
            instance?.element.remove();
            existing.delete(item.id);
            console.warn(`[MobileLayout] 组件 ${item.id} 挂载失败，已保留其他健康组件:`, error);
        }
    }

    const expected = new Set(order.map((item) => item.id));
    if (allWidgetsComplete) {
        for (const [id, element] of existing) {
            if (expected.has(id)) continue;
            (element as any).__widgetBlockInstance?.destroy?.();
            element.remove();
        }
    }
    for (const item of order) {
        const element = existing.get(item.id);
        if (element) container.appendChild(element);
    }
    const healthyCount = order.filter((item) => (existing.get(item.id) as any)?.__widgetBlockInstance?.hasMountedContent?.()).length;
    const allHealthy = allWidgetsComplete && healthyCount === order.length;
    container.dataset.layoutRestoreState = allHealthy ? "ready" : "incomplete";
    return { layoutRevision: renderedRevision, status: allHealthy ? "ready" : "incomplete", emptyCleared: false, sectionState };
}
