import { svelteDialog } from "../../../libs/dialog";
import WidgetBlockStyle from "./sidebarStyleSetting.svelte";
import WidgetBlockContent from "../widgetBlock/contentSetting.svelte";
import { setBlockSize } from "../widgetBlock/utils/block-size-handler";
import { mountWidgetContent, type WidgetRuntimeContext } from "../widgetBlock/widgetMountRegistry";
import { mount, unmount } from "svelte";
import { renderSiyuanIcon } from "@/components/tools/siyuanIcon";
import { stringifyWidgetConfigForMount, deleteWidgetFromSurface } from "../widgetBlock/utils/layout-shared";
import { saveWidgetContentPreservingSize } from "../widgetBlock/styleUtils";
import { createWidgetInstanceId, loadWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";
import { showMessage } from "siyuan";

export class WidgetBlock {
    public element: HTMLElement;
    public readonly id: string;
    public style: string;
    public loadcontent: string;

    private readonly plugin: any;
    private readonly currentBlockForSettingsRef: { value: HTMLElement | null };
    private readonly deviceViewContext: DeviceViewContext;
    private mountedWidget: Record<string, any> | null = null;
    private isNewInstance: boolean;

    constructor(
        plugin: any,
        currentBlockForSettingsRef: { value: HTMLElement | null },
        id?: string,
        style?: string,
        loadcontent?: string,
        runtimeOptions: { deviceViewContext?: DeviceViewContext } = {},
    ) {
        this.isNewInstance = !id;
        this.id = id || createWidgetInstanceId();
        this.plugin = plugin;
        this.currentBlockForSettingsRef = currentBlockForSettingsRef;
        this.deviceViewContext = runtimeOptions.deviceViewContext || getCurrentDeviceViewContext(plugin, "desktop-sidebar");
        this.style = style || 'aspect-ratio: 1 / 1;background-color: rgba(0, 0, 0, 0.03);draggable: true;border: 2px solid var(--b3-theme-primary);box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);transition: all 0.2s ease-in-out;border-radius: 8px;';
        this.loadcontent = loadcontent || '';

        this.element = document.createElement("div");
        this.element.className = "widget-block";
        this.element.id = this.id;
        this.element.dataset.widgetMountState = "idle";

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
        this.element.dataset.widgetMountState = "idle";
    }

    public hasMountedContent(): boolean {
        return this.mountedWidget !== null && this.element.dataset.widgetMountState === "ready";
    }

    public ensureContentMounted(contentTypeJson?: string, runtimeContext: WidgetRuntimeContext = {}): boolean {
        if (this.hasMountedContent()) return true;
        if (!contentTypeJson) return false;
        this.updateContent(contentTypeJson, runtimeContext);
        return this.hasMountedContent();
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
                                                        deviceViewContext: this.deviceViewContext,
                                                        blockElement: this.element,
                                                        onClose: () => {
                                                            dialogRef.close();
                                                        },
                                                        onDelete: async () => {
                                                            const result = await deleteWidgetFromSurface(
                                                                this.deviceViewContext,
                                                                this.id,
                                                            );
                                                             if (result.status === "success" || result.status === "layoutCommittedConfigRetained") {
                                                                 try { this.cleanupMountedWidget(); } catch (e) { console.warn("[Sidebar] destroy failed after delete:", e); }
                                                                this.element.remove();
                                                                this.currentBlockForSettingsRef.value = null;
                                                                if (result.status === "layoutCommittedConfigRetained") {
                                                                    showMessage(
                                                                        result.warning || "组件已从侧边栏移除，配置文件因保护性错误保留",
                                                                        5000,
                                                                    );
                                                                }
                                                            } else if (result.status === "notCommitted") {
                                                                throw new Error(`组件删除失败（布局未提交）：${result.reason}`);
                                                            } else {
                                                                throw new Error(`组件删除状态无法确认，请人工检查：${result.reason}`);
                                                            }
                                                            dialogRef.close();
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
                    width: "min(750px, calc(100vw - 32px))",
                    height: "72vh",
                    constructor: (containerEl: HTMLElement) => {
                        return mount(WidgetBlockContent, {
                                                    target: containerEl,
                                                    props: {
                                                        plugin: this.plugin,
                                                        currentBlockId: this.element.id,
                                                        deviceViewContext: this.deviceViewContext,
                                                        onClose: () => {
                                                            dialogRef.close();
                                                        },
                                                        onConfirm: async (contentTypeJson: string) => {
                                                            this.updateContent(contentTypeJson);
                                                            await saveWidgetContentPreservingSize(
                                                                this.plugin,
                                                                this.id,
                                                                JSON.parse(contentTypeJson),
                                                                this.deviceViewContext,
                                                                this.element,
                                                                this.isNewInstance,
                                                            );
                                                            this.isNewInstance = false;
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
                const widgetConfig = await loadWidgetInstanceConfig(this.deviceViewContext, this.id);
                if (widgetConfig) {
                    this.updateContent(stringifyWidgetConfigForMount(widgetConfig) || '', {
                        forceIndexRefresh: true,
                        refreshReason: "manual",
                    });
                }
            });
        }
    }

    public appendTo(container: Element | null) {
        if (container) {
            container.appendChild(this.element);
        }
    }

    public updateContent(contentTypeJson?: string, runtimeContext: WidgetRuntimeContext = {}): void {
        if (!contentTypeJson) {
            return;
        }

        this.cleanupMountedWidget();

        this.element.innerHTML = this.renderControls(true);
        this.element.dataset.widgetMountState = "mounting";

        this.mountedWidget = mountWidgetContent(this.element, this.plugin, contentTypeJson, {
            placement: "sidebar",
            deviceViewContext: this.deviceViewContext,
            ...runtimeContext,
        });
        this.element.dataset.widgetMountState = this.mountedWidget ? "ready" : "failed";

        // 重新绑定按钮事件（如果需要）
        this.setupEventListeners();
    }
}
