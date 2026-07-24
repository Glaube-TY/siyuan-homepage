import { svelteDialog } from "../../../libs/dialog";
import WidgetBlockStyle from "./styleSetting.svelte";
import WidgetBlockContent from "./contentSetting.svelte";
import { setBlockSize } from "./utils/block-size-handler";
import { mountWidgetContent, type WidgetRuntimeContext } from "./widgetMountRegistry";
import { mount, unmount } from "svelte";
import { deleteWidgetFromSurface, loadWidgetLayoutSettings, stringifyWidgetConfigForMount, normalizeWidgetConfigData } from "./utils/layout-shared";
import { renderSiyuanIcon } from "@/components/tools/siyuanIcon";
import { showMessage } from "siyuan";
import type { HomepageLayoutRuntimeOptions } from "./utils/layout-handler";
import { saveWidgetContentPreservingSize } from "./styleUtils";
import { createWidgetInstanceId, loadWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";

export class WidgetBlock {
    public element: HTMLElement;
    public readonly id: string;
    public style: string;
    public loadcontent: string;
    public widgetLayoutNumber: number = 4;

    private readonly plugin: any;
    private readonly currentBlockForSettingsRef: { value: HTMLElement | null };
    private runtimeOptions: HomepageLayoutRuntimeOptions;
    private mountedWidget: Record<string, any> | null = null;
    private isNewInstance: boolean;
    /** 当前 WidgetBlock 的新组件草稿配置是否已经持久化（create 成功）。用于布局提交失败后可安全重试。 */
    private draftConfigPersisted: boolean = false;

    constructor(
        plugin: any,
        currentBlockForSettingsRef: { value: HTMLElement | null },
        id?: string,
        style?: string,
        loadcontent?: string,
        runtimeOptions: HomepageLayoutRuntimeOptions = {},
    ) {
        this.isNewInstance = !id;
        this.id = id || createWidgetInstanceId();
        this.plugin = plugin;
        this.currentBlockForSettingsRef = currentBlockForSettingsRef;
        this.runtimeOptions = runtimeOptions;
        this.runtimeOptions.deviceViewContext ||= getCurrentDeviceViewContext(plugin, "desktop-homepage");
        this.style = style || 'aspect-ratio: 1 / 1;background-color: rgba(0, 0, 0, 0.03);draggable: true;border: 2px solid var(--b3-theme-primary);box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);transition: all 0.2s ease-in-out;border-radius: 8px;';
        this.loadcontent = loadcontent || '';

        // 从当前设备 desktop-homepage/layout.json 读取列数。
        loadWidgetLayoutSettings(plugin, runtimeOptions, runtimeOptions.deviceViewContext).then((settings) => {
            this.widgetLayoutNumber = settings.widgetLayoutNumber;
        });

        this.element = document.createElement("div");
        this.element.className = "widget-block";
        this.element.id = this.id;
        this.element.dataset.widgetMountState = "idle";
        if (this.isNewInstance) {
            this.element.dataset.widgetDraft = "true";
        }

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

    /**
     * 只反映 Svelte 实例是否已经成功挂载。
     * 布局恢复用它区分“完整组件”和“只有外壳的占位块”，避免重建正在运行的组件。
     */
    public hasMountedContent(): boolean {
        return this.mountedWidget !== null && this.element.dataset.widgetMountState === "ready";
    }

    public isRuntimeForSection(sectionId: string | null, context: DeviceViewContext): boolean {
        const currentSectionId = this.runtimeOptions.sectionId || null;
        const runtimeContext = this.runtimeOptions.deviceViewContext;
        return (
            currentSectionId === (sectionId || null)
            && runtimeContext?.scopeId === context.scopeId
            && runtimeContext?.surface === context.surface
        );
    }

    /** 仅用于可逆 DOM 事务保存当前运行上下文，不写入任何持久化文件。 */
    public getRuntimeOptionsSnapshot(): HomepageLayoutRuntimeOptions {
        return {
            sectionsEnabled: this.runtimeOptions.sectionsEnabled,
            sectionId: this.runtimeOptions.sectionId,
            deviceViewContext: this.runtimeOptions.deviceViewContext,
            componentSectionContainers: this.runtimeOptions.componentSectionContainers,
            preservedWidgetElements: this.runtimeOptions.preservedWidgetElements,
        };
    }

    public showMountError(message = "组件暂时无法加载，切换回此分栏时将重试"): void {
        this.cleanupMountedWidget();
        this.element.innerHTML = this.renderControls(true);
        const errorElement = document.createElement("div");
        errorElement.className = "homepage-widget-local-error";
        errorElement.setAttribute("role", "status");
        errorElement.textContent = message;
        this.element.appendChild(errorElement);
        this.element.dataset.widgetMountState = "failed";
        this.setupEventListeners();
    }

    /**
     * 只在组件内容缺失时挂载；已成功挂载的实例保持原样。
     * 容器不可见时等待可见后再挂载，避免 ECharts 等组件在零尺寸容器初始化。
     */
    public async ensureContentMounted(contentTypeJson?: string, runtimeContext: WidgetRuntimeContext = {}): Promise<boolean> {
        if (this.hasMountedContent()) {
            return true;
        }
        if (!contentTypeJson) {
            return false;
        }
        if (!this.isElementVisible()) {
            const visible = await this.waitForElementVisible();
            if (!visible) {
                return false;
            }
        }
        this.updateContent(contentTypeJson, runtimeContext);
        return this.hasMountedContent();
    }

    private isElementVisible(): boolean {
        return (
            this.element.isConnected
            && this.element.clientWidth > 0
            && this.element.clientHeight > 0
            && getComputedStyle(this.element).display !== "none"
        );
    }

    private waitForElementVisible(timeoutMs = 1000): Promise<boolean> {
        return new Promise((resolve) => {
            if (this.isElementVisible()) {
                resolve(true);
                return;
            }
            const observer = new ResizeObserver(() => {
                if (this.isElementVisible()) {
                    cleanup();
                    resolve(true);
                }
            });
            let rafId = 0;
            let timer = 0;
            const cleanup = () => {
                observer.disconnect();
                if (rafId) cancelAnimationFrame(rafId);
                if (timer) window.clearTimeout(timer);
            };
            observer.observe(this.element);
            rafId = requestAnimationFrame(() => {
                if (this.isElementVisible()) {
                    cleanup();
                    resolve(true);
                }
            });
            timer = window.setTimeout(() => {
                cleanup();
                resolve(this.isElementVisible());
            }, timeoutMs);
        });
    }

    /** 容器模式切换时沿用现有实例，并更新其后续保存、隐藏和移动所使用的分栏上下文。 */
    public async updateRuntimeOptions(runtimeOptions: HomepageLayoutRuntimeOptions): Promise<void> {
        const settings = await loadWidgetLayoutSettings(
            this.plugin,
            runtimeOptions,
            runtimeOptions.deviceViewContext,
        );
        this.runtimeOptions = { ...this.runtimeOptions, ...runtimeOptions };
        this.widgetLayoutNumber = settings.widgetLayoutNumber;
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
                                                        deviceViewContext: this.runtimeOptions.deviceViewContext,
                                                        blockElement: this.element,
                                                        onClose: () => {
                                                            dialogRef.close();
                                                        },
                                                        onDeleteFromCurrentSurface: async () => {
                                                            const result = await deleteWidgetFromSurface(
                                                                this.runtimeOptions.deviceViewContext!,
                                                                this.id,
                                                            );
                                                             if (result.status === "success" || result.status === "layoutCommittedConfigRetained") {
                                                                 try { this.cleanupMountedWidget(); } catch (e) { console.warn("[WidgetBlock] destroy failed after delete:", e); }
                                                                 this.element.remove();
                                                                 this.currentBlockForSettingsRef.value = null;
                                                                if (result.status === "layoutCommittedConfigRetained") {
                                                                    showMessage("组件已从主页移除，配置文件因保护性错误保留", 5000);
                                                                }
                                                            } else if (result.status === "notCommitted") {
                                                                showMessage(`组件删除失败（布局未提交）：${result.reason}`, 5000, "error");
                                                                return;
                                                            } else {
                                                                showMessage(`组件删除状态无法确认，请人工检查：${result.reason}`, 6000, "error");
                                                                return;
                                                            }
                                                            dialogRef.close();
                                                        },
                                                        onSetSize: async (size: number) => {
                                                            const layoutNumber = this.widgetLayoutNumber || 4;
                                                            await setBlockSize(this.currentBlockForSettingsRef.value, size, layoutNumber);
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
                                                        deviceViewContext: this.runtimeOptions.deviceViewContext,
                                                        onClose: () => {
                                                            dialogRef.close();
                                                        },
                                                        onConfirm: async (contentTypeJson: string) => {
                                                            this.updateContent(contentTypeJson);

                                                            // 新组件首次创建成功后，后续重试使用 save/update 模式，避免 create 重复导致文件已存在错误。
                                                            const shouldCreate = this.isNewInstance && !this.draftConfigPersisted;
                                                            await saveWidgetContentPreservingSize(
                                                                this.plugin,
                                                                this.id,
                                                                JSON.parse(contentTypeJson),
                                                                this.runtimeOptions.deviceViewContext!,
                                                                this.element,
                                                                shouldCreate,
                                                            );

                                                            // 配置已经持久化（create 或 save 成功），标记草稿已持久化。
                                                            // 后续再次确认即可安全走 save 分支，允许布局提交失败后重试。
                                                            this.draftConfigPersisted = true;

                                                            // 写后重新读取校验：失败时保留草稿，不提交布局引用。
                                                            const reloaded = await loadWidgetInstanceConfig(
                                                                this.runtimeOptions.deviceViewContext!,
                                                                this.id,
                                                            );
                                                            const normalized = normalizeWidgetConfigData(reloaded);
                                                            const hasValidType = normalized !== null
                                                                && typeof normalized.type === "string"
                                                                && normalized.type.trim().length > 0;
                                                            if (!hasValidType) {
                                                                return;
                                                            }

                                                            // 仅新组件需要把写后验证通过的组件提交到当前分栏/全局布局。
                                                            // 已有组件编辑成功即可关闭对话框，不依赖布局签名更新。
                                                            if (this.isNewInstance && this.runtimeOptions.onFirstContentCommitted) {
                                                                const committed = await this.runtimeOptions.onFirstContentCommitted(
                                                                    this.id,
                                                                    this.runtimeOptions,
                                                                );
                                                                if (!committed) {
                                                                    // 布局提交失败：保持 widgetDraft、isNewInstance 与 draftConfigPersisted，允许用户重试。
                                                                    return;
                                                                }
                                                            }

                                                            this.isNewInstance = false;
                                                            this.draftConfigPersisted = false;
                                                            delete this.element.dataset.widgetDraft;
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
                const widgetConfig = await loadWidgetInstanceConfig(this.runtimeOptions.deviceViewContext!, this.id);
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

        try {
            this.mountedWidget = mountWidgetContent(this.element, this.plugin, contentTypeJson, {
                deviceViewContext: this.runtimeOptions.deviceViewContext,
                ...runtimeContext,
            });
            this.element.dataset.widgetMountState = this.mountedWidget ? "ready" : "failed";
        } catch (error) {
            this.mountedWidget = null;
            this.element.dataset.widgetMountState = "failed";
            throw error;
        } finally {
            // 内容替换后按钮节点也已替换，需要重新绑定事件。
            this.setupEventListeners();
        }
    }
}
