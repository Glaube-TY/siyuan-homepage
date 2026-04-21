import { svelteDialog } from "../../libs/dialog";
import WidgetBlockStyle from "./mobileStyleSetting.svelte";
import WidgetBlockContent from "../../components/utils/widgetBlock/contentSetting.svelte";
import { setBlockSize } from "../../components/utils/widgetBlock/utils/block-size-handler";
import { saveLayout } from "../../components/utils/widgetBlock/utils/layout-handler";
import { saveLayout as saveSidebarLayout } from "@/components/utils/sidebar/widget_layout";
import { saveLayout as saveMobileLayout } from "@/homepage/mobileHomepage/mobileHomepage_layout";
import { mountWidgetContent } from "../../components/utils/widgetBlock/widgetMountRegistry";
import { mount, unmount } from "svelte";

export class WidgetBlock {
    public element: HTMLElement;
    public readonly id: string;
    public style: string;
    public loadcontent: string;

    private readonly plugin: any;
    private readonly currentBlockForSettingsRef: { value: HTMLElement | null };
    private mountedWidget: Record<string, any> | null = null;

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

        // 在 DOM 上挂载实例引用，便于外部统一销毁
        (this.element as any).__widgetBlockInstance = this;

        this.setupEventListeners();
    }

    // 公开销毁方法：统一清理 widget 实例
    public destroy(): void {
        this.cleanupMountedWidget();
        (this.element as any).__widgetBlockInstance = null;
    }

    private cleanupMountedWidget(): void {
        if (this.mountedWidget) {
            unmount(this.mountedWidget);
            this.mountedWidget = null;
        }
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
                        return mount(WidgetBlockStyle, {
                                                    target: containerEl,
                                                    props: {
                                                        plugin: this.plugin,
                                                        currentBlockId: this.element.id,
                                                        onClose: () => {
                                                            dialogRef.close();
                                                        },
                                                        onDelete: () => {
                                                            this.cleanupMountedWidget();
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
                        return mount(WidgetBlockContent, {
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

        this.cleanupMountedWidget();

        this.element.innerHTML = `
        <button class="block-style-button" title="样式设置">🎨</button>
        <button class="drag-handle" title="拖拽组件">🧲</button>
        <button class="block-content-button" title="内容设置">⚙️</button>
        <button class="block-update-button" title="刷新组件">🔄</button>
        `;

        this.mountedWidget = mountWidgetContent(this.element, this.plugin, contentTypeJson);

        // 重新绑定按钮事件（如果需要）
        this.setupEventListeners();
    }
}