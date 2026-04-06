<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { unmount } from "svelte";
    import { showMessage } from "siyuan";
    import type { Plugin } from "siyuan";
    import { mountWidgetContent } from "../../components/utils/widgetBlock/widgetMountRegistry";
    import { WidgetBlock } from "../../components/utils/widgetBlock/WidgetBlock";
    import {
        getHiddenWidgetsForCurrentDevice,
        restoreWidgetForCurrentDevice,
        restoreLayoutForContainer,
        loadWidgetLayoutSettings,
        type HiddenWidgetItem,
    } from "../../components/utils/widgetBlock/utils/layout-shared";

    interface Props {
        plugin: Plugin;
        close: () => void;
    }

    let { plugin }: Props = $props();

    let hiddenWidgets = $state<HiddenWidgetItem[]>([]);
    let widgetGap = $state(0.2);
    let isLoading = $state(true);
    let restoredIds = $state<Set<string>>(new Set());

    // 预览组件实例映射
    let previewInstances: Map<string, any> = new Map();

    onMount(async () => {
        // 加载隐藏组件列表
        hiddenWidgets = await getHiddenWidgetsForCurrentDevice(plugin);

        // 加载布局设置（只取 widgetGap）
        const settings = await loadWidgetLayoutSettings(plugin);
        widgetGap = settings.widgetGap;

        isLoading = false;

        // 延迟挂载预览
        setTimeout(mountPreviews, 50);
    });

    onDestroy(() => {
        // 清理所有预览实例
        previewInstances.forEach((instance) => {
            try {
                unmount(instance);
            } catch (e) {
                // 忽略
            }
        });
        previewInstances.clear();
    });

    function mountPreviews() {
        for (const widget of hiddenWidgets) {
            if (!widget.contentData) continue;

            const container = document.getElementById(`preview-${widget.id}`);
            if (!container) continue;

            // 清理旧实例
            const oldInstance = previewInstances.get(widget.id);
            if (oldInstance) {
                try {
                    unmount(oldInstance);
                } catch (e) {
                    // 忽略
                }
            }

            // 挂载新实例
            const instance = mountWidgetContent(
                container,
                plugin,
                JSON.stringify(widget.contentData)
            );

            if (instance) {
                previewInstances.set(widget.id, instance);
            }
        }
    }

    async function handleRestore(widgetId: string) {
        const success = await restoreWidgetForCurrentDevice(plugin, widgetId);
        if (success) {
            showMessage("组件已恢复");
            restoredIds.add(widgetId);
            restoredIds = restoredIds; // 触发更新

            // 从列表中移除
            setTimeout(() => {
                hiddenWidgets = hiddenWidgets.filter((w) => w.id !== widgetId);
                restoredIds.delete(widgetId);
            }, 300);

            // 尝试刷新主页
            try {
                const container = document.querySelector(".custom-content");
                if (container) {
                    await restoreLayoutForContainer(plugin, { value: null }, {
                        containerSelector: ".custom-content",
                        layoutFileName: "widgetLayout.json",
                        WidgetBlockClass: WidgetBlock,
                    });
                }
            } catch (e) {
                console.warn("[HiddenWidgetsDialog] 刷新主页失败:", e);
            }
        }
    }

    function getWidgetTitle(widget: HiddenWidgetItem): string {
        if (!widget.contentData) return widget.id;
        return widget.contentData.title || widget.contentData.type || widget.id;
    }

    function getWidgetType(widget: HiddenWidgetItem): string {
        if (!widget.contentData) return "未知类型";
        const typeMap: Record<string, string> = {
            "latest-docs": "最近文档",
            "heatmap": "热力图",
            "favorites": "收藏",
            "recent-journals": "最近日记",
            "TaskMan": "任务管理",
            "countdown": "倒计时",
            "weather": "天气",
            "HOT": "热搜",
            "custom-text": "自定义文本",
            "custom-web": "自定义网页",
            "custom-protyle": "自定义编辑器",
            "timedate": "时间日期",
            "focus": "专注",
            "sql": "SQL查询",
            "TaskManPlus": "任务管理+",
            "quick-notes": "快速笔记",
            "dailyQuote": "每日一言",
            "visualChart": "可视化图表",
            "musicPlayer": "音乐播放器",
            "stikynot": "便签",
            "News": "新闻",
            "databaseChart": "数据库图表",
            "childDocs": "子文档",
            "constellation": "星座",
            "historyDays": "历史上的今天",
            "statisticalCard": "统计卡片",
            "almanac": "老黄历",
            "PicCaro": "图片轮播",
            "CYBMOK": "赛博木鱼",
            "countdownTimer": "倒计时器",
            "conditionDocs": "条件文档",
        };
        return typeMap[widget.contentData.type] || widget.contentData.type;
    }
</script>

<div class="hidden-widgets-dialog">
    {#if isLoading}
        <div class="loading-state">加载中...</div>
    {:else if hiddenWidgets.length === 0}
        <div class="empty-state">
            <div class="empty-icon">📭</div>
            <p>当前设备没有隐藏组件</p>
        </div>
    {:else}
        <div
            class="widgets-grid"
            style="gap: {widgetGap}rem;"
        >
            {#each hiddenWidgets as widget (widget.id)}
                <div class="widget-card" class:restoring={restoredIds.has(widget.id)} title="ID: {widget.id}">
                    <div class="widget-preview" id="preview-{widget.id}">
                        {#if !widget.contentData}
                            <div class="no-content">无法加载组件内容</div>
                        {/if}
                    </div>
                    <div class="widget-info">
                        <div class="widget-title">{getWidgetTitle(widget)}</div>
                        <div class="widget-meta">
                            <span class="widget-type">{getWidgetType(widget)}</span>
                        </div>
                    </div>
                    <button
                        class="restore-btn"
                        onclick={() => handleRestore(widget.id)}
                        disabled={restoredIds.has(widget.id)}
                    >
                        {restoredIds.has(widget.id) ? "已恢复" : "恢复显示"}
                    </button>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .hidden-widgets-dialog {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        padding: 20px;
        overflow-x: hidden;
        overflow-y: visible;
    }

    .loading-state,
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: var(--b3-theme-on-surface-light);
    }

    .empty-icon {
        font-size: 48px;
        margin-bottom: 12px;
    }

    .empty-state p {
        margin: 0;
        font-size: 14px;
    }

    .widgets-grid {
        display: grid;
        width: 100%;
        min-width: 0;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        align-content: start;
    }

    .widget-card {
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        overflow: hidden;
        transition: all 0.3s ease;
        display: flex;
        flex-direction: column;
        aspect-ratio: 1 / 1;
        min-width: 0;
    }

    .widget-card.restoring {
        opacity: 0.5;
        transform: scale(0.95);
    }

    .widget-preview {
        flex: 1;
        overflow: hidden;
        background: var(--b3-theme-background-light);
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 0;
    }

    .no-content {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        padding: 16px;
        text-align: center;
    }

    .widget-info {
        padding: 10px 12px;
        border-top: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
    }

    .widget-title {
        font-weight: 600;
        font-size: 13px;
        color: var(--b3-theme-on-background);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-bottom: 2px;
    }

    .widget-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .widget-type {
        font-size: 11px;
        color: var(--b3-theme-primary);
    }

    .restore-btn {
        margin: 0 12px 12px 12px;
        padding: 6px 12px;
        background: var(--b3-theme-primary);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
    }

    .restore-btn:hover:not(:disabled) {
        background: var(--b3-theme-primary-light);
    }

    .restore-btn:disabled {
        background: var(--b3-theme-surface-lighter);
        color: var(--b3-theme-on-surface-light);
        cursor: not-allowed;
    }
</style>