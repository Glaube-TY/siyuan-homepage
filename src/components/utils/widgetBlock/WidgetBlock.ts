import { svelteDialog } from "../../../libs/dialog";
import WidgetBlockStyle from "./styleSetting.svelte";
import WidgetBlockContent from "./contentSetting.svelte";
import { setBlockSize } from "./utils/block-size-handler";
import { saveLayout } from "./utils/layout-handler";
import latestDocs from "./widget/latestDocs/latestDocs.svelte";
import latestDailyNotes from "./widget/latestDailyNotes/latestDailyNotes.svelte";
import recentTasks from "./widget/tasks/recentTasks.svelte";
import countdown from "./widget/countdown/countdown.svelte";
import weather from "./widget/weather/weather.svelte";
import HOT from "./widget/HOT/HOT.svelte";
import favorites from "./widget/favorites/favorites.svelte";
import heatmap from "./widget/heatmap/heatmap.svelte";
import customText from "./widget/customText/customText.svelte";

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
        this.style = style || 'flex: 0 0 calc(25% - 12px);aspect-ratio: 1 / 1;background-color: rgba(0, 0, 0, 0.03);draggable: true;border: 2px solid var(--b3-theme-primary);box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);transition: all 0.2s ease-in-out;border-radius: 8px;';
        this.loadcontent = loadcontent || '';

        this.element = document.createElement("div");
        this.element.className = "widget-block";
        this.element.id = this.id;

        this.element.innerHTML = `
            <button class="block-style-button">🎨</button>
            <div class="block-content-button">⚙️</div>
        `;

        this.element.setAttribute("style", this.style);

        this.setupEventListeners();
    }

    private setupEventListeners() {
        const styleButton = this.element.querySelector(".block-style-button");
        const contentButton = this.element.querySelector(".block-content-button");

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
                                    this.plugin.removeData(`widget-${this.id}.json`);
                                },
                                onSetSize: (size: number) => {
                                    setBlockSize(this.currentBlockForSettingsRef.value, size);
                                    dialogRef.close();
                                },
                            },
                        });
                    },
                });
            });
        }

        // 新增：为 .block-content-button 添加点击事件
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
        <button class="block-style-button">🎨</button>
        <div class="block-content-button">⚙️</div>
    `;

        // 根据 content 类型动态加载组件
        if (contentData.type === "latest-docs") {
            new latestDocs({
                target: this.element,
                props: {
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
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "recent-tasks") {
            new recentTasks({
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
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "weather") {
            new weather({
                target: this.element,
                props: {
                    plugin: this.plugin,
                    contentTypeJson: contentTypeJson
                }
            });
        } else if (contentData.type === "HOT") {
            new HOT({
                target: this.element,
                props: {
                    plugin: this.plugin,
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
        }

        // 重新绑定按钮事件（如果需要）
        this.setupEventListeners();
    }
}