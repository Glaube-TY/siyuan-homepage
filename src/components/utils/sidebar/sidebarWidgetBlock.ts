import { svelteDialog } from "../../../libs/dialog";
import WidgetBlockStyle from "./sidebarStyleSetting.svelte";
import WidgetBlockContent from "../widgetBlock/contentSetting.svelte";
import { setBlockSize } from "../widgetBlock/utils/block-size-handler";
import { saveLayout } from "../widgetBlock/utils/layout-handler";
import { saveLayout as saveSidebarLayout } from "@/components/utils/sidebar/widget_layout";
import { saveLayout as saveMobileLayout } from "@/components/utils/mobileHomepage/mobileHomepage_layout";
import latestDocs from "../widgetBlock/widget/latestDocs/latestDocs.svelte";
import latestDailyNotes from "../widgetBlock/widget/latestDailyNotes/latestDailyNotes.svelte";
import TaskMan from "../widgetBlock/widget/tasks/recentTasks.svelte";
import countdown from "../widgetBlock/widget/countdown/countdown.svelte";
import weather from "../widgetBlock/widget/weather/weather.svelte";
import HOT from "../widgetBlock/widget/HOT/HOT.svelte";
import favorites from "../widgetBlock/widget/favorites/favorites.svelte";
import heatmap from "../widgetBlock/widget/heatmap/heatmap.svelte";
import customText from "../widgetBlock/widget/customText/customText.svelte";
import customWeb from "../widgetBlock/widget/webview/webview.svelte";
import customProtyle from "../widgetBlock/widget/protyle/protyle.svelte";
import timedate from "../widgetBlock/widget/timedate/timedate.svelte";
import focus from "../widgetBlock/widget/focus/focus.svelte";
import sql from "../widgetBlock/widget/sql/sql.svelte";
import TaskManPlus from "../widgetBlock/widget/tasksPlus/tasksPlus.svelte";
import quickNotes from "../widgetBlock/widget/quickNotes/quickNotes.svelte";
import dailyQuote from "../widgetBlock/widget/dailyQuote/dailyQuote.svelte";
import visualChart from "../widgetBlock/widget/visualChart/visualChart.svelte";
import musicPlayer from "../widgetBlock/widget/musicPlayer/musicPlayer.svelte";
import Stikynot from "../widgetBlock/widget/stikynot/stikynot.svelte";
import News from "../widgetBlock/widget/News/News.svelte";
import databaseChart from "../widgetBlock/widget/databaseChart/databaseChart.svelte";
import childDocs from "../widgetBlock/widget/childDocs/childDocs.svelte";
import constellation from "../widgetBlock/widget/constellation/constellation.svelte";
import historyDays from "../widgetBlock/widget/historyDays/historyDays.svelte";
import statisticalCard from "../widgetBlock/widget/statisticalCard/statisticalCard.svelte";

export class WidgetBlock {
    public element: HTMLElement;
    public readonly id: string;
    public style: string;
    public loadcontent: string;

    private readonly plugin: any;
    private readonly currentBlockForSettingsRef: { value: HTMLElement | null };

    constructor(
        plugin: any,
        currentBlockForSettingsRef: { value: HTMLElement | null },
        id?: string,
        style?: string,
        loadcontent?: string
    ) {
        this.id = id || `block-${Date.now()}`;
        this.plugin = plugin;
        this.currentBlockForSettingsRef = currentBlockForSettingsRef;
        this.style = style || 'aspect-ratio: 1 / 1;background-color: rgba(0, 0, 0, 0.03);draggable: true;border: 2px solid var(--b3-theme-primary);box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);transition: all 0.2s ease-in-out;border-radius: 8px;';
        this.loadcontent = loadcontent || '';

        this.element = document.createElement("div");
        this.element.className = "widget-block";
        this.element.id = this.id;

        this.element.innerHTML = `
            <button class="block-style-button" title="样式设置">🎨</button>
            <button class="drag-handle" title="拖拽组件">🧲</button>
            <button class="block-content-button" title="内容设置">⚙️</button>
        `;

        this.element.setAttribute("style", this.style);

        this.setupEventListeners();
    }

    private setupEventListeners() {
        const styleButton = this.element.querySelector(".block-style-button");
        const contentButton = this.element.querySelector(".block-content-button");
        const updateButton = this.element.querySelector(".block-update-button");

        if (styleButton) {
            styleButton.addEventListener("click", () => {
                this.currentBlockForSettingsRef.value = this.element;

                const dialogRef = svelteDialog({
                    title: "组件样式",
                    constructor: (containerEl: HTMLElement) => {
                        return new WidgetBlockStyle({
                            target: containerEl,
                            props: {
                                plugin: this.plugin,
                                currentBlockId: this.element.id,
                                onClose: () => {
                                    dialogRef.close();
                                },
                                onDelete: () => {
                                    if (this.currentBlockForSettingsRef.value) {
                                        this.currentBlockForSettingsRef.value.remove();
                                        this.currentBlockForSettingsRef.value = null;
                                    }
                                    dialogRef.close();
                                    saveLayout(this.plugin);
                                    saveSidebarLayout(this.plugin);
                                    saveMobileLayout(this.plugin);
                                    this.plugin.removeData(`widget-${this.id}.json`);
                                },
                                onSetSize: (size: number) => {
                                    setBlockSize(this.currentBlockForSettingsRef.value, size, 4);
                                    dialogRef.close();
                                },
                            },
                        });
                    },
                });
            });
        }

        if (contentButton) {
            contentButton.addEventListener("click", () => {
                this.currentBlockForSettingsRef.value = this.element;

                const dialogRef = svelteDialog({
                    title: "组件内容",
                    constructor: (containerEl: HTMLElement) => {
                        return new WidgetBlockContent({
                            target: containerEl,
                            props: {
                                plugin: this.plugin,
                                currentBlockId: this.element.id,
                                onClose: () => {
                                    dialogRef.close();
                                },
                                onConfirm: (contentTypeJson: string) => {
                                    const blockElement = document.getElementById(this.id);
                                    if (blockElement) {
                                        this.updateContent(contentTypeJson);
                                    }
                                    this.plugin.saveData(`widget-${this.id}.json`, contentTypeJson);
                                    dialogRef.close();
                                }
                            },
                        });
                    },
                });
            });
        }

        if (updateButton) {
            updateButton.addEventListener("click", async () => {
                const widgetConfig = await this.plugin.loadData(`widget-${this.id}.json`);
                if (widgetConfig) {
                    this.updateContent(JSON.stringify(widgetConfig));
                } else {
                    console.warn("未找到对应的 widget 配置");
                }
            });
        }
    }

    public appendTo(container: Element | null) {
        if (container) {
            container.appendChild(this.element);
        }
    }

    public updateContent(contentTypeJson?: string): void {
        if (!contentTypeJson) {
            console.warn("未提供有效的 content 数据");
            return;
        }

        let contentData: any;

        try {
            contentData = JSON.parse(contentTypeJson);
        } catch (e) {
            console.error("无法解析 JSON 数据", e);
            return;
        }

        this.element.innerHTML = `
        <button class="block-style-button" title="样式设置">🎨</button>
        <button class="drag-handle" title="拖拽组件">🧲</button>
        <button class="block-content-button" title="内容设置">⚙️</button>
        <button class="block-update-button" title="刷新组件">🔄</button>
        `;

        // 根据 content 类型动态加载组件
        if (contentData.type === "latest-docs") {
            new latestDocs({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "heatmap") {
            new heatmap({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "favorites") {
            new favorites({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "recent-journals") {
            new latestDailyNotes({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "TaskMan") {
            new TaskMan({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "countdown") {
            new countdown({
                target: this.element,
                props: {
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "weather") {
            new weather({
                target: this.element,
                props: {
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "HOT") {
            new HOT({
                target: this.element,
                props: {
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "custom-text") {
            new customText({
                target: this.element,
                props: {
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "custom-web") {
            new customWeb({
                target: this.element,
                props: {
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "custom-protyle") {
            new customProtyle({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "timedate") {
            new timedate({
                target: this.element,
                props: {
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "focus") {
            new focus({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "sql") {
            new sql({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "TaskManPlus") {
            new TaskManPlus({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "quick-notes") {
            new quickNotes({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "dailyQuote") {
            new dailyQuote({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "visualChart") {
            new visualChart({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "musicPlayer") {
            new musicPlayer({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "stikynot") {
            new Stikynot({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "News") {
            new News({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "databaseChart") {
            new databaseChart({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "childDocs") {
            new childDocs({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "constellation") {
            new constellation({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "historyDays") {
            new historyDays({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "statisticalCard") {
            new statisticalCard({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        }

        // 重新绑定按钮事件（如果需要）
        this.setupEventListeners();
    }
}