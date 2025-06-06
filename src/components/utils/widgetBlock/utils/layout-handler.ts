import type { Plugin } from 'siyuan';
import { WidgetBlock } from "../WidgetBlock";

/**
 * 保存当前布局信息到 widgetLayout.json
 */
export async function saveLayout(plugin: Plugin) {
    const container = document.querySelector(".custom-content");
    if (!container) return;

    const order = Array.from(container.children).map((el: Element, index) => {
        const widgetBlockElement = el as HTMLElement;
        return {
            id: widgetBlockElement.id,
            style: widgetBlockElement.getAttribute("style"),
            index: index,
        };
    });

    await plugin.saveData("widgetLayout.json", { order });
}

/**
 * 从 widgetLayout.json 恢复布局，并加载每个组件的内容
 */
export async function restoreLayout(plugin: Plugin, currentBlockForSettingsRef: { value: HTMLElement | null }) {
    const container = document.querySelector(".custom-content");
    if (!container) return;

    const layout = await plugin.loadData("widgetLayout.json");
    const order = layout?.order;

    if (!order) return;

    for (const item of order) {
        // 创建 WidgetBlock 实例
        const widgetBlock = new WidgetBlock(
            plugin,
            currentBlockForSettingsRef,
            item.id,
            item.style,
            "" // 先初始化为空，后面通过配置文件填充
        );

        // 加载对应的内容配置文件
        const contentData = await plugin.loadData(`widget-${item.id}.json`);

        if (contentData) {
            // 赋值给 loadcontent 并更新组件内容
            widgetBlock.loadcontent = JSON.stringify(contentData);
            widgetBlock.updateContent(widgetBlock.loadcontent);
        }

        // 将组件添加到容器中
        container.appendChild(widgetBlock.element);
    }
}
