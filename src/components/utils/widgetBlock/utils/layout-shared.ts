import type { Plugin } from 'siyuan';
import { getLocalDeviceId, isDesktopDeviceProfileEnabled } from "@/homepage/utils/deviceProfile";

export interface SaveLayoutOptions {
    containerSelector: string;
    layoutFileName: string;
}

export interface RestoreLayoutOptions {
    containerSelector: string;
    layoutFileName: string;
    WidgetBlockClass: any;
}

export interface LayoutItem {
    id: string;
    style: string | null;
    index: number;
}

export interface WidgetLayoutData {
    order?: LayoutItem[];
    defaultOrder?: LayoutItem[];
    profiles?: Record<string, {
        order: LayoutItem[];
        widgetLayoutNumber?: number;
        widgetGap?: number;
        hiddenWidgetIds?: string[];
    }>;
    widgetLayoutNumber?: number;
    widgetGap?: number;
}

function normalizeLayoutItem(item: unknown): LayoutItem | null {
    if (typeof item !== "object" || item === null) return null;
    const raw = item as Record<string, unknown>;
    return {
        id: typeof raw.id === "string" ? raw.id : "",
        style: typeof raw.style === "string" ? raw.style : null,
        index: typeof raw.index === "number" ? raw.index : 0,
    };
}

function normalizeLayoutItems(items: unknown): LayoutItem[] {
    if (!Array.isArray(items)) return [];
    return items.map(normalizeLayoutItem).filter((item): item is LayoutItem => item !== null);
}

function getLayoutOrderForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null
): LayoutItem[] {
    if (!layout) return [];

    // 新结构：优先读取设备 profile
    if (deviceId && layout.profiles?.[deviceId]?.order) {
        return normalizeLayoutItems(layout.profiles[deviceId].order);
    }

    // 新结构：回退 defaultOrder
    if (layout.defaultOrder) {
        return normalizeLayoutItems(layout.defaultOrder);
    }

    // 旧结构兼容：读取 order
    if (layout.order) {
        return normalizeLayoutItems(layout.order);
    }

    return [];
}

async function migrateLegacyLayout(
    plugin: Plugin,
    layout: WidgetLayoutData | null,
    layoutFileName: string
): Promise<WidgetLayoutData> {
    // 若已有新结构，无需迁移
    if (layout?.defaultOrder || layout?.profiles) {
        return layout;
    }

    // 旧结构迁移：将 order 作为 defaultOrder
    if (layout?.order) {
        const migrated: WidgetLayoutData = {
            defaultOrder: normalizeLayoutItems(layout.order),
            profiles: {},
        };
        await plugin.saveData(layoutFileName, migrated);
        return migrated;
    }

    return { defaultOrder: [], profiles: {} };
}

function mergeIntoDefaultOrder(
    defaultOrder: LayoutItem[],
    currentOrder: LayoutItem[]
): LayoutItem[] {
    const defaultOrderIds = new Set(defaultOrder.map(item => item.id));
    const newItems: LayoutItem[] = [];

    for (const item of currentOrder) {
        if (!defaultOrderIds.has(item.id)) {
            newItems.push(item);
        }
    }

    if (newItems.length === 0) {
        return defaultOrder;
    }
    return [...defaultOrder, ...newItems];
}

export async function saveLayoutForContainer(
    plugin: Plugin,
    options: SaveLayoutOptions
): Promise<void> {
    const container = document.querySelector(options.containerSelector);
    if (!container) return;

    const currentOrder: LayoutItem[] = Array.from(container.children).map((el: Element, index) => {
        const widgetBlockElement = el as HTMLElement;
        return {
            id: widgetBlockElement.id,
            style: widgetBlockElement.getAttribute("style"),
            index: index,
        };
    });

    // 读取现有布局数据
    const existingLayout = await plugin.loadData(options.layoutFileName) as WidgetLayoutData | null;
    const profiles = existingLayout?.profiles || {};
    const existingDefaultOrder = existingLayout?.defaultOrder || existingLayout?.order || [];

    // 把当前设备新增的组件合并到 defaultOrder（全局已知组件并集）
    const mergedDefaultOrder = mergeIntoDefaultOrder(
        normalizeLayoutItems(existingDefaultOrder),
        currentOrder
    );

    // 桌面端：仅更新当前设备 profile（保留其他字段）
    if (isDesktopDeviceProfileEnabled()) {
        const deviceId = getLocalDeviceId();
        if (deviceId) {
            // 自动解除已恢复组件的隐藏标记
            const currentOrderIds = new Set(currentOrder.map(item => item.id));
            const existingHiddenIds = profiles[deviceId]?.hiddenWidgetIds || [];
            const nextHiddenIds = existingHiddenIds.filter(id => !currentOrderIds.has(id));

            profiles[deviceId] = {
                ...profiles[deviceId],
                order: currentOrder,
                hiddenWidgetIds: nextHiddenIds,
            };
        }
    }

    const layoutData: WidgetLayoutData = {
        defaultOrder: mergedDefaultOrder,
        profiles,
    };

    await plugin.saveData(options.layoutFileName, layoutData);
}

function getDefaultOrder(layout: WidgetLayoutData | null): LayoutItem[] {
    if (!layout) return [];
    if (layout.defaultOrder) {
        return normalizeLayoutItems(layout.defaultOrder);
    }
    if (layout.order) {
        return normalizeLayoutItems(layout.order);
    }
    return [];
}

async function findMissingComponents(
    plugin: Plugin,
    deviceOrder: LayoutItem[],
    defaultOrder: LayoutItem[],
    hiddenWidgetIds: string[] = []
): Promise<LayoutItem[]> {
    if (defaultOrder.length === 0) {
        return [];
    }

    const deviceOrderIds = new Set(deviceOrder.map(item => item.id));
    const hiddenIdsSet = new Set(hiddenWidgetIds);
    const missingItems: LayoutItem[] = [];

    for (const item of defaultOrder) {
        // 跳过已隐藏的组件
        if (hiddenIdsSet.has(item.id)) {
            continue;
        }
        if (!deviceOrderIds.has(item.id)) {
            const contentData = await plugin.loadData(`widget-${item.id}.json`);
            if (contentData) {
                missingItems.push(item);
            }
        }
    }

    return missingItems;
}

async function reconcileDeviceOrder(
    plugin: Plugin,
    deviceOrder: LayoutItem[],
    defaultOrder: LayoutItem[],
    layoutFileName: string,
    hiddenWidgetIds: string[] = []
): Promise<{ order: LayoutItem[]; hasChanges: boolean }> {
    // 只对主组件区 widgetLayout.json 启用补齐逻辑
    if (layoutFileName !== "widgetLayout.json") {
        return { order: deviceOrder, hasChanges: false };
    }

    const missingItems = await findMissingComponents(plugin, deviceOrder, defaultOrder, hiddenWidgetIds);

    if (missingItems.length === 0) {
        return { order: deviceOrder, hasChanges: false };
    }

    const reconciledOrder = [...deviceOrder, ...missingItems];
    return { order: reconciledOrder, hasChanges: true };
}

export async function restoreLayoutForContainer(
    plugin: Plugin,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    options: RestoreLayoutOptions
): Promise<void> {
    const container = document.querySelector(options.containerSelector);
    if (!container) return;

    let layout = await plugin.loadData(options.layoutFileName) as WidgetLayoutData | null;

    // 迁移旧结构
    layout = await migrateLegacyLayout(plugin, layout, options.layoutFileName);

    // 获取当前设备 ID
    const deviceId = isDesktopDeviceProfileEnabled() ? getLocalDeviceId() : null;
    const order = getLayoutOrderForDevice(layout, deviceId);

    // 若 order 为空，直接返回，不清空容器
    if (!order || order.length === 0) {
        return;
    }

    // 获取 defaultOrder 用于跨设备同步
    const defaultOrder = getDefaultOrder(layout);

    // 读取当前设备的 hiddenWidgetIds（用于区分隐藏 vs 缺失）
    const hiddenWidgetIds = (deviceId && layout?.profiles?.[deviceId]?.hiddenWidgetIds) || [];

    // 跨设备同步：检查当前设备是否缺失 defaultOrder 中的组件（仅主组件区）
    // 只要桌面端且 deviceId 可用就执行补齐，不要求 profile 必须预先存在
    let finalOrder = order;
    let needsSave = false;

    if (deviceId) {
        const reconcileResult = await reconcileDeviceOrder(plugin, order, defaultOrder, options.layoutFileName, hiddenWidgetIds);
        if (reconcileResult.hasChanges) {
            finalOrder = reconcileResult.order;
            needsSave = true;
        }
    }

    // 新设备首次建档：若当前设备无 profile，自动创建
    if (deviceId && layout && !layout.profiles?.[deviceId] && order.length > 0) {
        if (!layout.profiles) {
            layout.profiles = {};
        }
        layout.profiles[deviceId] = {
            ...layout.profiles[deviceId],
            order: finalOrder,
        };
        await plugin.saveData(options.layoutFileName, layout);
    } else if (needsSave && layout) {
        // 跨设备同步后保存更新
        if (!layout.profiles) {
            layout.profiles = {};
        }
        layout.profiles[deviceId] = {
            ...layout.profiles[deviceId],
            order: finalOrder,
        };
        await plugin.saveData(options.layoutFileName, layout);
    }

    // 第一阶段：构建待恢复的 widget 列表
    const widgetsToRestore: { element: HTMLElement }[] = [];
    for (const item of finalOrder) {
        try {
            const widgetBlock = new options.WidgetBlockClass(
                plugin,
                currentBlockForSettingsRef,
                item.id,
                item.style,
                ""
            );

            const contentData = await plugin.loadData(`widget-${item.id}.json`);

            if (contentData) {
                widgetBlock.loadcontent = JSON.stringify(contentData);
                widgetBlock.updateContent(widgetBlock.loadcontent);
            }

            widgetsToRestore.push({ element: widgetBlock.element });
        } catch (e) {
            console.warn(`[Layout] 构建 widget ${item.id} 失败:`, e);
        }
    }

    // 第二阶段：只有当成功构建出至少一个 widget 时，才清空并替换
    if (widgetsToRestore.length === 0) {
        return;
    }

    // 清空容器，避免重复调用时重复追加组件
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    // 依次 append 已成功构造的 widget
    for (const widget of widgetsToRestore) {
        container.appendChild(widget.element);
    }
}

function removeWidgetFromOrder(order: LayoutItem[], widgetId: string): LayoutItem[] {
    return order.filter(item => item.id !== widgetId);
}

export async function hideWidgetForCurrentDevice(
    plugin: Plugin,
    widgetId: string
): Promise<boolean> {
    if (!isDesktopDeviceProfileEnabled()) {
        console.warn("[Layout] 当前设备隐藏仅支持桌面端");
        return false;
    }

    const deviceId = getLocalDeviceId();
    if (!deviceId) {
        console.warn("[Layout] 无法获取当前设备 ID");
        return false;
    }

    const layout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
    if (!layout) {
        console.warn("[Layout] 布局数据不存在");
        return false;
    }

    // 确保当前设备 profile 存在
    if (!layout.profiles) {
        layout.profiles = {};
    }

    // 若当前设备 profile 不存在，先基于当前有效顺序创建
    if (!layout.profiles[deviceId]) {
        const currentOrder = getLayoutOrderForDevice(layout, deviceId);
        layout.profiles[deviceId] = { order: currentOrder };
    }

    // 从当前设备 profile 中移除组件
    const currentOrder = layout.profiles[deviceId].order || [];
    const newOrder = removeWidgetFromOrder(currentOrder, widgetId);

    if (newOrder.length === currentOrder.length) {
        return true;
    }

    // 初始化 hiddenWidgetIds（若不存在）
    const existingHiddenIds = layout.profiles[deviceId].hiddenWidgetIds || [];
    // 将该 widgetId 加入 hiddenWidgetIds（去重）
    const newHiddenIds = [...new Set([...existingHiddenIds, widgetId])];

    layout.profiles[deviceId] = {
        ...layout.profiles[deviceId],
        order: newOrder,
        hiddenWidgetIds: newHiddenIds,
    };
    await plugin.saveData("widgetLayout.json", layout);
    return true;
}

export async function deleteWidgetGlobally(
    plugin: Plugin,
    widgetId: string
): Promise<boolean> {
    // 删除组件内容文件
    await plugin.removeData(`widget-${widgetId}.json`);

    const layout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
    if (!layout) {
        return true;
    }

    // 从 defaultOrder 中移除
    if (layout.defaultOrder) {
        layout.defaultOrder = removeWidgetFromOrder(layout.defaultOrder, widgetId);
    }

    // 从所有设备 profiles 中移除
    if (layout.profiles) {
        for (const deviceId of Object.keys(layout.profiles)) {
            if (layout.profiles[deviceId].order) {
                layout.profiles[deviceId].order = removeWidgetFromOrder(
                    layout.profiles[deviceId].order,
                    widgetId
                );
            }
            // 从 hiddenWidgetIds 中移除
            if (layout.profiles[deviceId].hiddenWidgetIds) {
                layout.profiles[deviceId].hiddenWidgetIds = layout.profiles[deviceId].hiddenWidgetIds.filter(
                    id => id !== widgetId
                );
            }
        }
    }

    // 从旧结构 order 中移除（兼容）
    if (layout.order) {
        layout.order = removeWidgetFromOrder(layout.order, widgetId);
    }

    await plugin.saveData("widgetLayout.json", layout);
    return true;
}

/**
 * 从 widgetLayout.json 读取 widgetLayoutNumber 和 widgetGap
 * 优先读取当前设备 profile，否则回退到全局值
 */
export async function loadWidgetLayoutSettings(
    plugin: Plugin
): Promise<{ widgetLayoutNumber: number; widgetGap: number; source: string }> {
    const layout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
    const deviceId = getLocalDeviceId();

    // 默认回退值
    const defaults = { widgetLayoutNumber: 4, widgetGap: 0.2 };

    // 桌面端：优先读取设备 profile
    if (isDesktopDeviceProfileEnabled() && deviceId && layout?.profiles?.[deviceId]) {
        const profile = layout.profiles[deviceId];
        if (profile.widgetLayoutNumber !== undefined || profile.widgetGap !== undefined) {
            return {
                widgetLayoutNumber: profile.widgetLayoutNumber ?? defaults.widgetLayoutNumber,
                widgetGap: profile.widgetGap ?? defaults.widgetGap,
                source: `device profile (${deviceId})`,
            };
        }
    }

    // 回退到全局值
    if (layout?.widgetLayoutNumber !== undefined || layout?.widgetGap !== undefined) {
        return {
            widgetLayoutNumber: layout.widgetLayoutNumber ?? defaults.widgetLayoutNumber,
            widgetGap: layout.widgetGap ?? defaults.widgetGap,
            source: "global",
        };
    }

    return { ...defaults, source: "default" };
}

/**
 * 保存 widgetLayoutNumber 和 widgetGap 到 widgetLayout.json
 * 桌面端保存到设备 profile，移动端保存到全局
 */
export async function saveWidgetLayoutSettings(
    plugin: Plugin,
    settings: { widgetLayoutNumber: number; widgetGap: number }
): Promise<void> {
    const layout = (await plugin.loadData("widgetLayout.json")) as WidgetLayoutData | null || {};

    if (isDesktopDeviceProfileEnabled()) {
        const deviceId = getLocalDeviceId();
        if (deviceId) {
            if (!layout.profiles) {
                layout.profiles = {};
            }
            if (!layout.profiles[deviceId]) {
                layout.profiles[deviceId] = { order: [] };
            }
            layout.profiles[deviceId].widgetLayoutNumber = settings.widgetLayoutNumber;
            layout.profiles[deviceId].widgetGap = settings.widgetGap;
        }
    } else {
        // 移动端：保存到全局
        layout.widgetLayoutNumber = settings.widgetLayoutNumber;
        layout.widgetGap = settings.widgetGap;
    }

    await plugin.saveData("widgetLayout.json", layout);
}

// ==================== 隐藏组件管理 ====================

export type HiddenWidgetItem = {
    id: string;
    style: string | null;
    contentData: any | null;
};

/**
 * 获取当前设备已隐藏的组件列表
 */
export async function getHiddenWidgetsForCurrentDevice(plugin: Plugin): Promise<HiddenWidgetItem[]> {
    if (!isDesktopDeviceProfileEnabled()) {
        return [];
    }

    const deviceId = getLocalDeviceId();
    if (!deviceId) {
        console.warn("[Layout] 无法获取当前设备 ID");
        return [];
    }

    const layout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
    if (!layout) {
        return [];
    }

    const hiddenWidgetIds = layout.profiles?.[deviceId]?.hiddenWidgetIds || [];
    if (hiddenWidgetIds.length === 0) {
        return [];
    }

    const defaultOrder = layout.defaultOrder || [];
    const hiddenWidgets: HiddenWidgetItem[] = [];

    for (const widgetId of hiddenWidgetIds) {
        // 从 defaultOrder 获取样式
        const defaultItem = defaultOrder.find(item => item.id === widgetId);
        const style = defaultItem?.style || null;

        // 读取组件内容
        const contentData = await plugin.loadData(`widget-${widgetId}.json`);

        hiddenWidgets.push({
            id: widgetId,
            style,
            contentData,
        });
    }

    return hiddenWidgets;
}

/**
 * 恢复当前设备已隐藏的组件
 * 按照 defaultOrder 的位置插回，若找不到则追加到末尾
 */
export async function restoreWidgetForCurrentDevice(plugin: Plugin, widgetId: string): Promise<boolean> {
    if (!isDesktopDeviceProfileEnabled()) {
        console.warn("[Layout] 当前设备恢复仅支持桌面端");
        return false;
    }

    const deviceId = getLocalDeviceId();
    if (!deviceId) {
        console.warn("[Layout] 无法获取当前设备 ID");
        return false;
    }

    const layout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
    if (!layout) {
        console.warn("[Layout] 布局数据不存在");
        return false;
    }

    const profile = layout.profiles?.[deviceId];
    if (!profile) {
        console.warn("[Layout] 当前设备 profile 不存在");
        return false;
    }

    const hiddenWidgetIds = profile.hiddenWidgetIds || [];
    if (!hiddenWidgetIds.includes(widgetId)) {
        console.info(`[Layout] 组件 ${widgetId} 不在隐藏列表中`);
        return false;
    }

    // 从 hiddenWidgetIds 中移除
    const newHiddenIds = hiddenWidgetIds.filter(id => id !== widgetId);

    // 获取当前 order
    const currentOrder = profile.order || [];

    // 从 defaultOrder 中找到该组件的样式
    const defaultOrder = layout.defaultOrder || [];
    const defaultItem = defaultOrder.find(item => item.id === widgetId);

    // 构建要插入的组件项
    const widgetItem: LayoutItem = {
        id: widgetId,
        style: defaultItem?.style || null,
        index: currentOrder.length,
    };

    // 计算插入位置：参照 defaultOrder 中该组件前后的组件在当前 order 中的位置
    let insertIndex = currentOrder.length; // 默认追加到末尾

    const defaultIndex = defaultOrder.findIndex(item => item.id === widgetId);
    if (defaultIndex !== -1) {
        // 向前查找：找到 defaultOrder 中该组件前面最近一个在当前 order 中的组件
        for (let i = defaultIndex - 1; i >= 0; i--) {
            const prevWidgetId = defaultOrder[i].id;
            const prevIndexInCurrent = currentOrder.findIndex(item => item.id === prevWidgetId);
            if (prevIndexInCurrent !== -1) {
                insertIndex = prevIndexInCurrent + 1;
                break;
            }
        }

        // 如果向前没找到，向后查找：找到 defaultOrder 中该组件后面最近一个在当前 order 中的组件
        if (insertIndex === currentOrder.length) {
            for (let i = defaultIndex + 1; i < defaultOrder.length; i++) {
                const nextWidgetId = defaultOrder[i].id;
                const nextIndexInCurrent = currentOrder.findIndex(item => item.id === nextWidgetId);
                if (nextIndexInCurrent !== -1) {
                    insertIndex = nextIndexInCurrent;
                    break;
                }
            }
        }
    }

    // 插入组件
    const newOrder = [...currentOrder];
    newOrder.splice(insertIndex, 0, widgetItem);

    // 更新 index
    newOrder.forEach((item, idx) => {
        item.index = idx;
    });

    // 保存
    layout.profiles[deviceId] = {
        ...profile,
        order: newOrder,
        hiddenWidgetIds: newHiddenIds,
    };

    await plugin.saveData("widgetLayout.json", layout);
    console.info(`[Layout] 已恢复组件 ${widgetId} 到位置 ${insertIndex}`);
    return true;
}