import { svelteDialog } from "../../../libs/dialog";
import WidgetBlockStyle from "./styleSetting.svelte";
import WidgetBlockContent from "./contentSetting.svelte";
import { setBlockSize } from "./utils/block-size-handler";
import { mountWidgetContent } from "./widgetMountRegistry";
import { mount, unmount } from "svelte";
import { hideWidgetForCurrentDevice, deleteWidgetGlobally, loadWidgetLayoutSettings, stringifyWidgetConfigForMount } from "./utils/layout-shared";
import { renderSiyuanIcon } from "@/components/tools/siyuanIcon";
import type { HomepageLayoutRuntimeOptions } from "./utils/layout-handler";

export class WidgetBlock {
    public element: HTMLElement;
    public readonly id: string;
    public style: string;
    public loadcontent: string;
    public widgetLayoutNumber: number = 4;

    private readonly plugin: any;
    private readonly currentBlockForSettingsRef: { value: HTMLElement | null };
    private readonly runtimeOptions: HomepageLayoutRuntimeOptions;
    private mountedWidget: Record<string, any> | null = null;

    constructor(
        plugin: any,
        currentBlockForSettingsRef: { value: HTMLElement | null },
        id?: string,
        style?: string,
        loadcontent?: string,
        runtimeOptions: HomepageLayoutRuntimeOptions = {},
    ) {
        this.id = id || `block-${Date.now()}`;
        this.plugin = plugin;
        this.currentBlockForSettingsRef = currentBlockForSettingsRef;
        this.runtimeOptions = runtimeOptions;
        this.style = style || 'aspect-ratio: 1 / 1;background-color: rgba(0, 0, 0, 0.03);draggable: true;border: 2px solid var(--b3-theme-primary);box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);transition: all 0.2s ease-in-out;border-radius: 8px;';
        this.loadcontent = loadcontent || '';

        // 统一从 widgetLayout.json 读取列数
        loadWidgetLayoutSettings(plugin, runtimeOptions).then((settings) => {
            this.widgetLayoutNumber = settings.widgetLayoutNumber;
        });

        this.element = document.createElement("div");
        this.element.className = "widget-block";
        this.element.id = this.id;

        this.element.innerHTML = this.renderControls(false);

        this.element.setAttribute("style", this.style);

        // 在 DOM 上挂载实例引用，便于外部统一销毁
        (this.element as any).__widgetBlockInstance = this;

        this.setupEventListeners();
    }

    private renderControls(includeRefresh = false): string {
        return `
            <button class="block-style-button" title="样式设置">${renderSiyuanIcon("style", 14)}</button>
            <button class="drag-handle" title="拖拽组件">${renderSiyuanIcon("drag", 14)}</button>
            <button class="block-content-button" title="内容设置">${renderSiyuanIcon("settings", 14)}</button>
            ${includeRefresh ? `<button class="block-update-button" title="刷新组件">${renderSiyuanIcon("refresh", 14)}</button>` : ""}
        `;
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
                                                        onHideForCurrentDevice: async () => {
                                                            await hideWidgetForCurrentDevice(this.plugin, this.id, this.runtimeOptions);
                                                            this.cleanupMountedWidget();
                                                            if (this.currentBlockForSettingsRef.value) {
                                                                this.currentBlockForSettingsRef.value.remove();
                                                                this.currentBlockForSettingsRef.value = null;
                                                            }
                                                            dialogRef.close();
                                                        },
                                                        onDeleteGlobally: async () => {
                                                            await deleteWidgetGlobally(this.plugin, this.id);
                                                            this.cleanupMountedWidget();
                                                            if (this.currentBlockForSettingsRef.value) {
                                                                this.currentBlockForSettingsRef.value.remove();
                                                                this.currentBlockForSettingsRef.value = null;
                                                            }
                                                            dialogRef.close();
                                                        },
                                                        onSetSize: (size: number) => {
                                                            const layoutNumber = this.widgetLayoutNumber || 4;
                                                            setBlockSize(this.currentBlockForSettingsRef.value, size, layoutNumber);
                                                            dialogRef.close();
                                                        },
                                                        layoutRuntimeOptions: this.runtimeOptions,
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
                    width: "min(750px, calc(100vw - 32px))",
                    height: "72vh",
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
                                                            this.plugin.saveData(`widget-${this.id}.json`, JSON.parse(contentTypeJson));
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
                    this.updateContent(stringifyWidgetConfigForMount(widgetConfig) || '');
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

        this.element.innerHTML = this.renderControls(true);

        this.mountedWidget = mountWidgetContent(this.element, this.plugin, contentTypeJson);

        // 重新绑定按钮事件（如果需要）
        this.setupEventListeners();
    }
}
